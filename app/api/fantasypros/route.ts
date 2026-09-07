const API_ROOT = 'https://api.fantasypros.com/public/v2/json';
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST']);

type JsonRecord = Record<string, unknown>;

function records(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== 'object') return [] as JsonRecord[];
  const object = payload as JsonRecord;
  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object');
  }
  return [] as JsonRecord[];
}

function numberValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(...values: unknown[]) {
  return values.find((value) => typeof value === 'string' && value.trim())?.toString().trim() ?? '';
}

function idValue(...values: unknown[]) {
  const value = values.find((candidate) => (typeof candidate === 'string' && candidate.trim()) || typeof candidate === 'number');
  return value === undefined ? '' : String(value).trim();
}

function playerKey(player: JsonRecord) {
  const id = player.fpid ?? player.player_id ?? player.id;
  if (id !== undefined && id !== null && String(id)) return `id:${String(id)}`;
  return `name:${textValue(player.player_name, player.name).toLowerCase()}`;
}

function rankMap(payload: unknown) {
  const map = new Map<string, JsonRecord>();
  const rows = records(payload, ['players', 'items', 'rankings', 'injuries']);
  rows.sort((a,b) => String(b.created ?? '').localeCompare(String(a.created ?? '')));
  for (const player of rows) if (!map.has(playerKey(player))) map.set(playerKey(player), player);
  return map;
}

function timestamp(value: unknown) {
  if (!value) return undefined;
  const numeric=typeof value==='number'||/^\d{10,13}$/.test(String(value))?Number(value):undefined;
  const raw = numeric!==undefined ? numeric * (numeric < 1e12 ? 1000 : 1) : String(value).replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, '$1T$2Z');
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function projectionPoints(player: JsonRecord, scoring: string) {
  const stats = player.stats && typeof player.stats === 'object' ? player.stats as JsonRecord : player;
  const receptions=stats.rec??stats.rec_rec;
  if (scoring === 'PPR') return numberValue(stats.points_ppr ?? stats.fantasy_points_ppr ?? (receptions!=null&&stats.points!=null?Number(stats.points)+Number(receptions):undefined), 0);
  if (scoring === 'HALF') return numberValue(stats.points_half ?? stats.fantasy_points_half ?? (receptions!=null&&stats.points!=null?Number(stats.points)+Number(receptions)*.5:undefined), 0);
  return numberValue(stats.points ?? stats.fantasy_points ?? stats.points_std, 0);
}

async function fantasyProsFetch(path: string, apiKey: string) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { Accept: 'application/json', 'x-api-key': apiKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`FantasyPros returned HTTP ${response.status} for ${path.split('?')[0]}.`);
  }
  return response.json() as Promise<unknown>;
}

export async function GET(request: Request) {
  const apiKey = process.env.FANTASYPROS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({
      configured: false,
      error: 'FantasyPros is ready to connect, but its API key has not been added to this site yet.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const url = new URL(request.url);
  const season = Number(url.searchParams.get('season'));
  const scoring = textValue(url.searchParams.get('scoring')).toUpperCase();
  if (!Number.isInteger(season) || season < 2024 || season > 2100) {
    return Response.json({ error: 'Enter a valid NFL season.' }, { status: 400 });
  }
  if (!['STD', 'HALF', 'PPR'].includes(scoring)) {
    return Response.json({ error: 'Scoring must be STD, HALF, or PPR.' }, { status: 400 });
  }

  // ALL is a draft position; the API's current-week default can reject it.
  const query = `week=0&scoring=${encodeURIComponent(scoring)}`;
  const endpointResults = await Promise.allSettled([
    fantasyProsFetch('/nfl/players', apiKey),
    fantasyProsFetch(`/nfl/${season}/projections?positions=QB:RB:WR:TE:K:DST&${query}`, apiKey),
    fantasyProsFetch(`/nfl/${season}/consensus-rankings?position=ALL&${query}`, apiKey),
    fantasyProsFetch(`/nfl/${season}/consensus-rankings?position=ALL&type=DK&${query}`, apiKey),
    fantasyProsFetch(`/nfl/${season}/consensus-rankings?position=ALL&type=ADP&${query}`, apiKey),
    fantasyProsFetch(`/nfl/injuries?season=${season}`, apiKey),
    fantasyProsFetch('/nfl/news?limit=100', apiKey),
  ]);

  const [playerResult, projectionResult, redraftResult, dynastyResult, adpResult, injuryResult, newsResult] = endpointResults;
  if (playerResult.status === 'rejected') {
    return Response.json({ configured: true, error: playerResult.reason instanceof Error ? playerResult.reason.message : 'FantasyPros player data was unavailable.' }, { status: 502 });
  }

  const projectionById = projectionResult.status === 'fulfilled' ? rankMap(projectionResult.value) : new Map<string, JsonRecord>();
  const redraftById = redraftResult.status === 'fulfilled' ? rankMap(redraftResult.value) : new Map<string, JsonRecord>();
  const dynastyById = dynastyResult.status === 'fulfilled' ? rankMap(dynastyResult.value) : new Map<string, JsonRecord>();
  const adpById = adpResult.status === 'fulfilled' ? rankMap(adpResult.value) : new Map<string, JsonRecord>();
  const injuryById = injuryResult.status === 'fulfilled' ? rankMap(injuryResult.value) : new Map<string, JsonRecord>();
  const newsById = newsResult.status === 'fulfilled' ? rankMap(newsResult.value) : new Map<string, JsonRecord>();

  const players = records(playerResult.value, ['players', 'items']).map((player) => {
    const key = playerKey(player);
    const projection = projectionById.get(key) ?? {};
    const redraft = redraftById.get(key) ?? {};
    const dynasty = dynastyById.get(key) ?? {};
    const adp = adpById.get(key) ?? {};
    const injury = injuryById.get(key) ?? {};
    const news = newsById.get(key) ?? {};
    const name = textValue(player.player_name, player.name, redraft.player_name, projection.name);
    const rawPosition = textValue(player.position_id, player.player_position_id, redraft.player_position_id, projection.position_id).split(',')[0].toUpperCase();
    const id = idValue(player.fpid, player.player_id, player.id) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const consensusRank = numberValue(redraft.rank_ecr ?? redraft.rank, 999);
    const dynastyRank = numberValue(dynasty.rank_ecr ?? dynasty.rank, 999);
    const averageDraftPosition = numberValue(adp.rank_adp ?? adp.rank_ave ?? adp.rank_ecr ?? redraft.rank_adp, 999);
    const tier = numberValue(redraft.tier, Math.max(1, Math.ceil(consensusRank / 12)));
    const stats = Object.fromEntries(Object.entries(projection.stats && typeof projection.stats === 'object' ? projection.stats : {}).filter(([,v]) => v !== null && v !== '' && Number.isFinite(Number(v))).map(([k,v]) => [k, Number(v)]));
    // Public API uses rec_rec for receptions and fumbles for the FL projection column.
    if(stats.rec===undefined&&stats.rec_rec!==undefined)stats.rec=stats.rec_rec;
    if(stats.fumbles_lost===undefined&&stats.fumbles!==undefined)stats.fumbles_lost=stats.fumbles;
    const fetchedAt = new Date().toISOString();
    const projectionMeta = projectionResult.status === 'fulfilled' ? projectionResult.value as JsonRecord : {};
    return {
      id: `fp-${id}`,
      name,
      pos: rawPosition,
      team: textValue(projection.team_id, redraft.player_team_id, player.team_id, player.player_team_id) || 'FA',
      projectedPoints: Math.round(projectionPoints(projection, scoring) * 10) / 10,
      pointsByScoring: { standard: projectionPoints(projection, 'STD'), 'half-ppr': projectionPoints(projection, 'HALF'), ppr: projectionPoints(projection, 'PPR') },
      stats,
      projectionScoring: scoring === 'PPR' ? 'ppr' : scoring === 'HALF' ? 'half-ppr' : 'standard',
      projectionUpdatedAt: timestamp(projection.updated_at ?? projectionMeta.last_updated_ts ?? projectionMeta.updated_at),
      rankingsUpdatedAt: timestamp(redraftResult.status==='fulfilled'?(redraftResult.value as JsonRecord).last_updated_ts:undefined),
      rankingsScoring: scoring === 'PPR' ? 'ppr' : scoring === 'HALF' ? 'half-ppr' : 'standard',
      fetchedAt,
      season,
      hasProjection: projectionById.has(key),
      active: projectionById.has(key) || redraftById.has(key) || dynastyById.has(key) || adpById.has(key),
      adpSource: adp.rank_adp != null || adp.rank_ave != null ? 'average' : averageDraftPosition < 999 ? 'rank-proxy' : 'missing',
      adpStdDev: numberValue(adp.rank_std, 0) || undefined,
      rankStdDev: numberValue(redraft.rank_std, 0) || undefined,
      rankBest: numberValue(redraft.rank_min, 0) || undefined,
      rankWorst: numberValue(redraft.rank_max, 0) || undefined,
      adp: Math.round(averageDraftPosition * 10) / 10,
      age: numberValue(player.age, 27),
      dynastyRank: Math.round(dynastyRank),
      consensusRank: Math.round(consensusRank),
      tier: Math.max(1, Math.round(tier)),
      bye: numberValue(redraft.player_bye_week ?? player.bye_week ?? player.player_bye_week, 0),
      injuryStatus: textValue(injury.status, injury.injury_status, injury.player_status, player.injury_status) || undefined,
      newsHeadline: textValue(news.title) || undefined,
      newsBody: textValue(news.impact, news.desc) || undefined,
      newsUpdatedAt: timestamp(news.created ?? news.datetime),
    };
  }).filter((player) => player.name && POSITIONS.has(player.pos) && (
    player.team !== 'FA' || player.projectedPoints > 0 || player.consensusRank < 999 || player.dynastyRank < 999 || player.adp < 999
  ));

  const warnings = endpointResults.slice(1).flatMap((result, index) => result.status === 'rejected' ? [`${['Projections', 'Redraft rankings', 'Dynasty rankings', 'ADP', 'Injuries', 'News'][index]} could not be refreshed. ${result.reason instanceof Error ? result.reason.message : ''}`] : []);
  if (!injuryById.size) warnings.push('No injury records received; absence of a designation does not establish health.');
  if (!newsById.size) warnings.push('No player news received.');
  const coverage = { projections: projectionById.size, redraft: redraftById.size, dynasty: dynastyById.size, adp: adpById.size };
  if (projectionResult.status === 'rejected' || redraftResult.status === 'rejected' || dynastyResult.status === 'rejected') {
    return Response.json({
      configured: true,
      code: 'upstream_error',
      error: `FantasyPros player data was received, but required draft data failed. ${warnings.join(' ')}`,
      receivedPlayers: players.length, coverage, warnings,
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  if (players.length < 100 || coverage.projections < 100 || coverage.redraft < 100 || coverage.dynasty < 100) {
    return Response.json({
      configured: true,
      code: 'incomplete_data',
      error: `FantasyPros returned an incomplete draft dataset (${players.length} players, ${coverage.projections} projections, ${coverage.redraft} redraft and ${coverage.dynasty} dynasty rankings). This may be limited API access or unavailable season data; your saved board has been retained.`,
      receivedPlayers: players.length,
      coverage,
      warnings,
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({
    configured: true,
    source: 'FantasyPros',
    season,
    scoring,
    updatedAt: new Date().toISOString(),
    players,
    coverage,
    warnings,
  }, { headers: { 'Cache-Control': 'private, max-age=900, stale-while-revalidate=21600' } });
}

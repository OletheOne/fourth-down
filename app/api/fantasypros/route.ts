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
  return new Map(records(payload, ['players', 'items', 'rankings']).map((player) => [playerKey(player), player]));
}

function projectionPoints(player: JsonRecord, scoring: string) {
  const stats = player.stats && typeof player.stats === 'object' ? player.stats as JsonRecord : player;
  if (scoring === 'PPR') return numberValue(stats.points_ppr ?? stats.fantasy_points_ppr ?? stats.points, 0);
  if (scoring === 'HALF') return numberValue(stats.points_half ?? stats.fantasy_points_half ?? stats.points, 0);
  return numberValue(stats.points ?? stats.fantasy_points ?? stats.points_std, 0);
}

async function fantasyProsFetch(path: string, apiKey: string) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { Accept: 'application/json', 'x-api-key': apiKey },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`FantasyPros returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
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

  const query = `scoring=${encodeURIComponent(scoring)}`;
  const endpointResults = await Promise.allSettled([
    fantasyProsFetch('/nfl/players', apiKey),
    fantasyProsFetch(`/nfl/${season}/projections?week=0&positions=QB:RB:WR:TE:K:DST&${query}`, apiKey),
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
    const consensusRank = numberValue(redraft.rank_ecr ?? redraft.rank ?? player.rank_ecr, 999);
    const dynastyRank = numberValue(dynasty.rank_ecr ?? dynasty.rank ?? player.rank_ecr_dynasty, 999);
    const averageDraftPosition = numberValue(adp.rank_adp ?? adp.rank_ecr ?? adp.rank ?? redraft.rank_adp ?? player.rank_adp, 999);
    const tier = numberValue(dynasty.tier ?? redraft.tier, Math.max(1, Math.ceil(Math.min(dynastyRank, consensusRank, 999) / 12)));
    return {
      id: `fp-${id}`,
      name,
      pos: rawPosition,
      team: textValue(player.team_id, player.player_team_id, redraft.player_team_id, projection.team_id) || 'FA',
      projectedPoints: Math.round(projectionPoints(projection, scoring) * 10) / 10,
      adp: Math.round(averageDraftPosition * 10) / 10,
      age: numberValue(player.age, 27),
      dynastyRank: Math.round(dynastyRank),
      consensusRank: Math.round(consensusRank),
      tier: Math.max(1, Math.round(tier)),
      bye: numberValue(player.bye_week ?? player.player_bye_week, 0),
      injuryStatus: textValue(injury.status, injury.injury_status, injury.player_status, player.injury_status) || undefined,
      newsHeadline: textValue(news.title) || undefined,
      newsUpdatedAt: textValue(news.created_formated, news.created, news.datetime) || undefined,
    };
  }).filter((player) => player.name && POSITIONS.has(player.pos) && (
    player.team !== 'FA' || player.projectedPoints > 0 || player.consensusRank < 999 || player.dynastyRank < 999 || player.adp < 999
  ));

  const warnings = endpointResults.slice(1).flatMap((result, index) => result.status === 'rejected' ? [`${['Projections', 'Redraft rankings', 'Dynasty rankings', 'ADP', 'Injuries', 'News'][index]} could not be refreshed.`] : []);
  const missingCoreRankings = redraftResult.status === 'rejected' || dynastyResult.status === 'rejected';
  if (players.length < 100 || missingCoreRankings) {
    return Response.json({
      configured: true,
      code: 'sample_access',
      error: `This FantasyPros key returned ${players.length} sample players instead of the production draft pool. Activate API access through a paid FantasyPros HOF membership, then refresh again.`,
      receivedPlayers: players.length,
      warnings,
    }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({
    configured: true,
    source: 'FantasyPros',
    season,
    scoring,
    updatedAt: new Date().toISOString(),
    players,
    warnings,
  }, { headers: { 'Cache-Control': 'private, max-age=900, stale-while-revalidate=21600' } });
}

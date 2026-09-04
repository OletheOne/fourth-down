const positionById: Record<number, string> = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };
const proTeamById: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
  17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
  25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

type EspnPlayer = {
  id?: number;
  fullName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
  age?: number;
  ownership?: { averageDraftPosition?: number };
  stats?: Array<{ statSourceId?: number; statSplitTypeId?: number; appliedTotal?: number }>;
};

type EspnTeam = { id?: number; location?: string; nickname?: string; name?: string };
type EspnPick = { playerId?: number; teamId?: number; overallPickNumber?: number; keeper?: boolean };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const leagueId = url.searchParams.get('leagueId')?.trim();
  const season = Number(url.searchParams.get('season'));
  if (!leagueId || !/^\d+$/.test(leagueId)) return Response.json({ error: 'Enter the numeric ESPN League ID.' }, { status: 400 });
  if (!Number.isInteger(season) || season < 2020 || season > 2100) return Response.json({ error: 'Enter a valid season.' }, { status: 400 });

  const endpoint = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`;
  const playerFilter = JSON.stringify({ players: { filterStatus: { value: ['FREEAGENT', 'WAIVERS', 'ONTEAM'] }, limit: 2000, sortPercOwned: { sortPriority: 1, sortAsc: false } } });
  try {
    const [leagueResponse, playerResponse] = await Promise.all([
      fetch(`${endpoint}?view=mSettings&view=mTeam&view=mRoster&view=mDraftDetail`, { headers: { Accept: 'application/json' } }),
      fetch(`${endpoint}?view=kona_player_info`, { headers: { Accept: 'application/json', 'X-Fantasy-Filter': playerFilter } }),
    ]);
    if (leagueResponse.status === 401 || leagueResponse.status === 403) return Response.json({ error: 'This ESPN league is private, so ESPN requires an authenticated session. Use the Keepers and Picks tabs for fast manual entry; Fourth Down never asks for ESPN cookies.' }, { status: 403 });
    if (!leagueResponse.ok) return Response.json({ error: `ESPN returned ${leagueResponse.status}. Check the League ID and season.` }, { status: 502 });
    if (!leagueResponse.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'ESPN returned a sign-in page instead of league data. This usually means the league is private; use fast manual entry instead.' }, { status: 403 });

    const league = await leagueResponse.json() as {
      settings?: { name?: string; size?: number; scoringSettings?: { scoringItems?: Array<{ statId?: number; points?: number }> } };
      teams?: EspnTeam[];
      draftDetail?: { draftOrder?: Record<string, number>; picks?: EspnPick[] };
    };
    const playerPayload = playerResponse.ok ? await playerResponse.json() as { players?: Array<{ player?: EspnPlayer }> } : { players: [] };
    const rawPlayers = (playerPayload.players ?? []).map((entry) => entry.player).filter(Boolean) as EspnPlayer[];
    const playerById = new Map(rawPlayers.map((player) => [player.id, player]));
    const teamById = new Map((league.teams ?? []).map((team) => [team.id, team]));
    const draftOrder = league.draftDetail?.draftOrder ?? {};
    const orderedTeams = (league.teams ?? []).map((team) => ({
      id: team.id ?? 0,
      name: team.name || `${team.location ?? ''} ${team.nickname ?? ''}`.trim() || `Team ${team.id ?? ''}`,
      slot: Number(draftOrder[String(team.id)] ?? team.id ?? 99),
    })).sort((a, b) => a.slot - b.slot);

    const players = rawPlayers.filter((player) => player.id && player.fullName && positionById[player.defaultPositionId ?? -1]).map((player) => {
      const projection = player.stats?.find((stat) => stat.statSourceId === 1 && stat.statSplitTypeId === 0)?.appliedTotal ?? 0;
      const adp = player.ownership?.averageDraftPosition ?? 999;
      return {
        espnId: String(player.id), name: player.fullName, pos: positionById[player.defaultPositionId ?? -1],
        team: proTeamById[player.proTeamId ?? -1] ?? 'FA', projectedPoints: Math.round(projection * 10) / 10,
        adp: Math.round(adp * 10) / 10, age: player.age ?? 26,
      };
    });
    const picks = (league.draftDetail?.picks ?? []).filter((pick) => pick.playerId && pick.teamId).map((pick) => {
      const player = playerById.get(pick.playerId);
      const team = teamById.get(pick.teamId);
      return {
        espnId: String(pick.playerId), playerName: player?.fullName ?? null,
        owner: team?.name || `${team?.location ?? ''} ${team?.nickname ?? ''}`.trim() || `Team ${pick.teamId}`,
        pick: pick.overallPickNumber ?? 0, kind: pick.keeper ? 'keeper' : 'draft',
      };
    }).filter((pick) => pick.playerName);
    const receptionPoints = league.settings?.scoringSettings?.scoringItems?.find((item) => item.statId === 53)?.points ?? 0;
    const scoring = receptionPoints >= 0.75 ? 'ppr' : receptionPoints >= 0.25 ? 'half-ppr' : 'standard';

    return Response.json({
      league: { id: leagueId, season, name: league.settings?.name ?? 'ESPN League', size: league.settings?.size ?? orderedTeams.length, scoring },
      teams: orderedTeams.map((team) => team.name), players, picks,
      warnings: playerResponse.ok ? [] : ['ESPN league settings loaded, but the player pool was not available.'],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Could not reach ESPN. Try again in a moment or continue with manual entry.' }, { status: 502 });
  }
}

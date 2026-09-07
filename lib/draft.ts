export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';

export type Player = {
  id: string;
  espnId?: string;
  name: string;
  pos: Position;
  team: string;
  projectedPoints: number;
  adp: number;
  age: number;
  dynastyRank: number;
  consensusRank?: number;
  tier: number;
  bye: number;
  injuryStatus?: string;
  newsHeadline?: string;
  newsUpdatedAt?: string;
  newsBody?: string;
  pointsByScoring?: Partial<Record<LeagueSettings['scoring'], number>>;
  stats?: Record<string, number>;
  projectionScoring?: LeagueSettings['scoring'];
  projectionUpdatedAt?: string;
  rankingsUpdatedAt?: string;
  rankingsScoring?: LeagueSettings['scoring'];
  fetchedAt?: string;
  season?: number;
  rankStdDev?: number;
  rankBest?: number;
  rankWorst?: number;
  adpStdDev?: number;
  adpSource?: 'average' | 'rank-proxy' | 'missing';
  active?: boolean;
  hasProjection?: boolean;
  expectedGames?: number;
  risk?: { missedGames?: number; volatility?: number; note?: string; projectionIncludesAbsence?: boolean };
};

export type DraftedPlayer = {
  playerId: string;
  playerName?: string;
  owner: string;
  pick: number;
  kind: 'keeper' | 'draft';
  originalRound?: number;
  seasonsKept?: number;
  costRound?: number;
};

export type LeagueSettings = {
  userTeam: string;
  draftSlot: number;
  scoring: 'standard' | 'half-ppr' | 'ppr';
  mode: 'contend' | 'balanced' | 'rebuild';
  starters: Record<Position | 'FLEX', number>;
  superflex?: number;
  bench?: number;
  positionLimits?: Partial<Record<Position, number>>;
  customScoring?: Record<string, number>;
  positionScoring?: Partial<Record<Position, Record<string, number>>>;
  rulesConfirmed?: boolean;
  keeperRules?: { limit: number; escalation: number; horizon: number; discount: number; firstRound: 'ineligible' | 'round-one'; collision: 'earlier' | 'reject' };
  riskTolerance?: number;
  simulations?: number;
};

const makeId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const demoPlayers: Player[] = [
  ['Ja’Marr Chase', 'WR', 'CIN', 298, 1.4, 26, 1, 1, 10],
  ['Bijan Robinson', 'RB', 'ATL', 282, 2.1, 24, 2, 1, 12],
  ['Justin Jefferson', 'WR', 'MIN', 286, 3.0, 27, 3, 1, 6],
  ['CeeDee Lamb', 'WR', 'DAL', 279, 4.5, 27, 5, 1, 10],
  ['Jahmyr Gibbs', 'RB', 'DET', 272, 5.2, 24, 4, 1, 8],
  ['Puka Nacua', 'WR', 'LAR', 268, 7.1, 25, 6, 2, 8],
  ['Malik Nabers', 'WR', 'NYG', 261, 8.6, 23, 7, 2, 14],
  ['Amon-Ra St. Brown', 'WR', 'DET', 267, 9.4, 27, 8, 2, 8],
  ['Brock Bowers', 'TE', 'LV', 235, 10.2, 23, 9, 1, 10],
  ['Josh Allen', 'QB', 'BUF', 356, 11.3, 30, 10, 1, 7],
  ['Nico Collins', 'WR', 'HOU', 251, 12.5, 27, 12, 2, 6],
  ['Saquon Barkley', 'RB', 'PHI', 260, 13.1, 29, 22, 2, 9],
  ['Lamar Jackson', 'QB', 'BAL', 348, 14.6, 29, 13, 1, 7],
  ['Brian Thomas Jr.', 'WR', 'JAX', 245, 15.2, 23, 11, 2, 8],
  ['Drake London', 'WR', 'ATL', 239, 17.4, 25, 14, 3, 12],
  ['De’Von Achane', 'RB', 'MIA', 242, 18.2, 24, 15, 2, 12],
  ['Breece Hall', 'RB', 'NYJ', 238, 20.4, 25, 17, 2, 9],
  ['Trey McBride', 'TE', 'ARI', 216, 21.0, 26, 16, 1, 8],
  ['A.J. Brown', 'WR', 'PHI', 241, 22.5, 29, 24, 3, 9],
  ['Jayden Daniels', 'QB', 'WAS', 337, 23.7, 25, 18, 2, 12],
  ['Jonathan Taylor', 'RB', 'IND', 236, 24.5, 27, 27, 3, 11],
  ['Garrett Wilson', 'WR', 'NYJ', 231, 26.1, 26, 20, 3, 9],
  ['Jaxon Smith-Njigba', 'WR', 'SEA', 227, 27.4, 24, 19, 3, 8],
  ['Josh Jacobs', 'RB', 'GB', 232, 28.6, 28, 32, 3, 10],
  ['Tee Higgins', 'WR', 'CIN', 224, 30.2, 27, 26, 4, 10],
  ['Kyren Williams', 'RB', 'LAR', 229, 31.7, 26, 29, 3, 8],
  ['Sam LaPorta', 'TE', 'DET', 195, 33.1, 25, 23, 2, 8],
  ['Joe Burrow', 'QB', 'CIN', 322, 34.8, 29, 25, 2, 10],
  ['Ladd McConkey', 'WR', 'LAC', 218, 36.0, 24, 21, 4, 12],
  ['James Cook', 'RB', 'BUF', 220, 38.2, 26, 35, 4, 7],
  ['George Kittle', 'TE', 'SF', 201, 40.0, 32, 54, 2, 14],
  ['Jalen Hurts', 'QB', 'PHI', 325, 41.2, 28, 31, 2, 9],
  ['Davante Adams', 'WR', 'LAR', 207, 44.0, 33, 78, 5, 8],
  ['Kenneth Walker III', 'RB', 'SEA', 211, 45.5, 25, 34, 4, 8],
  ['Marvin Harrison Jr.', 'WR', 'ARI', 210, 46.1, 24, 28, 4, 8],
  ['Patrick Mahomes', 'QB', 'KC', 308, 49.0, 30, 37, 3, 10],
].map(([name, pos, team, projectedPoints, adp, age, dynastyRank, tier, bye]) => ({
  id: makeId(name as string), name: name as string, pos: pos as Position, team: team as string,
  projectedPoints: projectedPoints as number, adp: adp as number, age: age as number,
  dynastyRank: dynastyRank as number, tier: tier as number, bye: bye as number,
}));


export type Recommendation = Player & {
  score: number;
  components: { winNow: number; dynasty: number; scarcity: number; rosterFit: number; urgency: number };
  rationale: string[];
};


export function estimateNextPick(currentPick: number, slot: number, teams = 12) {
  for (let pick = currentPick + 1; pick <= currentPick + teams * 2; pick++) {
    const round = Math.floor((pick - 1) / teams);
    const owner = round % 2 === 0 ? (pick - 1) % teams + 1 : teams - (pick - 1) % teams;
    if (owner === slot) return pick;
  }
  return currentPick + teams * 2;
}

export { analyzeDraft, rankAvailable } from './optimizer';

export function parsePlayerCsv(raw: string): Player[] {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('Add a header row and at least one player.');
  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const required = ['name', 'pos', 'team', 'projectedpoints', 'adp', 'age', 'dynastyrank', 'tier', 'bye'];
  if (required.some((field) => !headers.includes(field))) throw new Error(`Required columns: ${required.join(', ')}`);
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const value = (key: string) => cells[headers.indexOf(key)];
    const pos = value('pos').toUpperCase() as Position;
    if (!['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(pos)) throw new Error(`Invalid position on row ${index + 2}.`);
    return { id: makeId(value('name')), name: value('name'), pos, team: value('team').toUpperCase(), projectedPoints: Number(value('projectedpoints')), adp: Number(value('adp')), age: Number(value('age')), dynastyRank: Number(value('dynastyrank')), tier: Number(value('tier')), bye: Number(value('bye')) };
  });
}

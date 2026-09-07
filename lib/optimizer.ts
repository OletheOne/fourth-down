import type { Player, DraftedPlayer, LeagueSettings, Position, Recommendation } from './draft';
import { estimateBonuses } from './bonus-scoring';

export const ENGINE_VERSION = 'roster-lookahead-3';
const POS: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const flex = new Set<Position>(['RB', 'WR', 'TE']);
const finite = (x: unknown, fallback = 0): number => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
const bounded = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
export const nameKey = (s = '') => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
export const DEFAULT_KEEPER_RULES = { limit: 3, escalation: 1, horizon: 3, discount: 0.65, firstRound: 'ineligible' as const, collision: 'earlier' as const };
export function keeperCost(originalRound: number | undefined, seasonsKept: number | undefined, s: LeagueSettings): number | undefined {
  if (!originalRound) return undefined;
  const rules={...DEFAULT_KEEPER_RULES,...s.keeperRules}; const round=originalRound-(seasonsKept??1)*rules.escalation;
  return round<1 ? rules.firstRound==='round-one'?1:undefined : round;
}
export function resolveKeeperContracts(entries: DraftedPlayer[], s: LeagueSettings, teams: string[]): DraftedPlayer[] {
  const rules={...DEFAULT_KEEPER_RULES,...s.keeperRules}; const owners=new Map<string,Set<number>>();const counts=new Map<string,number>();const ids=new Set<string>();
  return entries.map(entry=>{
    const owner=teams.find(t=>nameKey(t)===nameKey(entry.owner));if(!owner)throw Error(`Unknown keeper team: ${entry.owner}`);
    const identity=nameKey(entry.playerName??entry.playerId);if(ids.has(identity))throw Error(`Duplicate keeper: ${entry.playerName??entry.playerId}`);ids.add(identity);
    const count=(counts.get(owner)??0)+1;counts.set(owner,count);if(count>rules.limit)throw Error(`${owner} exceeds the ${rules.limit}-keeper limit.`);
    let costRound=entry.costRound??keeperCost(entry.originalRound,entry.seasonsKept,s);
    if(!costRound&&entry.originalRound)throw Error(`${entry.playerName} is not eligible under the configured round-one rule. Confirm the rule or provide the commissioner's explicit cost.`);
    if(!costRound)return {...entry,owner};if(costRound>rosterSize(normalizeSettings(s)))throw Error(`${entry.playerName}'s cost exceeds the draft length.`);
    const used=owners.get(owner)??new Set<number>();if(rules.collision==='earlier')while(costRound>0&&used.has(costRound))costRound--;
    if(costRound<1||used.has(costRound))throw Error(`${owner} has conflicting keeper round costs.`);used.add(costRound);owners.set(owner,used);
    return {...entry,owner,costRound};
  });
}
export const STAT_LABELS: Record<string, string> = { pass_yds: 'Passing yards', pass_tds: 'Passing TDs', pass_ints: 'Interceptions', rush_yds: 'Rushing yards', rush_tds: 'Rushing TDs', rec: 'Receptions', rec_yds: 'Receiving yards', rec_tds: 'Receiving TDs', fumbles_lost: 'Fumbles lost' };
// FantasyPros' baseline, NOT an assumption about the user's ESPN scoring.
// https://www.fantasypros.com/scoring-settings/ (INT = -1, FL = -2).
export const STANDARD_SCORING: Record<string, number> = { pass_yds: .04, pass_tds: 4, pass_ints: -1, rush_yds: .1, rush_tds: 6, rec: 0, rec_yds: .1, rec_tds: 6, fumbles_lost: -2, '2pt_tds':2, ret_tds:6, fg:3, xpt:1, def_sack:1, def_int:2, def_fr:2, def_safety:2, def_td:6, def_retd:6 };
export type DraftContext = { draftMode?: 'traditional' | 'keeper'; now?: number; seed?: number; season?: number; dataSource?: string; lastSync?: string; warnings?: string[]; rosters?: Array<{team:string;players:string[]}>; rostersAreCurrentDraft?: boolean };
export type EvaluatedPlayer = Player & { value: number; uncertainty: number; issues: string[]; estimatedBonusPoints?:number; bonusDetails?:string[] };
export type DraftRecommendation = Recommendation & { projectedValue: number; marginalPoints: number; replacementPoints: number; keeperValue: number; nextKeeperRound?: number; survival: number; nextOption?: string; nextPick?: number; plan: string[]; confidence: 'low' | 'medium' | 'high'; issues: string[]; spread: number; evaluated: boolean; baseline?: boolean; conservativeEdge?: number };
export type DraftAnalysis = { recommendations: DraftRecommendation[]; warnings: string[]; excluded: number; eligible: number; currentPick: number; targetPick?: number; nextPick?: number; simulations: number; candidateCount: number; openSlots: string[]; version: string; comparison?: string };

export function normalizeSettings(s: LeagueSettings): LeagueSettings {
  return { ...s, starters: Object.fromEntries([...POS, 'FLEX'].map(p => [p, bounded(Math.round(finite(s.starters?.[p as keyof typeof s.starters])), 0, 10)])) as LeagueSettings['starters'],
    bench: bounded(Math.round(finite(s.bench, 6)), 0, 20), superflex: bounded(Math.round(finite(s.superflex)), 0, 4),
    simulations: bounded(Math.round(finite(s.simulations, 12)), 4, 32), riskTolerance: bounded(finite(s.riskTolerance, .15), 0, 1),
    recommendationPolicy:s.recommendationPolicy==='lookahead'?'lookahead':'roster-value',
    keeperRules: { ...DEFAULT_KEEPER_RULES, ...s.keeperRules } };
}
export function rosterSize(s: LeagueSettings) { return Object.values(s.starters).reduce((a, b) => a + b, 0) + (s.superflex ?? 0) + (s.bench ?? 6); }
export function ownerAt(pick: number, teams: string[]) { const r = Math.floor((pick - 1) / teams.length); const i = (pick - 1) % teams.length; return teams[r % 2 ? teams.length - i - 1 : i]; }
export function keeperSlots(drafted: DraftedPlayer[], teams: string[]) {
  const slots = new Set<number>();
  for (const d of drafted) { if (d.kind !== 'keeper' || !d.costRound) continue; const i = teams.findIndex(t => nameKey(t) === nameKey(d.owner)); if (i < 0) continue; slots.add((d.costRound - 1) * teams.length + (d.costRound % 2 ? i + 1 : teams.length - i)); }
  return slots;
}

// No position-specific PPR bonus: scoring is applied once, from stat lines or the provider's matching total.
export function evaluatePlayer(p: Player, s: LeagueSettings, context: DraftContext = {}): EvaluatedPlayer {
  const issues: string[] = [];
  let points = p.pointsByScoring?.[s.scoring] ?? p.projectedPoints;
  const scoringOverrides={...s.customScoring,...s.positionScoring?.[p.pos]};
  if (Object.keys(scoringOverrides).length) {
    const base: Record<string, number> = { ...STANDARD_SCORING, rec: s.scoring === 'ppr' ? 1 : s.scoring === 'half-ppr' ? .5 : 0 };
    for (const [stat, weight] of Object.entries(scoringOverrides)) {
      const kind = stat.startsWith('def_') ? 'DST' : /^(fg|xpt|fga)/.test(stat) ? 'K' : 'offense';
      if (kind==='offense' && (p.pos==='K'||p.pos==='DST') || kind!=='offense' && p.pos!==kind) continue;
      if (!Number.isFinite(weight)) { issues.push(`Invalid scoring coefficient: ${stat}`); continue; }
      if (p.stats?.[stat] !== undefined) { points += p.stats[stat] * (weight - (base[stat] ?? 0)); if (weight !== (base[stat]??0) && p.stats[stat]===0 && /yds_\d|def_pa_|scrimage/.test(stat)) issues.push(`Unverified zero projection for bonus ${stat}; exact scoring cannot be established`); }
      else if (weight !== (base[stat] ?? 0)) issues.push(`Missing ${stat} projection; custom scoring incomplete`);
    }
  }
  const bonus=estimateBonuses(p,s);points+=bonus.points;issues.push(...bonus.issues);
  if (!p.pointsByScoring?.[s.scoring] && p.projectionScoring && p.projectionScoring !== s.scoring) issues.push('Scoring mismatch: refresh projections');
  if(p.rankingsScoring && p.rankingsScoring!==s.scoring)issues.push('Rankings scoring mismatch: refresh the feed');
  if(p.rankingsUpdatedAt && (context.now??Date.now())-Date.parse(p.rankingsUpdatedAt)>48*3600000)issues.push('Provider rankings are over 48 hours old');
  if (p.hasProjection === false || !(points > 0)) issues.push('No current projection');
  if (!p.fetchedAt) issues.push('Source freshness unverified');
  else if ((context.now ?? Date.now()) - Date.parse(p.fetchedAt) > 6 * 3600000) issues.push('Data fetched over six hours ago');
  if (!p.projectionUpdatedAt) issues.push('Provider projection timestamp unavailable');
  if (context.season && p.season !== context.season) issues.push('Projection season unverified or different');
  if (!p.adp || p.adp >= 900 || p.adpSource === 'missing') issues.push('ADP unavailable; ranking proxy used');
  else if (p.adpSource === 'rank-proxy') issues.push('ADP is an ordinal rank proxy');
  if (!p.rankStdDev) issues.push('Expert disagreement unavailable');
  // News never supplies invented games-missed or numeric performance adjustments.
  const newsAge = p.newsUpdatedAt ? (context.now ?? Date.now()) - Date.parse(p.newsUpdatedAt) : Infinity;
  const recentNews = newsAge >= 0 && newsAge < 7 * 86400000;
  if (recentNews && /injur|concussion|surgery|ruled out|doubtful|reserve|suspend|released|waiv/i.test(`${p.newsHeadline} ${p.newsBody}`)) issues.push('Recent availability news: review before drafting');
  if (recentNews && /starter|starting|promot|demot|depth chart|workload|snap|trade/i.test(`${p.newsHeadline} ${p.newsBody}`)) issues.push('Recent role-change news: projection may lag');
  if (p.injuryStatus) issues.push(`Availability designation: ${p.injuryStatus}; no invented missed-game deduction`);
  if (p.risk?.missedGames && !p.risk.projectionIncludesAbsence) points *= (17 - bounded(p.risk.missedGames, 0, 17)) / 17;
  if(p.risk?.note)issues.push(`Reviewed availability: ${p.risk.note}${p.risk.projectionIncludesAbsence?' (already reflected in projections)':''}`);
  const expertSpread=p.rankStdDev??(p.rankBest&&p.rankWorst?(p.rankWorst-p.rankBest)/4:undefined);
  const relativeSpread = expertSpread!==undefined ? bounded(expertSpread / Math.max(12, p.consensusRank ?? 40), .06, .35) : .18;
  // Scenario dispersion is a disclosed sensitivity assumption, not a calibrated outcome probability.
  const uncertainty = bounded(p.risk?.volatility ?? relativeSpread + (p.injuryStatus ? .08 : 0) + (issues.some(i=>i.includes('news:')) ? .03 : 0), .02, .7);
  return { ...p, value: Math.max(0, finite(points)), uncertainty, issues,estimatedBonusPoints:bonus.points,bonusDetails:bonus.details };
}

type Lineup = { points: number; used: Set<string>; open: string[] };
export function assignLineup(roster: EvaluatedPlayer[], s: LeagueSettings, excludedBye = 0): Lineup {
  const sorted = roster.filter(p => !excludedBye || p.bye !== excludedBye).slice().sort((a,b) => b.value - a.value || a.id.localeCompare(b.id));
  const used = new Set<string>(); const open: string[] = []; let points = 0;
  const fill = (label: string, n: number, eligible: (p: EvaluatedPlayer) => boolean) => {
    for (let i = 0; i < n; i++) { const p = sorted.find(p => !used.has(p.id) && eligible(p)); if (p) { used.add(p.id); points += p.value; } else open.push(label); }
  };
  for (const pos of POS) fill(pos, s.starters[pos], p => p.pos === pos);
  fill('FLEX', s.starters.FLEX, p => flex.has(p.pos));
  fill('SUPERFLEX', s.superflex ?? 0, p => p.pos === 'QB' || flex.has(p.pos));
  return { points, used, open };
}
function filledRoster(roster: EvaluatedPlayer[], s: LeagueSettings, replacement: Record<Position, number>) {
  const ghosts: EvaluatedPlayer[] = [];
  for (const pos of POS) for (let i=0; i < s.starters[pos] + s.starters.FLEX + (s.superflex ?? 0); i++) ghosts.push({ id: `replacement-${pos}-${i}`, name: 'Waiver replacement', pos, value: replacement[pos], projectedPoints: replacement[pos], team: 'FA', adp: 999, age: 0, dynastyRank: 999, tier: 99, bye: 0, uncertainty: 0, issues: [] });
  return [...roster, ...ghosts];
}
export function rosterValue(roster: EvaluatedPlayer[], s: LeagueSettings, replacement: Record<Position, number>): number {
  const combined = filledRoster(roster, s, replacement);
  const full = assignLineup(combined, s); let byeLoss = 0;
  for (const bye of new Set(roster.map(p => p.bye).filter(b => b > 0))) byeLoss += Math.max(0, full.points - assignLineup(combined, s, bye).points) / 17;
  // The best reserve at each position has option value above waivers; duplicate depth has diminishing value.
  const depth = roster.filter(p => !full.used.has(p.id)).sort((a,b) => b.value-a.value); const counts: Partial<Record<Position, number>> = {};
  const insurance = depth.reduce((v,p) => { const n = counts[p.pos] ?? 0; counts[p.pos] = n+1; return v + Math.max(0, p.value-replacement[p.pos]) * .12 / (n+1); }, 0);
  return full.points - byeLoss + insurance;
}
export function rosterOutcomeValue(observed:EvaluatedPlayer[],outcomes:Map<string,EvaluatedPlayer>,s:LeagueSettings,replacement:Record<Position,number>):number {
  const combined=filledRoster(observed,s,replacement);
  const score=(lineup:Lineup)=>combined.reduce((sum,p)=>sum+(lineup.used.has(p.id)?(outcomes.get(p.id)?.value??p.value):0),0);
  const full=assignLineup(combined,s);let value=score(full);
  // Select starters and bye substitutes using information available before outcomes.
  // Do not grade a hindsight-optimal lineup inside rollouts either.
  for(const bye of new Set(observed.map(p=>p.bye).filter(b=>b>0)))value+=(score(assignLineup(combined,s,bye))-score(full))/17;
  const counts:Partial<Record<Position,number>>={};
  for(const p of observed.filter(p=>!full.used.has(p.id)).sort((a,b)=>b.value-a.value)){
    const n=counts[p.pos]??0;counts[p.pos]=n+1;
    if(p.value>replacement[p.pos])value+=((outcomes.get(p.id)?.value??p.value)-replacement[p.pos])*.12/(n+1);
  }
  return value;
}
export function canDraft(roster: EvaluatedPlayer[], player: EvaluatedPlayer, s: LeagueSettings): boolean {
  if (roster.length >= rosterSize(s) || roster.some(p => p.id === player.id)) return false;
  if (roster.filter(p => p.pos === player.pos).length >= (s.positionLimits?.[player.pos] ?? Infinity)) return false;
  const next = [...roster, player];
  return assignLineup(next, s).open.length <= rosterSize(s) - next.length;
}
export function replacementLevels(pool:EvaluatedPlayer[],s:LeagueSettings,teams:number):Record<Position,number> {
  return Object.fromEntries(POS.map(pos=>{
    const group=pool.filter(p=>p.pos===pos).sort((a,b)=>b.value-a.value);
    const demand=teams*(s.starters[pos]+(flex.has(pos)?s.starters.FLEX/3:0)+(pos==='QB'?(s.superflex??0):0)+(s.bench??0)*(pos==='RB'||pos==='WR'?.35:pos==='TE'||pos==='QB'?.12:.03));
    return [pos,group[Math.min(group.length-1,Math.floor(demand))]?.value??0];
  })) as Record<Position,number>;
}
function market(p: Player) { return p.adp > 0 && p.adp < 900 ? p.adp : p.consensusRank && p.consensusRank < 900 ? p.consensusRank : 700; }
function random(seed: number, key: string) { let h = seed | 0; for (let i=0;i<key.length;i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); h = Math.imul(h ^ h >>> 16, 2246822507); return ((h ^ h >>> 13) >>> 0) / 4294967296; }

export function keeperPortfolio(roster: EvaluatedPlayer[], contracts: Map<string, number>, s: LeagueSettings, pool: EvaluatedPlayer[], teams: number): number {
  const rules = s.keeperRules ?? DEFAULT_KEEPER_RULES;
  const horizon = bounded(Math.round(rules.horizon), 1, 5), limit = bounded(Math.round(rules.limit), 0, 10);
  if(!limit)return 0;
  const positionPools = new Map(POS.map(pos=>[pos,pool.filter(p=>p.pos===pos)]));
  const options = roster.flatMap(p=>{
    const round=contracts.get(p.id); if(!round || !p.dynastyRank || p.dynastyRank>=900)return [];
    const peers=positionPools.get(p.pos)!;
    const dynastyPositionRank=peers.filter(q=>q.dynastyRank<p.dynastyRank).length;
    const future=peers.slice().sort((a,b)=>(a.consensusRank??999)-(b.consensusRank??999))[Math.min(dynastyPositionRank,peers.length-1)]?.value??p.value;
    const costs=Array.from({length:31},(_,r)=>peers.slice().sort((a,b)=>Math.abs(market(a)-(r-.5)*teams)-Math.abs(market(b)-(r-.5)*teams))[0]?.value??future);
    return [{id:p.id,round,future,costs}];
  });
  type Option = typeof options[number];
  // Enumerate the initial keeper portfolio. Future years can retain or drop its members,
  // never magically add a player who was not kept in year one. Charged collision costs carry forward.
  const valueOf=(selected:Option[])=>{
    let active=selected.map(o=>({...o})), total=0;
    for(let year=1;year<=horizon;year++){
      const used=new Set<number>();const retained:Option[]=[];
      for(const o of active){
        let round=o.round-rules.escalation;
        if(round<1 && rules.firstRound==='ineligible')continue;round=Math.max(1,round);
        if(rules.collision==='earlier')while(round>0 && used.has(round))round--;
        if(round<1||used.has(round))continue;
        const value=o.future-(o.costs[round]??o.future);if(value<=0)continue;
        used.add(round);retained.push({...o,round});total+=value*Math.pow(bounded(rules.discount,0,1),year);
      }
      active=retained;
    }
    return total;
  };
  let best=0;
  const visit=(selected:Option[],start:number)=>{
    if(selected.length){
      // All keeper ordering permutations for this league's at-most-three contracts.
      if(selected.length<=3){
        const permutations=(prefix:Option[],remaining:Option[])=>{if(!remaining.length){best=Math.max(best,valueOf(prefix));return;}for(let i=0;i<remaining.length;i++)permutations([...prefix,remaining[i]],remaining.filter((_,j)=>i!==j));};
        permutations([],selected);
      } else best=Math.max(best,valueOf(selected.slice().sort((a,b)=>b.future-a.future)));
    }
    if(selected.length>=limit)return;
    for(let i=start;i<options.length;i++)visit([...selected,options[i]],i+1);
  };
  visit([],0);return best;
}
export function analyzeDraft(players: Player[], allDrafted: DraftedPlayer[], input: LeagueSettings, teams: string[], context: DraftContext = {}): DraftAnalysis {
  const s = normalizeSettings(input); const keeperMode = context.draftMode === 'keeper';
  const warnings: string[] = [...(context.warnings ?? [])];
  const empty: DraftAnalysis = { recommendations: [], warnings, excluded: 0, eligible: 0, currentPick: 1, simulations: s.simulations!, candidateCount: 0, openSlots: [], version: ENGINE_VERSION };
  if (teams.length < 2 || new Set(teams.map(nameKey)).size !== teams.length) { warnings.push('At least two unique teams are required.'); return empty; }
  const mine = teams.find(t => nameKey(t) === nameKey(s.userTeam));
  if (!mine) { warnings.push('Select your team before using recommendations.'); return empty; }
  if(rosterSize(s)-(s.bench??0)<1){warnings.push('Configure at least one starting slot.');return empty;}
  for(const pos of POS)if((s.positionLimits?.[pos]??Infinity)<s.starters[pos]){warnings.push(`${pos} limit is lower than required starters. Correct Setup.`);return empty;}
  const drafted = allDrafted.filter(d => keeperMode || d.kind !== 'keeper');
  if(context.rosters?.length) {
    if(!context.rostersAreCurrentDraft) warnings.push('Synced roster snapshot is not confirmed as this draft. Only recorded picks and active keepers are used; confirm roster context in Data.');
    else for(const roster of context.rosters) for(const name of roster.players) if(!drafted.some(d=>nameKey(d.playerName??players.find(p=>p.id===d.playerId)?.name)===nameKey(name))) {drafted.push({playerId:'snapshot-'+nameKey(name),playerName:name,owner:roster.team,pick:0,kind:'draft'});warnings.push(`Roster-only player ${name} has no draft pick number. Sync the full board to establish accurate turn timing.`);}
  }
  if (!s.rulesConfirmed) warnings.push('League rules are not confirmed. Review scoring, starting slots, bench, and keeper rules in Setup.');
  if (context.dataSource === 'demo') warnings.push('Demo data: do not use these recommendations for a real draft.');
  const idLookup = new Map(players.map(p => [p.id,p])); const names = new Map(players.map(p => [nameKey(p.name),p]));
  const chosen = new Set<string>(); const rosters = new Map(teams.map(t => [t, [] as EvaluatedPlayer[]])); const contracts = new Map<string, number>();
  for (const d of drafted) {
    const p = idLookup.get(d.playerId) ?? names.get(nameKey(d.playerName)); const team = teams.find(t => nameKey(t)===nameKey(d.owner));
    if (!team) warnings.push(`Unknown pick owner: ${d.owner}`);
    if (!p) { warnings.push(`Unmatched roster player: ${d.playerName ?? d.playerId}. Roster needs may be inaccurate.`); continue; }
    if (chosen.has(p.id)) { warnings.push(`Duplicate drafted player: ${p.name}`); continue; } chosen.add(p.id);
    if (team) rosters.get(team)!.push(evaluatePlayer(p,s,context));
    if (d.kind === 'draft' && d.pick>0) contracts.set(p.id,Math.ceil(d.pick/teams.length));
    else if (d.costRound) contracts.set(p.id,d.costRound); else warnings.push(`Keeper cost pending: ${p.name}. Pick timing and keeper value are incomplete.`);
  }
  const reserved = keeperSlots(drafted,teams); const used = new Set(drafted.filter(d=>d.kind==='draft').map(d=>d.pick));
  const positivePicks=drafted.filter(d=>d.kind==='draft'&&d.pick>0).map(d=>d.pick);
  if(new Set(positivePicks).size!==positivePicks.length)warnings.push('Duplicate pick numbers: correct the board before relying on draft timing.');
  if(positivePicks.some(p=>reserved.has(p)))warnings.push('A recorded pick overlaps a keeper-reserved slot. Reconcile the board.');
  const total = rosterSize(s)*teams.length; let current = 1; while(used.has(current)||reserved.has(current)) current++;
  empty.currentPick = current;
  const userSlots: number[] = [];
  for(let pick=current;pick<=total;pick++) if(ownerAt(pick,teams)===mine&&!used.has(pick)&&!reserved.has(pick)) userSlots.push(pick);
  const target = userSlots[0]; const next = userSlots[1]; empty.targetPick=target; empty.nextPick=next;
  const myRoster = rosters.get(mine)!; empty.openSlots=assignLineup(myRoster,s).open;
  if (keeperMode) for (const team of teams) if(drafted.filter(d=>d.kind==='keeper'&&nameKey(d.owner)===nameKey(team)).length>s.keeperRules!.limit) warnings.push(`${team} exceeds the keeper limit.`);
  if (!target || myRoster.length>=rosterSize(s)) { warnings.push('Your draft is complete or your roster is full.'); return empty; }
  const evaluated = players.map(p=>evaluatePlayer(p,s,context));
  const pool = evaluated.filter(p => p.active !== false && p.value>0 && p.hasProjection !== false && (!context.season || !p.season || p.season===context.season));
  empty.excluded=players.length-pool.length; empty.eligible=pool.length;
  if (!pool.length) { warnings.push('No players have usable projections. Refresh data before drafting.'); return empty; }
  const available = pool.filter(p=>!chosen.has(p.id));
  const replacement = replacementLevels(pool,s,teams.length);
  if (available.length < total-drafted.length) warnings.push('Projection coverage is smaller than the remaining draft. Some simulated rosters may be incomplete.');
  const baseValue=rosterValue(myRoster,s,replacement);
  const keeperWeight=keeperMode?(s.mode==='contend'?.15:s.mode==='rebuild'?.5:.3):0;
  const baseKeeper=keeperWeight?keeperPortfolio(myRoster,contracts,s,pool,teams.length):0;
  const legal=available.filter(p=>canDraft(myRoster,p,s));
  const immediate=new Map(legal.map(p=>[p.id,rosterValue([...myRoster,p],s,replacement)-baseValue]));
  // Shortlist all positions, immediate improvements, and the top market choices. No unsupported player is silently scored as healthy.
  const finalists=new Map<string,EvaluatedPlayer>();
  const add=(list:EvaluatedPlayer[])=>list.forEach(p=>finalists.set(p.id,p));
  add(legal.slice().sort((a,b)=>(immediate.get(b.id)??0)-(immediate.get(a.id)??0)).slice(0,8));
  add(legal.slice().sort((a,b)=>market(a)-market(b)).slice(0,6));
  for(const pos of POS) add(legal.filter(p=>p.pos===pos).sort((a,b)=>b.value-a.value).slice(0,1));
  if(keeperMode) add(legal.slice().sort((a,b)=>a.dynastyRank-b.dynastyRank).slice(0,3));
  const candidates=[...finalists.values()]; empty.candidateCount=candidates.length;
  const seed=context.seed??20260906; const worlds=s.simulations!;
  const outcomes=new Map(candidates.map(p=>[p.id,[] as number[]])); const plans=new Map<string,string[]>();
  const survived=new Map(candidates.map(p=>[p.id,0])); const reached=new Map(candidates.map(p=>[p.id,0])); const nextOptions=new Map<string,string[]>();
  const marketOrder=available.slice().sort((a,b)=>market(a)-market(b));
  // Cache observable projection values across worlds; random outcomes are never inputs to decisions.
  const valueCache=new Map<string,number>();
  const runCounts: Partial<Record<Position,number>>={};
  for(const d of drafted.filter(d=>d.kind==='draft').sort((a,b)=>b.pick-a.pick).slice(0,teams.length)) {const p=idLookup.get(d.playerId)??names.get(nameKey(d.playerName));if(p)runCounts[p.pos]=(runCounts[p.pos]??0)+1;}
  for(let world=0;world<worlds;world++) {
    const worldSeed=seed+world*7919;
    const worldPlayers=new Map(pool.map(p=>[p.id,{...p,value:p.value*Math.max(.2,1+(random(worldSeed,p.id)-.5)*2*p.uncertainty)}]));
    const valueOf=(roster:EvaluatedPlayer[])=>{const key=roster.map(p=>p.id).sort().join('|');const cached=valueCache.get(key);if(cached!==undefined)return cached;const value=rosterValue(roster,s,replacement);valueCache.set(key,value);return value;};
    const choose=(remaining:EvaluatedPlayer[],roster:EvaluatedPlayer[],pick:number,user:boolean) => {
      const short=remaining.slice(0,22); for(const pos of POS) { const p=remaining.find(p=>p.pos===pos);if(p&&!short.includes(p))short.push(p); }
      let best:EvaluatedPlayer|undefined; let high=-Infinity;
      const currentValue=user?valueOf(roster):0;
      for(const p of short) {if(!canDraft(roster,p,s))continue; let score:number;
        if(user) score=valueOf([...roster,p])-currentValue;
        else { const count=roster.filter(q=>q.pos===p.pos).length; const need=s.starters[p.pos]+(flex.has(p.pos)?s.starters.FLEX/3:0)+(p.pos==='QB'?(s.superflex??0):0); const spread=p.adpStdDev??Math.max(5,market(p)*.18); score=-market(p)+(count<need?12:count>=need+1?-20:0)+(random(worldSeed,`${pick}:${p.id}`)-.5)*spread*2+(runCounts[p.pos]??0)*.7; }
        if(score>high){high=score;best=p;}
      } return best;
    };
    // Neutral wait branch: opponents draft, while your first choice is deferred. This is a sensitivity estimate, not a calibrated probability.
    {const removed=new Set<string>();const rs=new Map([...rosters].map(([t,r])=>[t,[...r]]));
      for(let pick=current;pick<(next??target+1);pick++){if(used.has(pick)||reserved.has(pick))continue;const team=ownerAt(pick,teams);if(team===mine){if(pick===target)for(const p of candidates)if(!removed.has(p.id))reached.set(p.id,reached.get(p.id)!+1);continue;}const p=choose(marketOrder.filter(p=>!removed.has(p.id)),rs.get(team)!,pick,false);if(p){removed.add(p.id);rs.get(team)!.push(p);}}
      for(const p of candidates)if(!removed.has(p.id))survived.set(p.id,survived.get(p.id)!+1);
    }
    for(const candidate of candidates) {
      const removed=new Set<string>(); const rs=new Map([...rosters].map(([t,r])=>[t,[...r]])); const cs=new Map(contracts);const plan:string[]=[];let chosenCandidate=false;
      for(let pick=current;pick<=total;pick++) {
        if(used.has(pick)||reserved.has(pick))continue;const team=ownerAt(pick,teams);const roster=rs.get(team)!;
        if(roster.length>=rosterSize(s))continue;
        const remaining=marketOrder.filter(p=>!removed.has(p.id));
        let selected:EvaluatedPlayer|undefined;
        if(team===mine&&pick===target&&!removed.has(candidate.id)){selected=candidate;chosenCandidate=true;}
        else selected=choose(remaining,roster,pick,team===mine);
        if(!selected)continue;removed.add(selected.id);roster.push(selected);cs.set(selected.id,Math.ceil(pick/teams.length));
        if(team===mine) {if(plan.length<3)plan.push(`R${Math.ceil(pick/teams.length)}: ${selected.name}`);if(pick===next){const list=nextOptions.get(candidate.id)??[];list.push(selected.name);nextOptions.set(candidate.id,list);}}
      }
      const final=rs.get(mine)!;
      // Draft choices only see projections. Outcome uncertainty is applied after the roster is complete.
      let value=rosterOutcomeValue(final,worldPlayers,s,replacement);
      // Keeper option value is evaluated on the completed portfolio, never added for every player independently.
      if(keeperWeight)value+=keeperWeight*keeperPortfolio(final,cs,s,pool,teams.length);
      if(assignLineup(final,s).open.length)value-=assignLineup(final,s).open.length*50;
      outcomes.get(candidate.id)!.push(value);if(world===0)plans.set(candidate.id,plan);
      if(!chosenCandidate&&world===0)plans.set(candidate.id,['Conditional: player may be taken before your turn',...plan]);
    }
  }
  const recommendations:DraftRecommendation[]=candidates.map(p=>{
    const values=outcomes.get(p.id)!;const mean=values.reduce((a,b)=>a+b,0)/worlds;const spread=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/worlds);
    const cs=new Map(contracts);const round=Math.ceil(target/teams.length);cs.set(p.id,round);
    const keeperValue=keeperWeight?Math.max(0,keeperPortfolio([...myRoster,p],cs,s,pool,teams.length)-baseKeeper):0;
    const options=nextOptions.get(p.id)??[];const nextOption=options.slice().sort((a,b)=>options.filter(x=>x===b).length-options.filter(x=>x===a).length)[0];
    const survival=next?(survived.get(p.id)??0)/worlds:0;
    const issues=[...p.issues];if(reached.get(p.id)!<worlds)issues.push(`Available at your upcoming pick in ${reached.get(p.id)}/${worlds} simulated drafts`);
    const rawRound=round-s.keeperRules!.escalation;const nextKeeperRound=keeperMode&&(rawRound>=1||s.keeperRules!.firstRound==='round-one')?Math.max(1,rawRound):undefined;
    const marginal=immediate.get(p.id)??0;
    return {...p,score:mean-spread*s.riskTolerance!,projectedValue:p.value,marginalPoints:marginal,replacementPoints:replacement[p.pos],keeperValue,nextKeeperRound,survival,nextOption,nextPick:next,plan:plans.get(p.id)??[],spread,confidence:'low' as const,issues,evaluated:true,
      components:{winNow:bounded(marginal,0,100),dynasty:bounded(keeperValue,0,100),scarcity:bounded(p.value-replacement[p.pos],0,100),rosterFit:bounded(marginal,0,100),urgency:(1-survival)*100},
      rationale:[`${marginal.toFixed(1)} projected roster-value gain now, including lineup, bye coverage and depth`,...(p.bonusDetails??[]),next?`Model-only chance of lasting to pick ${next}: ${Math.round(survival*100)}%`:'Your final available selection',nextOption?`Example follow-up: ${nextOption}`:'No later pick modeled',...(keeperMode?[nextKeeperRound?`Next-year keeper cost R${nextKeeperRound}; ${keeperValue.toFixed(1)} discounted portfolio option value`:'Ineligible to keep next year under the configured round-one rule']:[])]};
  }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  // Do not let small, noisy rollout differences displace the roster-value baseline.
  const baseline=legal.slice().sort((a,b)=>(immediate.get(b.id)??0)-(immediate.get(a.id)??0)||market(a)-market(b))[0];
  const baselineRec=recommendations.find(p=>p.id===baseline?.id);
  if(baselineRec){baselineRec.baseline=true;const base=outcomes.get(baselineRec.id)!;
    for(const p of recommendations){const differences=outcomes.get(p.id)!.map((v,i)=>v-base[i]);const mean=differences.reduce((a,b)=>a+b,0)/worlds;const sd=Math.sqrt(differences.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,worlds-1));p.conservativeEdge=mean-2*sd/Math.sqrt(worlds)-s.riskTolerance!*(p.spread-baselineRec.spread);}
    recommendations.sort((a,b)=>(b.conservativeEdge??0)-(a.conservativeEdge??0)||Number(!!b.baseline)-Number(!!a.baseline)||b.score-a.score);
    if(recommendations[0].baseline)recommendations[0].rationale.push('No alternative showed a clear simulated improvement over the immediate roster-value baseline');
  }
  if(s.recommendationPolicy!=='lookahead'){
    recommendations.sort((a,b)=>Number(!!b.baseline)-Number(!!a.baseline)||b.marginalPoints-a.marginalPoints||market(a)-market(b));
    if(baselineRec)baselineRec.rationale.push('Evidence gate: roster-value recommendation. Experimental lookahead has not established a reliable historical advantage over this policy.');
    warnings.push('Roster-value policy selected. Lookahead plans and keeper option values are exploratory and do not override the pick. Select experimental lookahead explicitly in Setup to use those model assumptions.');
  }else warnings.push('Experimental lookahead selected: no reliable historical advantage over roster-value drafting has been established.');
  const best=recommendations[0], runner=recommendations[1];
  if(best&&runner){const a=outcomes.get(best.id)!,b=outcomes.get(runner.id)!;const differences=a.map((v,i)=>v-b[i]);const mean=differences.reduce((x,y)=>x+y,0)/worlds;const sd=Math.sqrt(differences.reduce((x,y)=>x+(y-mean)**2,0)/Math.max(1,worlds-1));const error=sd/Math.sqrt(worlds);const dataConcerns=best.issues.filter(x=>/missing|unverified|unavailable|mismatch|six hours|designation|news/i.test(x)).length;best.confidence=mean>2*error&&mean>5&&dataConcerns<2&&s.rulesConfirmed?'high':mean>error&&dataConcerns<4?'medium':'low';empty.comparison=`${(best.score-runner.score).toFixed(1)} model-value edge over ${runner.name}. Paired scenario difference ${mean.toFixed(1)} ± ${(2*error).toFixed(1)} (sampling uncertainty only).`;}
  if(best){best.confidence='low';empty.comparison=s.recommendationPolicy==='lookahead'?`Experimental model comparison. ${empty.comparison??''} These within-model differences do not establish real-world superiority.`:'Roster-value policy: recommendations prioritize projected lineup, bye coverage and useful depth. Historical superiority is not established; scenario plans are exploratory.';}
  warnings.push('Simulation probabilities and risk ranges are sensitivity estimates, not calibrated forecasts or guarantees.');
  if(best && warnings.some(w=>/not confirmed|Unmatched|Unknown|pending|Duplicate|overlaps|no draft pick|Refresh failed|smaller/.test(w)))best.confidence='low';
  if(context.lastSync&&(context.now??Date.now())-Date.parse(context.lastSync)>6*3600000)warnings.push('Saved feed is over six hours old. Refresh before selecting.');
  return {...empty,recommendations,warnings:[...new Set(warnings)]};
}

export function rankAvailable(players:Player[],drafted:DraftedPlayer[],settings:LeagueSettings,teams=Array.from({length:12},(_,i)=>`Team ${i+1}`),context:DraftContext={}):DraftRecommendation[]{return analyzeDraft(players,drafted,settings,teams,context).recommendations;}

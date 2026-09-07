import type {LeagueSettings} from './draft';
export const DISCORD_RULES_REVISION='espn-screenshots-2026-09-07';
// Roster slots and limits: user's ESPN screenshots (supersede the FP import).
// Scoring coefficients: prior authenticated FantasyPros settings snapshot.
// Team IDs are NOT draft order. This function deliberately leaves draft state,
// team identity, slot, keeper contracts and keeper mode alone.
export function applyDiscordRules(s:LeagueSettings):LeagueSettings {
  return {...s,scoring:'standard',starters:{QB:1,RB:2,WR:2,TE:1,K:0,DST:1,FLEX:2},bench:6,irSlots:1,superflex:0,positionLimits:{QB:4,RB:8,WR:8,TE:3,DST:3,K:0},
    customScoring:{pass_yds:.04,pass_tds:4,pass_ints:-2,rush_yds:.1,rush_tds:6,rec:0,rec_yds:.1,rec_tds:6,fumbles_lost:-2,'2pt_tds':2,def_sack:2,def_int:2,def_fr:2,def_td:6,def_safety:2,fg:3,xpt:1},
    positionScoring:undefined,bonusRules:{pointsAllowed:[10,7,4,1,0,-1,-4]},
    scoringSource:DISCORD_RULES_REVISION,rulesConfirmed:false};
}

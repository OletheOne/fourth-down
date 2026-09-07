import type {LeagueSettings} from './draft';
export const DISCORD_RULES_REVISION='fantasypros-2026-09-07';
// Verified through the authenticated FantasyPros get_league_settings connector.
// Team IDs are NOT draft order. This function deliberately leaves draft state,
// team identity, slot, keeper contracts and keeper mode alone.
export function applyDiscordRules(s:LeagueSettings):LeagueSettings {
  return {...s,scoring:'standard',starters:{QB:1,RB:2,WR:3,TE:1,K:1,DST:1,FLEX:0},bench:6,superflex:0,
    customScoring:{pass_yds:.04,pass_tds:4,pass_ints:-2,rush_yds:.1,rush_tds:6,rec:0,rec_yds:.1,rec_tds:6,fumbles_lost:-2,'2pt_tds':2,def_sack:2,def_int:2,def_fr:2,def_td:6,def_safety:2,fg:3,xpt:1},
    positionScoring:undefined,bonusRules:{fieldGoals:[3,4,5],pointsAllowed:[10,7,4,1,0,-1,-4]},
    scoringSource:DISCORD_RULES_REVISION,rulesConfirmed:false};
}

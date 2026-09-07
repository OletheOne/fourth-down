import type {Player} from './draft';
import {STAT_LABELS} from './optimizer';

export type DecisionNote={text:string;attention:boolean};
const statName=(key:string)=>(STAT_LABELS[key]??key.replaceAll('_',' ')).toLowerCase();
export function explainIssue(issue:string):DecisionNote{
 const missing=issue.match(/^Missing (\S+) projection; custom scoring incomplete$/);
 if(missing)return {attention:true,text:`The feed is missing projected ${statName(missing[1])}. We cannot fully apply your league’s scoring for this player. Refresh the data before relying on this estimate.`};
 if(issue==='Provider projection timestamp unavailable')return {attention:false,text:'FantasyPros supplied projections without their last-edit time. The refresh time shows when we downloaded them, not when an expert last changed them.'};
 if(issue==='Source freshness unverified')return {attention:true,text:'We cannot verify when this player’s data was downloaded. Refresh FantasyPros before drafting.'};
 if(issue==='Expert disagreement unavailable')return {attention:false,text:'No expert-agreement measure was supplied for this player. Uncertainty uses a model assumption.'};
 if(issue.startsWith('Available at your upcoming pick in '))return {attention:true,text:issue.replace('Available at your upcoming pick in ','This player reached your upcoming pick in ') + '. Treat this as an “if available” target—not a promise.'};
 if(issue.startsWith('Recent availability news:'))return {attention:true,text:'Recent news may affect availability. Check the dated news item before picking.'};
 if(issue.startsWith('Recent role-change news:'))return {attention:true,text:'Recent news suggests a role or workload change. The season projection may not reflect it yet.'};
 if(issue.startsWith('Availability designation:'))return {attention:true,text:issue.replace('; no invented missed-game deduction',' — review before selecting. We have not guessed how many games will be missed.')};
 if(issue.startsWith('Points-allowed bands are historical estimates.'))return {attention:false,text:'Part of this defense’s score is estimated from historical points allowed, not supplied as a FantasyPros projection. Typical held-out error was about 12 seasonal bonus points; schedule and roster changes are not modeled.'};
 if(issue.startsWith('FG distance mix is a historical estimate'))return {attention:false,text:'Field-goal distance points use a historical estimate. They are not exact FantasyPros projections.'};
 if(issue.startsWith('Roster-value policy selected.'))return {attention:false,text:'The default ranks projected lineup improvement, bye-week cover and useful depth. Exploratory draft simulations do not override the pick.'};
 if(issue.startsWith('Simulation probabilities'))return {attention:false,text:'Draft availability estimates are exploratory—not measured odds or guarantees.'};
 if(issue.startsWith('ADP unavailable'))return {attention:false,text:'Average draft position is unavailable. Expert ranking is being used as a rough market estimate.'};
 if(issue==='ADP is an ordinal rank proxy')return {attention:false,text:'The supplied ADP is a ranking, not an average pick number. Waiting estimates are less reliable.'};
 if(issue.startsWith('Reviewed availability:'))return {attention:false,text:issue};
 return {attention:true,text:issue.replace(/\bpass_ints\b/g,'passing interceptions')};
}
export function decisionNotes(issues:string[]){return [...new Set(issues)].map(explainIssue);}
export function workloadSummary(player:Player){
 const stats=player.stats??{},parts:string[]=[];
 if(Number.isFinite(stats.pass_att))parts.push(`${Math.round(stats.pass_att)} pass attempts`);
 if(Number.isFinite(stats.rush_att))parts.push(`${Math.round(stats.rush_att)} carries`);
 if(Number.isFinite(stats.rec))parts.push(`${Math.round(stats.rec)} catches`);
 return parts.length?parts.join(' · '):'No separate workload projection supplied';
}
export function slotSummary(slots:string[]){
 if(!slots.length)return 'Starting lineup filled';
 return [...new Set(slots)].map(slot=>`${slots.filter(s=>s===slot).length} ${slot==='DST'?'D/ST':slot}`).join(' · ');
}

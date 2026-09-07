// Refresh report labels and aggregate evidence without rerunning or tuning policies.
import {readFile,writeFile} from 'node:fs/promises';
const reports=[];
const developmentUrl=new URL('development-draft-results.json',import.meta.url);
const development=JSON.parse(await readFile(developmentUrl,'utf8'));
development.summary.limitation='2023 development diagnostic before the final lineup-grading correction; not a holdout and not the final policy. Retained to document evaluation history.';
await writeFile(developmentUrl,JSON.stringify(development,null,2)+'\n');
for(const scoring of ['ppr','standard']){
 const url=new URL(`${scoring}-holdout-draft-results.json`,import.meta.url);
 const r=JSON.parse(await readFile(url,'utf8'));
 r.summary.untouchedFinalSeasons=[2025];r.summary.auditedReplaySeasons=[2024];
 r.summary.limitation='2024 was partially observed before a hindsight-grading correction and is an audited replay. Only 2025 was untouched for the corrected policy. Scenarios share season outcomes, not independent season replications. Archived rankings are PPR ECR (not ADP), making standard scoring a stress test against a mismatched market. 2025 snapshot is August 8. No historical FantasyPros projections, real opponent logs, injury-aware weekly lineups, waivers or keeper validation.';
 for(const year of [2024,2025]){
  const rows=r.results.filter(x=>x.year===year);
  const averages=Object.fromEntries(['ECR','Roster value','Lookahead'].map(k=>[k,rows.reduce((n,x)=>n+x.points[k],0)/rows.length]));
  reports.push({scoring,year,contexts:rows.length,status:year===2025?'untouched final season':'audited replay',averages});
 }
 await writeFile(url,JSON.stringify(r,null,2)+'\n');
}
const bonus=JSON.parse(await readFile(new URL('bonus-results.json',import.meta.url),'utf8'));
const bonusSummary=Object.fromEntries(Object.entries(bonus).map(([k,v])=>[k,{seasons:v.holdout.map(x=>x.year),units:v.holdout.reduce((n,x)=>n+x.units,0),events:v.holdout.reduce((n,x)=>n+x.events,0),meanSeasonMAE:v.holdout.reduce((n,x)=>n+x.mae,0)/3,meanOmittedBonusMAE:v.holdout.reduce((n,x)=>n+x.zeroMAE,0)/3,meanPriorMAE:v.holdout.reduce((n,x)=>n+x.priorMAE,0)/3,caveat:v.caveat}]));
const final={bonus:bonusSummary,drafts:reports,decision:'Roster-value default. Experimental lookahead was not promoted. No statistically established general draft advantage; one untouched final NFL season is insufficient. Bonus errors validate only event composition under stated historical scoring reconstruction and volume conditions.'};
await writeFile(new URL('RESULTS.json',import.meta.url),JSON.stringify(final,null,2)+'\n');
console.log(JSON.stringify(final,null,2));

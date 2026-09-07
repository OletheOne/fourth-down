// Full-policy replay: actual weekly outcomes are only read after every draft finishes.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadModule} from '../tests/load-module.mjs';
const {analyzeDraft,evaluatePlayer,normalizeSettings,assignLineup,canDraft,ownerAt,rosterValue,replacementLevels}=await loadModule('../lib/optimizer.ts');
const teams=Array.from({length:12},(_,i)=>`Team ${i+1}`);
const schemes=['ECR','Roster value','Lookahead'];
const development=process.argv.includes('--development');
const years=development?[2023]:[2024,2025];
const slots=[1,6,12],styles=['market','needs'];
const scores=process.argv.includes('--standard')?['standard']:['ppr'];
const random=(key)=>{let n=612389;for(const c of key)n=Math.imul(n^c.charCodeAt(0),16777619);return((n^n>>>16)>>>0)/4294967296;};
const results=[];
for(const scoring of scores)for(const year of years){
 const fixture=JSON.parse(await readFile(new URL(`cache/draft-${year}-${scoring}.json`,import.meta.url),'utf8'));
 assert.equal(fixture.metadata.unmatchedTop180.length,0,'Audit draft-relevant unmatched IDs before testing');
 for(const slot of slots)for(const style of styles){
  const start=Date.now(); const mine=teams[slot-1];
  const s=normalizeSettings({userTeam:mine,draftSlot:slot,scoring,mode:'contend',starters:{QB:1,RB:2,WR:3,TE:1,FLEX:0,K:1,DST:1},bench:6,simulations:4,rulesConfirmed:true,recommendationPolicy:'lookahead'});
  const context={season:year,now:Date.parse(fixture.metadata.asOf+'T00:00:00Z'),draftMode:'traditional',seed:901811+year+slot};
  const pool=fixture.players.map(p=>evaluatePlayer(p,s,context));
  const replacement=replacementLevels(pool,s,12);const rostersByScheme={};const changes=[];
  for(const scheme of schemes){
   const taken=new Set();const drafted=[];const rosters=new Map(teams.map(t=>[t,[]]));
   for(let pick=1;pick<=180;pick++){
    const team=ownerAt(pick,teams),roster=rosters.get(team);
    const legal=pool.filter(p=>!taken.has(p.id)&&canDraft(roster,p,s));assert.ok(legal.length);
    let selected;
    if(team===mine){
     if(scheme==='Lookahead'){
      const a=analyzeDraft(fixture.players,drafted,s,teams,context);selected=legal.find(p=>p.id===a.recommendations[0]?.id);assert.ok(selected);
      changes.push(Number(!a.recommendations[0].baseline));
     }else if(scheme==='ECR') selected=legal.sort((a,b)=>a.consensusRank-b.consensusRank||a.id.localeCompare(b.id))[0];
     else selected=legal.map(p=>({p,score:rosterValue([...roster,p],s,replacement)})).sort((a,b)=>b.score-a.score||a.p.adp-b.p.adp)[0].p;
    }else{
     const utility=p=>-p.consensusRank+25*(random(`${year}:${slot}:${style}:${pick}:${p.id}`)-.5)+(style==='needs'?(roster.filter(q=>q.pos===p.pos).length<s.starters[p.pos]?25:-10):0);
     selected=legal.map(p=>({p,score:utility(p)})).sort((a,b)=>b.score-a.score||a.p.id.localeCompare(b.p.id))[0].p;
    }
    roster.push(selected);taken.add(selected.id);drafted.push({playerId:selected.id,owner:team,pick,kind:'draft'});
   }
   for(const roster of rosters.values()){assert.equal(roster.length,15);assert.equal(assignLineup(roster,s).open.length,0);}
   rostersByScheme[scheme]=rosters.get(mine);
  }
  // Decision policy has never received outcomes. Preseason lineup choice, known byes;
  // no hindsight best-ball substitution or season-end ordering.
  const points=Object.fromEntries(schemes.map(scheme=>{
   const roster=rostersByScheme[scheme];let total=0;
   for(let week=1;week<=17;week++){
    const lineup=assignLineup(roster,s,week);
    for(const id of lineup.used)total+=fixture.outcomes[id]?.[week]??0;
   }
   return [scheme,Math.round(total*100)/100];
  }));
  const result={year,scoring,slot,style,points,lookaheadDepartures:changes.reduce((a,b)=>a+b,0),elapsedMs:Date.now()-start};
  results.push(result);console.log(JSON.stringify(result));
  await writeFile(new URL(`${development?'development':scoring+'-holdout'}-draft-results.json`,import.meta.url),JSON.stringify({kind:'Historical weekly outcomes with simulated opponents; full draft policies',results},null,2)+'\n');
 }
}
const seasonDifferences=years.map(year=>{const rows=results.filter(r=>r.year===year);return {year,versusRosterValue:rows.reduce((n,r)=>n+r.points.Lookahead-r.points['Roster value'],0)/rows.length,versusECR:rows.reduce((n,r)=>n+r.points.Lookahead-r.points.ECR,0)/rows.length};});
const summary={seasons:years,independentSeasons:years.length,untouchedFinalSeasons:development?[]:[2025],auditedReplaySeasons:development?[]:[2024],draftContexts:results.length,seasonDifferences,
 limitation:'2024 is an audited replay after an interrupted run exposed partial results; only 2025 is an untouched final season. Scenarios share NFL outcomes: draft-context variation is not season-level replication. Rankings are archived PPR ECR, not ADP; standard scoring is a stress test against a mismatched ECR market. 2025 snapshot is August 8. Forecasts are historical rank-to-points estimates, NOT archived FantasyPros projections. No keeper, waiver, trade, injury-aware weekly lineup or ESPN opponent-log validation.'};
await writeFile(new URL(`${development?'development':scores[0]+'-holdout'}-draft-results.json`,import.meta.url),JSON.stringify({summary,results},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

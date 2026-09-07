// Reproducible synthetic holdout, not historical NFL validation. No tuning on these outcomes.
// Compare the first recommendation, followed by an identical legal positional-value policy.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=await readFile(new URL('../lib/optimizer.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {analyzeDraft,evaluatePlayer,normalizeSettings,assignLineup,canDraft,ownerAt}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const schemes=['ADP','ECR','Positional value','Lookahead'];const totals=Object.fromEntries(schemes.map(n=>[n,[]]));
const teams=['A','B','C','D'];const now=Date.parse('2026-09-06T20:00:00Z');
const random=(seed,key)=>{let n=seed;for(const c of key)n=Math.imul(n^c.charCodeAt(0),16777619);return((n^n>>>16)>>>0)/4294967296;};
const settings=normalizeSettings({userTeam:'A',draftSlot:1,scoring:'ppr',mode:'contend',starters:{QB:1,RB:1,WR:2,TE:1,FLEX:1,K:0,DST:0},bench:2,simulations:8,rulesConfirmed:true});
let violations=0;let cases=0;
for(let fixture=0;fixture<12;fixture++) {
  const players=Array.from({length:100},(_,i)=>{const pos=['QB','RB','WR','TE'][i%4];const rank=Math.floor(i/4);const p={id:`F${fixture}P${i}`,name:`F${fixture}P${i}`,pos,team:'BUF',projectedPoints:Math.max(25,({QB:330,RB:270,WR:265,TE:220}[pos])-rank*(5+random(fixture+1,pos)*13)),adp:i+1,consensusRank:i+1+Math.round((random(91,`${fixture}:${i}`)-.5)*8),dynastyRank:i+1,age:25,bye:5+i%8,rankStdDev:5,hasProjection:true,active:true,season:2026,fetchedAt:new Date(now).toISOString(),projectionUpdatedAt:new Date(now).toISOString()};return p;});
  const pool=players.map(p=>evaluatePlayer(p,settings,{now,season:2026}));
  const analysis=analyzeDraft(players,[],settings,teams,{now,season:2026,draftMode:'traditional',seed:124+fixture});
  const positional=(p,roster)=>assignLineup([...roster,p],settings).points-assignLineup(roster,settings).points;
  for(let world=0;world<8;world++){
    cases++;
    for(const scheme of schemes){
      const rosters=new Map(teams.map(t=>[t,[]]));const taken=new Set();
      for(let pick=1;pick<=32;pick++){
        const owner=ownerAt(pick,teams);const roster=rosters.get(owner);let list=pool.filter(p=>!taken.has(p.id)&&canDraft(roster,p,settings));
        if(!list.length){violations++;continue;}
        if(owner==='A'){
          if(pick===1&&scheme==='Lookahead')list.sort((a,b)=>(b.id===analysis.recommendations[0].id?1:0)-(a.id===analysis.recommendations[0].id?1:0));
          else if(pick===1&&scheme==='ADP')list.sort((a,b)=>a.adp-b.adp);
          else if(pick===1&&scheme==='ECR')list.sort((a,b)=>a.consensusRank-b.consensusRank);
          else list.sort((a,b)=>positional(b,roster)-positional(a,roster)||a.adp-b.adp);
        }else{
          // Held-out opponent policy has different randomness and need preference than the optimizer.
          const score=p=>-p.adp+(roster.filter(q=>q.pos===p.pos).length<settings.starters[p.pos]?18:0)+20*(random(9000+world,`${fixture}:${pick}:${p.id}`)-.5);
          list.sort((a,b)=>score(b)-score(a));
        }
        const selected=list[0];taken.add(selected.id);roster.push(selected);
      }
      const roster=rosters.get('A');if(assignLineup(roster,settings).open.length)violations++;
      const outcomes=roster.map(p=>({...p,value:p.value*(.7+.6*random(45000+world,`${fixture}:${p.id}`))}));
      // Independent realized starter points, without engine depth/keeper bonuses.
      totals[scheme].push(assignLineup(outcomes,settings).points);
    }
  }
}
assert.equal(violations,0,'Every completed roster must remain legal');
const means=Object.fromEntries(schemes.map(s=>[s,Number((totals[s].reduce((a,b)=>a+b,0)/cases).toFixed(2))]));
const paired=Object.fromEntries(schemes.filter(s=>s!=='Lookahead').map(s=>{const dif=totals.Lookahead.map((v,i)=>v-totals[s][i]);const mean=dif.reduce((a,b)=>a+b,0)/cases;const sd=Math.sqrt(dif.reduce((a,b)=>a+(b-mean)**2,0)/(cases-1));return[s,{meanDifference:Number(mean.toFixed(2)),twoStandardErrors:Number((2*sd/Math.sqrt(cases)).toFixed(2))}];}));
console.log(JSON.stringify({kind:'Synthetic first-pick holdout; not historical validation',cases,violations,meanRealizedStarterPoints:means,pairedLookaheadDifference:paired},null,2));

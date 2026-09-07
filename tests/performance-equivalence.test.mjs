import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import ts from 'typescript';
import {loadModule,moduleUrl} from './load-module.mjs';
// Freeze the deployed pre-optimization engine. Do not regenerate expectations
// from the implementation under test.
const ref='ceaf28337c364c831c6607938858a37b96238e4c';
let old=ts.transpileModule(execFileSync('git',['show',`${ref}:lib/optimizer.ts`],{encoding:'utf8'}),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const bonus=await moduleUrl('../lib/bonus-scoring.ts');old=old.replace("'./bonus-scoring'",`'${bonus}'`);
const before=await import(`data:text/javascript;base64,${Buffer.from(old).toString('base64')}`);
const after=await loadModule('../lib/optimizer.ts');
const {applyKeeperPreset,KEEPER_TEAMS}=await loadModule('../lib/keeper-preset.ts');
const now=Date.parse('2026-09-07T21:00:00Z');
let players=Array.from({length:620},(_,i)=>({id:`p${i}`,name:`Player ${i}`,pos:['QB','RB','WR','TE','DST','K'][i%6],team:'BUF',projectedPoints:Math.max(1,360-Math.floor(i/6)*4),adp:i+1,consensusRank:i+1,dynastyRank:Math.max(1,i-5),age:25,tier:1,bye:5+i%9,rankStdDev:4,adpStdDev:8,season:2026,fetchedAt:new Date(now).toISOString(),projectionUpdatedAt:new Date(now).toISOString(),hasProjection:true,active:true}));
if(process.env.SITE_READ_TOKEN){const r=await fetch('https://fourth-down-draft-room.oletheone.chatgpt.site/api/fantasypros?season=2026&scoring=STD',{headers:{'OAI-Sites-Authorization':`Bearer ${process.env.SITE_READ_TOKEN}`}});assert.equal(r.status,200);players=(await r.json()).players;}
const base=after.normalizeSettings({userTeam:'Team 8',draftSlot:8,scoring:'standard',mode:'balanced',starters:{QB:1,RB:2,WR:2,TE:1,FLEX:2,DST:1,K:0},bench:6,simulations:12,rulesConfirmed:true});
const results=[];
for(const mode of ['traditional','keeper'])for(const completed of [7,67,139]){
 const state=mode==='keeper'?applyKeeperPreset({players,drafted:[],settings:base,teams:KEEPER_TEAMS}):{players,drafted:[],settings:base,teams:Array.from({length:12},(_,i)=>`Team ${i+1}`)};
 const keepers=after.keeperSlots(state.drafted,state.teams),used=new Set(state.drafted.map(d=>d.playerId));
 const rosters=new Map(state.teams.map(t=>[t,state.drafted.filter(d=>d.owner===t).map(d=>after.evaluatePlayer(state.players.find(p=>p.id===d.playerId),state.settings,{now,season:2026}))]));
 const pool=state.players.filter(p=>p.active!==false&&p.hasProjection!==false).map(p=>after.evaluatePlayer(p,state.settings,{now,season:2026}));
 for(let pick=1;pick<=completed;pick++){
  if(keepers.has(pick))continue;const owner=after.ownerAt(pick,state.teams),roster=rosters.get(owner);
  const p=pool.find(p=>!used.has(p.id)&&after.canDraft(roster,p,state.settings));if(!p)continue;
  used.add(p.id);roster.push(p);state.drafted.push({playerId:p.id,playerName:p.name,owner,pick,kind:'draft'});
 }
 for(const policy of ['roster-value','lookahead']){
  const settings={...state.settings,recommendationPolicy:policy};const context={now,season:2026,draftMode:mode,seed:4817};
  const args=[state.players,state.drafted,settings,state.teams,context];
  let t=performance.now();const expected=before.analyzeDraft(...args);const oldMs=performance.now()-t;
  let ready,readyMs;t=performance.now();const actual=after.analyzeDraft(...args,pick=>{ready=pick;readyMs=performance.now()-t;});const newMs=performance.now()-t;
  assert.deepEqual(actual,expected,`${mode}/${completed}/${policy}: entire result must match, including order, exact scores, plans and warnings`);
  if(policy==='roster-value'&&expected.recommendations.length){assert.ok(ready);assert.equal(ready.player.id,expected.recommendations[0].id);assert.equal(ready.marginalPoints,expected.recommendations[0].marginalPoints);}else assert.equal(ready,undefined);
  results.push({mode,completed,policy,readyMs:readyMs===undefined?null:Math.round(readyMs),oldMs:Math.round(oldMs),newMs:Math.round(newMs),speedup:Number((oldMs/newMs).toFixed(2))});
  console.log(JSON.stringify(results.at(-1)));
 }
}
const oldTotal=results.reduce((a,r)=>a+r.oldMs,0),newTotal=results.reduce((a,r)=>a+r.newMs,0);
console.log(JSON.stringify({cases:results.length,allOutputsExactlyEqual:true,players:players.length,oldTotalMs:oldTotal,newTotalMs:newTotal,speedup:oldTotal/newTotal}));

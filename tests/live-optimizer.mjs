import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {performance} from 'node:perf_hooks';
import {loadModule as moduleAt} from './load-module.mjs';
assert.ok(process.env.FANTASYPROS_API_KEY,'An authorized runtime key is required; never commit it');
const {GET}=await moduleAt('../app/api/fantasypros/route.ts');const {analyzeDraft,normalizeSettings}=await moduleAt('../lib/optimizer.ts');
for(const scoring of ['STD','PPR']){
 const response=await GET(new Request(`https://fourth-down.test/api/fantasypros?season=2026&scoring=${scoring}`));const data=await response.json();assert.equal(response.status,200);assert.ok(data.players.filter(p=>p.hasProjection).length>=100);assert.ok(data.players.some(p=>p.injuryStatus));assert.ok(data.players.some(p=>p.newsHeadline));assert.ok(data.players.some(p=>p.adpSource==='average'));assert.ok(data.players.some(p=>p.rankStdDev>0));
 assert.ok(data.players.some(p=>p.stats?.rec>0));assert.ok(data.players.some(p=>p.stats?.fumbles_lost>0));
 const teams=Array.from({length:12},(_,i)=>`Team ${i+1}`);const settings=normalizeSettings({userTeam:'Team 5',draftSlot:5,scoring:scoring==='PPR'?'ppr':'standard',mode:'balanced',starters:{QB:1,RB:2,WR:2,TE:1,FLEX:1,K:1,DST:1},bench:6,simulations:12,rulesConfirmed:true});
 const active=data.players.filter(p=>p.hasProjection&&p.projectedPoints>0).sort((a,b)=>a.adp-b.adp);
 const keepers=active.slice(0,36).map((p,i)=>({playerId:p.id,playerName:p.name,owner:teams[Math.floor(i/3)],pick:i+1,kind:'keeper',costRound:[5,7,9][i%3]}));
 for(const mode of ['traditional','keeper']){const start=performance.now();const a=analyzeDraft(data.players,mode==='keeper'?keepers:[],settings,teams,{draftMode:mode,season:2026,dataSource:'fantasypros',lastSync:data.updatedAt,warnings:data.warnings});assert.ok(a.recommendations.length>=3);assert.ok(a.recommendations.every(p=>Number.isFinite(p.score)&&p.projectedValue>0));if(mode==='keeper')assert.ok(a.recommendations.every(p=>!keepers.some(k=>k.playerId===p.id)));console.log(JSON.stringify({scoring,mode,eligible:a.eligible,excluded:a.excluded,worlds:a.simulations,candidates:a.candidateCount,elapsedMs:Math.round(performance.now()-start),best:a.recommendations[0].name,confidence:a.recommendations[0].confidence,target:a.targetPick,next:a.nextPick,sourceWarnings:data.warnings}));}
}

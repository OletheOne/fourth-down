import assert from 'node:assert/strict';
import {loadModule} from './load-module.mjs';
const {evaluatePlayer,normalizeSettings}=await loadModule('../lib/optimizer.ts');
const {keeperSettings}=await loadModule('../lib/keeper-preset.ts');
const {explainIssue,decisionNotes,slotSummary,workloadSummary}=await loadModule('../lib/decision-copy.ts');
const s=normalizeSettings(keeperSettings({userTeam:'',draftSlot:8,scoring:'standard',mode:'balanced',starters:{QB:1,RB:2,WR:2,TE:1,FLEX:2,K:0,DST:1}}));
const player=(pos,stats={})=>({id:pos,name:pos,pos,stats,projectedPoints:200,pointsByScoring:{standard:200},team:'BUF',adp:10,age:25,dynastyRank:10,tier:1,bye:7,season:2026,hasProjection:true});
for(const pos of ['RB','WR','TE']){
 const p=evaluatePlayer(player(pos,{rec:50,rush_yds:100}),s);
 assert.equal(p.value,200,'Removing an irrelevant warning must not invent passing stats or change the score');
 assert.ok(!p.issues.some(i=>i.includes('pass_ints')));
}
assert.equal(evaluatePlayer(player('QB',{pass_ints:12}),s).value,188,'The extra -1 interception adjustment still applies exactly once');
assert.match(evaluatePlayer(player('QB'),s).issues.join(' '),/Missing pass_ints/);
assert.match(evaluatePlayer(player('QB',{pass_ints:NaN}),s).issues.join(' '),/Missing pass_ints/);
assert.match(evaluatePlayer(player('WR',{pass_att:1}),s).issues.join(' '),/Missing pass_ints/,'Non-QB passing roles still require complete passing data');
assert.equal(evaluatePlayer(player('WR',{pass_ints:2}),s).value,198);
assert.match(evaluatePlayer(player('WR'),{...s,positionScoring:{WR:{pass_ints:-3}}}).issues.join(' '),/Missing pass_ints/,'Explicit custom position rules remain auditable');
assert.ok(!evaluatePlayer(player('QB'),{...s,customScoring:{rec:1}}).issues.some(i=>i.includes('Missing rec')));
assert.ok(!evaluatePlayer(player('TE'),{...s,customScoring:{rush_yds:.2}}).issues.some(i=>i.includes('Missing rush_yds')));
const missing=explainIssue('Missing pass_ints projection; custom scoring incomplete');assert.ok(missing.attention);assert.match(missing.text,/projected interceptions/);assert.doesNotMatch(missing.text,/pass_ints/);
assert.equal(explainIssue('Provider projection timestamp unavailable').attention,false);
assert.equal(explainIssue('Source freshness unverified').attention,true);
assert.equal(explainIssue('Unknown pick owner: Somebody').attention,true);
assert.equal(explainIssue('Recent availability news: review before drafting').attention,true);
assert.equal(explainIssue('Roster-value policy selected. Example').attention,false);
assert.equal(decisionNotes(['No current projection','No current projection']).length,1);
assert.equal(slotSummary(['RB','RB','TE','FLEX','FLEX','DST']),'2 RB · 1 TE · 2 FLEX · 1 D/ST');
assert.equal(slotSummary([]),'Starting lineup filled');
assert.equal(workloadSummary(player('RB',{rush_att:210.4,rec:43.8})),'210 carries · 44 catches');
assert.equal(workloadSummary(player('RB',{rush_att:0,rec:0})),'0 carries · 0 catches');
if(process.env.SITE_READ_TOKEN){
 const r=await fetch('https://fourth-down-draft-room.oletheone.chatgpt.site/api/fantasypros?season=2026&scoring=STD',{headers:{'OAI-Sites-Authorization':`Bearer ${process.env.SITE_READ_TOKEN}`}});assert.equal(r.status,200);const data=await r.json();
 const projected=data.players.filter(p=>p.hasProjection);
 const qbs=projected.filter(p=>p.pos==='QB');assert.ok(qbs.length>30);assert.ok(qbs.every(p=>Number.isFinite(p.stats.pass_ints)));
 const skill=projected.filter(p=>['RB','WR','TE'].includes(p.pos));assert.ok(skill.length>300);
 assert.ok(skill.every(p=>!evaluatePlayer(p,s).issues.some(i=>i.includes('Missing pass_ints'))));
 for(const qb of qbs)assert.ok(Math.abs(evaluatePlayer(qb,s).value-Math.max(0,qb.pointsByScoring.standard-qb.stats.pass_ints))<.001);
 console.log(JSON.stringify({livePlayers:data.players.length,projectedQuarterbacks:qbs.length,quarterbacksWithInterceptions:qbs.length,skillPlayersWithoutFalsePassingWarnings:skill.length,coverage:data.coverage}));
}
console.log('PASS: position-aware scoring checks, genuine missing-data alerts, unchanged scoring totals and plain-language decision copy.');

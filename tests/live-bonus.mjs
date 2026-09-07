import assert from 'node:assert/strict';
import {loadModule} from './load-module.mjs';
const {evaluatePlayer,normalizeSettings,analyzeDraft}=await loadModule('../lib/optimizer.ts');
const {applyDiscordRules}=await loadModule('../lib/discord-rules.ts');
assert.ok(process.env.SITE_READ_TOKEN,'Owner-private site read token is required');
const response=await fetch('https://fourth-down-draft-room.oletheone.chatgpt.site/api/fantasypros?season=2026&scoring=STD',{headers:{'OAI-Sites-Authorization':`Bearer ${process.env.SITE_READ_TOKEN}`}});
assert.equal(response.status,200);const data=await response.json();
const s=normalizeSettings(applyDiscordRules({userTeam:'Team 5',draftSlot:5,mode:'balanced',scoring:'standard',starters:{QB:1,RB:2,WR:3,TE:1,FLEX:0,K:1,DST:1},simulations:4}));
// Test generic specialist models independently of the no-kicker Discord lineup.
const evaluated=data.players.filter(p=>p.hasProjection&&p.projectedPoints>0).map(p=>evaluatePlayer(p,{...s,bonusRules:{...s.bonusRules,fieldGoals:[3,4,5]}}));
const specialists=evaluated.filter(p=>p.pos==='K'||p.pos==='DST');
const exclusions=specialists.filter(p=>p.bonusDetails.length===0);
console.log(JSON.stringify({httpStatus:response.status,projected:evaluated.length,specialists:specialists.length,modeled:specialists.length-exclusions.length,excluded:exclusions.map(p=>({name:p.name,issues:p.issues.filter(x=>/Bonus|baseline|bonus/.test(x))})),examples:['K','DST'].map(pos=>{const p=specialists.find(q=>q.pos===pos);return {name:p?.name,value:p?.value,estimatedAdjustment:p?.estimatedBonusPoints,details:p?.bonusDetails};})},null,2));
assert.ok(specialists.filter(p=>p.pos==='K'&&p.bonusDetails.length).length>=20);
assert.ok(specialists.filter(p=>p.pos==='DST'&&p.bonusDetails.length).length>=30);
const teams=Array.from({length:12},(_,i)=>`Team ${i+1}`);
for(const draftMode of ['traditional','keeper']){
 const keepers=draftMode==='keeper'?evaluated.slice().sort((a,b)=>a.adp-b.adp).slice(0,36).map((p,i)=>({playerId:p.id,owner:teams[Math.floor(i/3)],pick:i+1,kind:'keeper',costRound:[5,7,9][i%3]})):[];
 const result=analyzeDraft(data.players,keepers,s,teams,{draftMode,season:2026});
 assert.ok(result.recommendations[0].baseline,'Evidence gate must select the roster-value policy');
 assert.ok(result.recommendations.every(p=>!keepers.some(k=>k.playerId===p.id)));
 assert.ok(result.recommendations.every(p=>Number.isFinite(p.score)));
 console.log(JSON.stringify({draftMode,recommendations:result.recommendations.length,defaultPolicyIsBaseline:true}));
}

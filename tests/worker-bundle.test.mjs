import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {loadModule} from './load-module.mjs';
const dir=new URL('../dist/client/_next/static/chunks/',import.meta.url);
const file=(await readdir(dir)).find(n=>/^page-.*\.js$/.test(n));assert.ok(file);
const page=await readFile(new URL(file,dir),'utf8');
// Vite 8 embeds the complete worker as a quoted string for ?worker&inline.
const embedded=page.match(/(?:var |,)([\w$]+)=('(?:\\.|[^'\\])*'),[\w$]+=typeof self/);
assert.ok(embedded,'Production page must contain the inline worker source');
const source=vm.runInNewContext(embedded[2]);
assert.ok(source.includes('self.onmessage'));assert.ok(page.includes('createObjectURL'));
assert.ok(!page.includes('/_next/static/draft.worker-'),'Worker startup must not request another private HTTP resource');
assert.ok(page.includes('data:text/javascript;charset=utf-8,'),'Inline factory retains a data-URL fallback');
let output;const self={postMessage(value){output=value;}};
vm.runInNewContext(source,{self,console,Date,Map,Set,Math},{timeout:20000});
const settings={userTeam:'A',draftSlot:1,scoring:'ppr',mode:'contend',starters:{QB:1,RB:1,WR:1,TE:1,FLEX:1,K:0,DST:0}};
self.onmessage({data:{players:[],drafted:[],teams:['A','B'],settings,context:{draftMode:'traditional'}}});
assert.ok(output.analysis);assert.equal(output.analysis.version,'roster-lookahead-3');
const {applyKeeperPreset,KEEPER_TEAMS}=await loadModule('../lib/keeper-preset.ts');
let players=Array.from({length:220},(_,i)=>({id:`p${i}`,name:`P${i}`,pos:['QB','RB','WR','TE','DST','K'][i%6],team:'BUF',projectedPoints:400-i,adp:i+1,age:25,dynastyRank:i+1,tier:1,bye:5,season:2026,hasProjection:true,active:true}));
if(process.env.SITE_READ_TOKEN){
 const {requestSiteJson}=await loadModule('../lib/client-json.ts');
 const data=await requestSiteJson('https://fourth-down-draft-room.oletheone.chatgpt.site/api/fantasypros?season=2026&scoring=STD',(url,init)=>fetch(url,{...init,headers:{...init.headers,'OAI-Sites-Authorization':`Bearer ${process.env.SITE_READ_TOKEN}`}}));
 players=data.players;assert.ok(players.length>100);
}
const state=applyKeeperPreset({players,drafted:[],settings:{...settings,simulations:4}});
self.onmessage({data:{...state,teams:KEEPER_TEAMS,context:{draftMode:'keeper',season:2026}}});
assert.ok(!output.error,output.error);assert.equal(output.analysis.targetPick,8);assert.equal(output.analysis.nextPick,17);assert.ok(output.analysis.recommendations.length>0);
assert.ok(output.analysis.recommendations.every(p=>p.pos!=='K'&&!state.drafted.some(k=>k.playerId===p.id)));
console.log(`Production inline worker executed with ${players.length} ${process.env.SITE_READ_TOKEN?'live':'fixture'} players and 32 keepers; no separate worker HTTP request.`);

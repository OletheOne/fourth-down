import type {Player,DraftedPlayer,LeagueSettings,Position} from './draft';
import {applyDiscordRules} from './discord-rules';
export const KEEPER_PROFILE_ID='discord-league';
export const TRADITIONAL_PROFILE_ID='traditional-draft';
export const KEEPER_PRESET_REVISION='espn-keepers-2026-09-07';
export const KEEPER_TEAM='Super Smash Burrows';
// Inferred snake order, independently consistent with ALL 32 screenshot assignments.
export const KEEPER_TEAMS=['DRILLAS','This Team is the Pitts','Dport Hood Popes',"Dude, Where’s Ja’Marr?",'Allen the Family','McConkey Kong','Mitchell-Gold Agency',KEEPER_TEAM,'Green Eggs and Hampton','The Implication','Colonel Sanders Bow Tie','Killa Kerm'];
type KeeperRow={owner:string;name:string;pos:Position;team:string;round:number;pickInRound:number};
const row=(slot:number,name:string,pos:Position,team:string,round:number,pickInRound:number):KeeperRow=>({owner:KEEPER_TEAMS[slot-1],name,pos,team,round,pickInRound});
// These are THIS YEAR'S finalized costs, not prior draft rounds: never escalate again.
export const KEEPER_ROWS:KeeperRow[]=[
 row(7,'Quinshon Judkins','RB','CLE',9,7),row(7,'Emeka Egbuka','WR','TB',6,6),row(7,'Brock Bowers','TE','LV',7,7),
 row(10,'Jahmyr Gibbs','RB','DET',1,10),row(10,'A.J. Brown','WR','NE',2,3),row(10,'Colston Loveland','TE','CHI',8,3),
 row(9,'Puka Nacua','WR','LAR',13,9),row(9,'Omarion Hampton','RB','LAC',2,4),row(9,'Travis Etienne Jr.','RB','NO',7,9),
 row(5,'Josh Allen','QB','BUF',1,5),row(5,'Chase Brown','RB','CIN',5,5),
 row(8,'Rashee Rice','WR','KC',12,5),row(8,'Nico Collins','WR','HOU',6,5),
 row(4,'James Cook III','RB','BUF',3,4),row(4,'Bhayshul Tuten','RB','JAX',15,4),row(4,'Harold Fannin Jr.','TE','CLE',14,9),
 row(6,'Tyler Warren','TE','IND',7,6),row(6,'Rome Odunze','WR','CHI',6,7),row(6,'Ladd McConkey','WR','LAC',5,6),
 row(2,'Kyle Pitts Sr.','TE','ATL',11,2),row(2,'Parker Washington','WR','JAX',15,2),
 row(1,'Justin Herbert','QB','LAC',12,12),row(1,"Wan’Dale Robinson",'WR','TEN',13,1),
 row(3,'Lamar Jackson','QB','BAL',2,10),row(3,'Javonte Williams','RB','DAL',8,10),row(3,'CeeDee Lamb','WR','DAL',1,3),
 row(11,'DeVonta Smith','WR','PHI',6,2),row(11,"De’Von Achane",'RB','MIA',13,11),row(11,'Jonathan Taylor','RB','IND',4,2),
 row(12,'Trey McBride','TE','ARI',13,12),row(12,'Luther Burden III','WR','CHI',15,12),row(12,'Jaxon Smith-Njigba','WR','SEA',5,12),
];
export const identity=(name='')=>name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const playerIdentity=(name:string)=>identity(name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i,''));
export function findKeeperPlayer(players:Player[],name:string){
 const exact=players.filter(p=>identity(p.name)===identity(name));
 if(exact.length===1)return exact[0];
 const aliases=players.filter(p=>playerIdentity(p.name)===playerIdentity(name));
 return aliases.length===1?aliases[0]:undefined;
}
export const keeperOverallPick=(r:KeeperRow)=>(r.round-1)*12+r.pickInRound;
export function presetPlayers(players:Player[]):Player[]{
 return [...players,...KEEPER_ROWS.filter(r=>!findKeeperPlayer(players,r.name)).map(r=>({id:`keeper-${playerIdentity(r.name)}`,name:r.name,pos:r.pos,team:r.team,projectedPoints:0,adp:999,age:0,dynastyRank:999,tier:99,bye:0,season:2026,hasProjection:false,active:true}))];
}
export function presetKeepers(players:Player[]):DraftedPlayer[]{
 return KEEPER_ROWS.map(r=>({playerId:findKeeperPlayer(players,r.name)?.id??`keeper-${playerIdentity(r.name)}`,playerName:r.name,owner:r.owner,pick:keeperOverallPick(r),pickInRound:r.pickInRound,costRound:r.round,kind:'keeper'}));
}
export function keeperSettings(s:LeagueSettings):LeagueSettings{
 return {...applyDiscordRules(s),userTeam:KEEPER_TEAM,draftSlot:8,rulesConfirmed:true};
}
type PresetState={players:Player[];drafted:DraftedPlayer[];settings:LeagueSettings;teams?:string[];draftMode?:'keeper'|'traditional';espnSeason?:number;espnLeagueName?:string;leagueRosters?:Array<{team:string;players:string[]}>;rostersAreCurrentDraft?:boolean};
export function applyKeeperPreset<T extends PresetState>(state:T):T{
 const players=presetPlayers(state.players);
 // Replace only keeper records. Existing live selections are retained, with known
 // keeper duplicates removed if an upstream feed categorized them as ordinary picks.
 const fixed=presetKeepers(players);
 const picks=state.drafted.filter(d=>d.kind==='draft'&&!fixed.some(k=>k.playerId===d.playerId||playerIdentity(k.playerName!)===playerIdentity(d.playerName??'')));
 return {...state,players,drafted:[...fixed,...picks],settings:keeperSettings(state.settings),teams:[...KEEPER_TEAMS],draftMode:'keeper',espnSeason:2026,espnLeagueName:'Discord League',leagueRosters:[],rostersAreCurrentDraft:false};
}
export function prepareProfileState<T extends PresetState>(state:T,profileId:string):T{
 return profileId===KEEPER_PROFILE_ID?applyKeeperPreset(state):{...state,draftMode:'traditional'};
}
export function validateKeeperSnapshot(snapshot:{leagueName?:string;season?:number;teams:Array<string|{name:string}>}){
 if(snapshot.season!==undefined&&snapshot.season!==2026)throw Error('The confirmed keeper draft is for the 2026 season.');
 if(snapshot.leagueName&&identity(snapshot.leagueName)!==identity('Discord League'))throw Error('This is the dedicated Discord keeper draft. Use Traditional mode for another league.');
 const names=snapshot.teams.map(t=>typeof t==='string'?t:t.name);
 if(names.length!==12||new Set(names.map(identity)).size!==12||names.some(n=>!KEEPER_TEAMS.some(t=>identity(t)===identity(n))))throw Error('Synced teams do not match the confirmed keeper league.');
}
export function mergeKeeperPicks(existing:DraftedPlayer[],incoming:DraftedPlayer[],players:Player[]=[]):DraftedPlayer[]{
 const fixed=presetKeepers([]);const reserved=new Set(fixed.map(k=>k.pick));
 const result=new Map(existing.filter(p=>p.kind==='draft').map(p=>[p.pick,p]));
 for(const p of incoming){
  const keeper=fixed.find(k=>playerIdentity(k.playerName!)===playerIdentity(p.playerName??''));
  if(keeper){if(p.pick!==keeper.pick||identity(p.owner)!==identity(keeper.owner))throw Error(`Keeper assignment conflicts with the confirmed screenshot: ${p.playerName}`);continue;}
  if(!Number.isInteger(p.pick)||p.pick<1||p.pick>180||reserved.has(p.pick))throw Error(`Pick ${p.pick} is invalid or reserved for a keeper.`);
  if(players.find(q=>q.id===p.playerId)?.pos==='K')throw Error('This league has no kicker slots; kickers cannot be drafted.');
  const round=Math.floor((p.pick-1)/12),index=(p.pick-1)%12;
  const owner=KEEPER_TEAMS[round%2?11-index:index];
  if(identity(owner)!==identity(p.owner))throw Error(`Pick ${p.pick} belongs to ${owner}.`);
  const prior=result.get(p.pick);
  if(prior&&identity(prior.playerName??prior.playerId)!==identity(p.playerName??p.playerId))throw Error(`Pick ${p.pick} conflicts with an existing selection; undo it before replacing.`);
  if([...result.values()].some(q=>q.pick!==p.pick&&(q.playerId===p.playerId||playerIdentity(q.playerName??q.playerId)===playerIdentity(p.playerName??p.playerId))))throw Error(`${p.playerName} is already drafted.`);
  result.set(p.pick,{...p,owner});
 }
 return [...result.values()].sort((a,b)=>a.pick-b.pick);
}

import type {DraftedPlayer,Player} from './draft';

export function teamRosters(teams:string[],drafted:DraftedPlayer[],players:Player[],userTeam:string){
  const names=[...new Set([...teams,...drafted.map(p=>p.owner)])];
  const lookup=new Map(players.map(p=>[p.id,p]));
  return names.map(owner=>({owner,isUser:owner===userTeam,entries:drafted.filter(p=>p.owner===owner).map(entry=>{
    const player=lookup.get(entry.playerId)??players.find(p=>p.name.toLowerCase()===entry.playerName?.toLowerCase());
    const slot=teams.indexOf(owner)+1;
    const round=entry.kind==='keeper'?entry.costRound:teams.length&&entry.pick>0?Math.ceil(entry.pick/teams.length):undefined;
    const inRound=entry.kind==='keeper'?(entry.pickInRound??(round&&slot?round%2?slot:teams.length-slot+1:undefined)):teams.length&&entry.pick>0?(entry.pick-1)%teams.length+1:undefined;
    const overall=entry.kind==='keeper'?(round&&inRound?(round-1)*teams.length+inRound:undefined):entry.pick>0?entry.pick:undefined;
    return {...entry,name:player?.name??entry.playerName??entry.playerId,pos:player?.pos,nflTeam:player?.team,round,inRound,overall};
  }).sort((a,b)=>(a.overall??Infinity)-(b.overall??Infinity))}));
}

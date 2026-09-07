'use client';
import {useState} from 'react';
import type {DraftedPlayer,Player} from '@/lib/draft';
import {teamRosters} from '@/lib/team-rosters';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Badge} from '@/components/ui/badge';

export function TeamRosters({teams,drafted,players,userTeam}:{teams:string[];drafted:DraftedPlayer[];players:Player[];userTeam:string}){
  const [selected,setSelected]=useState(userTeam);
  const rosters=teamRosters(teams,drafted,players,userTeam);
  const roster=rosters.find(r=>r.owner===selected)??rosters.find(r=>r.isUser)??rosters[0];
  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold">Team rosters</h2><p className="mt-1 text-sm text-muted-foreground">Recorded picks and keepers in this draft. Updates as picks are added, synced or undone.</p></div>
    <Select value={roster?.owner??''} onValueChange={v=>setSelected(v as string)}><SelectTrigger aria-label="View team roster" className="h-auto min-h-10 w-full"><SelectValue/></SelectTrigger><SelectContent>{rosters.map(r=><SelectItem key={r.owner} value={r.owner}>{r.owner}{r.isUser?' (you)':''} · {r.entries.length}</SelectItem>)}</SelectContent></Select>
    {roster&&<><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{roster.isUser?'Your team':roster.owner}</h3><Badge variant="outline">{roster.entries.length} players · {roster.entries.filter(e=>e.kind==='keeper').length} keepers</Badge></div>
    {roster.entries.length?<ol className="divide-y rounded-lg border">{roster.entries.map((p,i)=><li key={`${p.playerId}:${p.pick}:${i}`} className="p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{p.name}</span>{p.kind==='keeper'&&<Badge variant="secondary">Keeper</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{p.pos??'Position unavailable'}{p.nflTeam?` · ${p.nflTeam}`:''}</p><p className="mt-1 text-sm">{p.round&&p.inRound?`Round ${p.round} · pick ${p.inRound} · overall #${p.overall}`:'Draft slot not recorded'}</p></li>)}</ol>:<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No picks or keepers recorded for this team yet.</p>}</>}
    <p className="text-sm text-muted-foreground">{drafted.length} total recorded across {rosters.length} teams. This shows Fourth Down’s records, not an independent confirmation from ESPN.</p>
  </div>;
}

"""Time-ordered rank-to-points forecasts and real weekly outcomes kept separately.

Archives contain PPR ECR, not ADP or historical FantasyPros projected stats.
No archive data/derived rank model is shipped to the production application.
"""
from pathlib import Path
import json
import re
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parent; CACHE=ROOT/'cache'
def namekey(n): return re.sub('[^a-z0-9]','',str(n).lower())
def teamkey(t): return {'JAC':'JAX','LA':'LAR','OAK':'LV','SD':'LAC','STL':'LAR'}.get(t,t)

def prepare():
    archive=pd.read_csv(CACHE/'preseason-rankings.csv',dtype={'id':str})
    ids=pd.read_csv(CACHE/'ids.csv',dtype=str)
    lookup=ids.dropna(subset=['fantasypros_id','gsis_id']).drop_duplicates('fantasypros_id').set_index('fantasypros_id').gsis_id.to_dict()
    games=pd.read_csv(CACHE/'games.csv')
    snapshots={}; outcomes={}; missing={}; dates={}; byes={}
    for year in range(2021,2026):
        rows=archive[(archive.page_type=='redraft-overall')&archive.scrape_date.str.startswith(str(year))]
        date=rows.scrape_date.max(); dates[year]=date
        rows=rows[rows.scrape_date==date].drop_duplicates('id').sort_values(['ecr','id']).copy()
        rows=rows[rows.pos.isin(['QB','RB','WR','TE','K','DST'])]
        rows['posRank']=rows.groupby('pos').cumcount()+1
        snapshots[year]=rows
        p=pd.read_csv(CACHE/f'player_{year}.csv',low_memory=False)
        p=p[(p.season_type=='REG')&(p.week<=17)]
        t=pd.read_csv(CACHE/f'team_{year}.csv');t=t[t.season_type=='REG']
        tlookup=t.set_index(['game_id','team'])
        g=games[(games.season==year)&(games.game_type=='REG')].set_index('game_id')
        byes[year]={}
        for team in set(g.home_team)|set(g.away_team):
            played=set(g[(g.home_team==team)|(g.away_team==team)].week)
            byes[year][teamkey(team)]=next(iter(set(range(1,19))-played),0)
        byname=p.drop_duplicates(['player_id','player_display_name']).groupby(p.player_display_name.map(namekey)).player_id.agg(set).to_dict()
        missing[year]=[]; outcomes[year]={}
        for row in rows.itertuples():
            weekly=[]
            if row.pos=='DST':
                team=teamkey(row.team)
                for q in t[(t.team.map(teamkey)==team)&(t.week<=17)].itertuples():
                    game=g.loc[q.game_id]; opp=tlookup.loc[(q.game_id,q.opponent_team)]
                    pa=max(0,(game.away_score if game.away_team==q.opponent_team else game.home_score)-6*opp.def_tds-2*opp.def_safeties-2*opp.def_2pt_made)
                    bonus=[10,7,4,1,0,-1,-4][int(np.searchsorted([0,6,13,20,27,34],pa,side='left'))]
                    pts=2*q.def_sacks+2*q.def_interceptions+2*q.fumble_recovery_opp+6*(q.def_tds+q.special_teams_tds)+2*q.def_safeties+bonus
                    weekly.append((q.week,float(pts),0))
            else:
                pid=lookup.get(row.id)
                if not pid:
                    matches=byname.get(namekey(row.player),set())
                    if len(matches)==1: pid=next(iter(matches))
                if not pid: missing[year].append(dict(name=row.player,rank=float(row.ecr),pos=row.pos))
                for q in p[p.player_id==pid].itertuples():
                    if row.pos=='K':
                        pts=3*q.fg_made+q.fg_made_40_49+2*(q.fg_made_50_59+q.fg_made_60_)+q.pat_made
                    else:
                        pts=.04*q.passing_yards+4*q.passing_tds-2*q.passing_interceptions+.1*(q.rushing_yards+q.receiving_yards)+6*(q.rushing_tds+q.receiving_tds)+2*(q.passing_2pt_conversions+q.rushing_2pt_conversions+q.receiving_2pt_conversions)-2*(q.sack_fumbles_lost+q.rushing_fumbles_lost+q.receiving_fumbles_lost)
                    weekly.append((q.week,float(pts),float(q.receptions)))
            outcomes[year][row.id]=weekly
    reports=[]
    for scoring in ['standard','ppr']:
        totals={year:{pid:sum(x[1]+(x[2] if scoring=='ppr' else 0) for x in weeks) for pid,weeks in o.items()} for year,o in outcomes.items()}
        for year in [2023,2024,2025]:
            players=[]; weekly={}
            for row in snapshots[year].itertuples():
                # Local smoothing by positional rank, fitted on prior seasons only.
                training=[(r.posRank,totals[y][r.id]) for y in range(2021,year) for r in snapshots[y].itertuples() if r.pos==row.pos]
                width=max(3,row.posRank*.2)
                weights=np.array([np.exp(-.5*((rank-row.posRank)/width)**2) for rank,_ in training])
                estimate=float(np.dot(weights,[pts for _,pts in training])/weights.sum())
                pid='historical-'+row.id
                players.append(dict(id=pid,name=row.player,pos=row.pos,team=teamkey(row.team),projectedPoints=max(.1,estimate),adp=float(row.ecr),consensusRank=float(row.ecr),adpSource='rank-proxy',dynastyRank=999,age=0,tier=1,bye=byes[year].get(teamkey(row.team),0),hasProjection=True,active=True,season=year,fetchedAt=dates[year]+'T00:00:00Z',projectionUpdatedAt=dates[year]+'T00:00:00Z',projectionScoring=scoring,rankStdDev=float(row.sd) if pd.notna(row.sd) else 0))
                weekly[pid]={str(w):pts+(rec if scoring=='ppr' else 0) for w,pts,rec in outcomes[year][row.id]}
            report=dict(year=year,scoring=scoring,asOf=dates[year],players=len(players),unmatched=missing[year],unmatchedTop180=[p for p in missing[year] if p['rank']<=180],trainingYears=list(range(2021,year)))
            reports.append(report)
            (CACHE/f'draft-{year}-{scoring}.json').write_text(json.dumps(dict(metadata=report,players=players,outcomes=weekly)))
    (ROOT/'historical-coverage.json').write_text(json.dumps(reports,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in r.items() if k!='unmatched'} for r in reports],indent=2))

if __name__=='__main__': prepare()

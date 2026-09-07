"""Extract pre-kickoff draft snapshots, preserving ranked zero-outcome players."""
from pathlib import Path
import json
import pandas as pd

ROOT=Path(__file__).resolve().parent; CACHE=ROOT/'cache'
games=pd.read_csv(CACHE/'games.csv')
deadlines={y: games[(games.season==y)&(games.game_type=='REG')].gameday.min() for y in range(2021,2026)}
parts=[]
cols=['fp_page','page_type','ecr_type','player','id','pos','team','ecr','sd','best','worst','scrape_date']
for chunk in pd.read_csv(CACHE/'rankings.csv.gz',usecols=cols,chunksize=200000,low_memory=False):
    dates=chunk.scrape_date.astype(str)
    keep=pd.Series(False,index=chunk.index)
    for year,deadline in deadlines.items(): keep |= (dates>=f'{year}-08-01') & (dates<deadline)
    part=chunk[keep]
    if len(part): parts.append(part)
data=pd.concat(parts,ignore_index=True)
data.to_csv(CACHE/'preseason-rankings.csv',index=False)
print('Eligible snapshots',len(data),'pages',data.groupby(['page_type','ecr_type']).size().to_dict())
print('Date coverage',data.scrape_date.min(),data.scrape_date.max())
print(json.dumps(deadlines,indent=2))

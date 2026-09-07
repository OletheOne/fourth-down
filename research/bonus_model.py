"""Empirical Bayes event distributions, chronological evaluation, compact runtime artifact.

Data: nflverse (CC BY 4.0). NFL scoring reconstruction is not an ESPN box-score feed.
No future data enters a historical forecast; validation chooses only shrinkage.
"""
from pathlib import Path
import json
import re
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / 'cache'
PA_WEIGHTS = np.array([10, 7, 4, 1, 0, -1, -4])
FG_WEIGHTS = np.array([0, 1, 2])  # Extra points above three per made FG.
ALPHAS = [0, 16, 32, 64, 128, 1000000000]
def key(value):
    return re.sub('[^a-z0-9]', '', str(value).lower())

def load_events():
    kickers, defenses = [], []
    games = pd.read_csv(CACHE / 'games.csv').set_index('game_id')
    for year in range(2018, 2026):
        p = pd.read_csv(CACHE / f'player_{year}.csv')
        p = p[(p.season_type == 'REG') & (p.fg_made > 0)].copy()
        p['key'] = p.player_display_name.map(key)
        p['b0'] = p.fg_made_0_19 + p.fg_made_20_29 + p.fg_made_30_39
        p['b1'] = p.fg_made_40_49
        p['b2'] = p.fg_made_50_59 + p.fg_made_60_
        assert (p[['b0','b1','b2']].sum(axis=1) == p.fg_made).all()
        kickers.append(p[['season','key','b0','b1','b2']])
        t = pd.read_csv(CACHE / f'team_{year}.csv')
        t = t[t.season_type == 'REG'].copy()
        opponent = t.set_index(['game_id','team'])
        for row in t.itertuples():
            game = games.loc[row.game_id]
            opp = opponent.loc[(row.game_id, row.opponent_team)]
            score = game.away_score if game.away_team == row.opponent_team else game.home_score
            # Exclude opponent defensive TDs and safeties, retain special-teams scores
            # and all PATs. Rare defensive conversion returns are separately excluded.
            pa = max(0, score - 6*opp.def_tds - 2*opp.def_safeties - 2*opp.def_2pt_made)
            band = int(np.searchsorted([0, 6, 13, 20, 27, 34], pa, side='left'))
            defenses.append(dict(season=year, key=row.team, **{f'b{i}': int(i==band) for i in range(7)}))
    return pd.concat(kickers), pd.DataFrame(defenses)

def distribution(data, year, alpha, bins):
    # Recent three seasons, exponential recency; no same-season rows.
    history = data[(data.season < year) & (data.season >= year-3)].copy()
    cols = [f'b{i}' for i in range(bins)]
    history[cols] = history[cols].mul(0.65 ** (year-1-history.season), axis=0)
    counts = history[cols].sum().to_numpy(float)
    prior = (counts + 1) / (counts.sum() + bins)
    groups = history.groupby('key')[cols].sum()
    profiles = {str(k): ((r.to_numpy(float)+alpha*prior)/(r.sum()+alpha)).tolist() for k,r in groups.iterrows() if r.sum()+alpha > 0}
    return prior, profiles

def metrics(data, year, alpha, weights):
    bins=len(weights); cols=[f'b{i}' for i in range(bins)]
    prior, profiles = distribution(data, year, alpha, bins)
    rows=[]; all_loss=all_n=0
    for name, row in data[data.season==year].groupby('key')[cols].sum().iterrows():
        counts=row.to_numpy(float); n=counts.sum(); p=np.array(profiles.get(name,prior))
        # Categorical Brier sum over actual event counts, without expanding events.
        loss=n*(1+(p*p).sum())-2*np.dot(counts,p)
        all_loss+=loss; all_n+=n
        actual=float(np.dot(counts,weights)); forecast=float(n*np.dot(p,weights))
        rows.append(dict(key=name, n=float(n), actual=actual, forecast=forecast, error=forecast-actual))
    return dict(year=year, units=len(rows), events=int(all_n), brier=all_loss/all_n,
                mae=float(np.mean([abs(r['error']) for r in rows])),
                bias=float(np.mean([r['error'] for r in rows])), rows=rows)

def build():
    datasets=load_events(); artifact=dict(version='nflverse-bonus-1', forecastSeason=2026, trainedThrough=2025,
        source='nflverse', sourceUrl='https://github.com/nflverse/nflverse-data', license='CC-BY-4.0',
        pointsAllowedDefinition='Game score excluding opponent defensive TDs, safeties and defensive conversion returns; not independently reconciled against ESPN game logs.')
    report={}
    for name,data,weights in zip(['kicker','defense'],datasets,[FG_WEIGHTS,PA_WEIGHTS]):
        dev={str(alpha): float(np.mean([metrics(data,year,alpha,weights)['brier'] for year in [2020,2021,2022]])) for alpha in ALPHAS}
        alpha=min(ALPHAS,key=lambda a:dev[str(a)])
        held=[metrics(data,year,alpha,weights) for year in [2023,2024,2025]]
        prior=[metrics(data,year,1000000000,weights) for year in [2023,2024,2025]]
        for result in held:
            baseline=next(x for x in prior if x['year']==result['year'])
            result['priorMAE']=baseline['mae'];result['priorBrier']=baseline['brier']
            result['zeroMAE']=float(np.mean([abs(r['actual']) for r in result['rows']]))
            result.pop('rows')
        league, profiles=distribution(data,2026,alpha,len(weights))
        artifact[name]=dict(shrinkage=alpha, prior=league.tolist(), profiles=profiles,
            heldoutSeasonMAE=float(np.mean([x['mae'] for x in held])))
        report[name]=dict(selectedShrinkage=alpha,developmentBrier=dev,holdout=held,
            caveat='Kicker counts conditional on realized made-FG volume; DST conditional on games played. These tests validate event composition, not FantasyPros volume projections or draft advantage.')
    (ROOT.parent/'lib'/'bonus-model.json').write_text(json.dumps(artifact,indent=2)+'\n')
    (ROOT/'bonus-results.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__': build()

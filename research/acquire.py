"""Fetch public research inputs reproducibly; no credentials required."""
from pathlib import Path
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / 'cache'
CACHE.mkdir(exist_ok=True)
SOURCES = [
    (f'{kind}_{year}.csv', f'https://github.com/nflverse/nflverse-data/releases/download/stats_{kind}/stats_{kind}_week_{year}.csv')
    for kind in ('player', 'team') for year in range(2018, 2026)
] + [
    ('rankings.csv.gz', 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr.csv.gz'),
    ('ids.csv', 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv'),
    ('games.csv', 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'),
]

def fetch(item):
    name, url = item
    path = CACHE / name
    if not path.exists():
        with urlopen(Request(url, headers={'User-Agent': 'FourthDown-research/1.0'}), timeout=120) as response:
            payload = response.read()
        path.write_bytes(payload)
    payload = path.read_bytes()
    result = dict(file=name, url=url, bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest())
    print(f'{name}: {len(payload):,} bytes', flush=True)
    return result

if __name__ == '__main__':
    manifest = list(ThreadPoolExecutor(max_workers=4).map(fetch, SOURCES))
    (ROOT / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n')

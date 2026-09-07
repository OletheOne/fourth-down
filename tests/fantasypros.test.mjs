import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = await readFile(new URL('../app/api/fantasypros/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const request = () => new Request('https://fourth-down.test/api/fantasypros?season=2026&scoring=PPR');

if (process.argv.includes('--live')) {
  assert.ok(process.env.FANTASYPROS_API_KEY, 'A runtime key is required');
  const response = await GET(request());
  const data = await response.json();
  console.log(JSON.stringify({ status: response.status, count: data.players?.length, coverage: data.coverage, warnings: data.warnings, error: data.error,
    projected: data.players?.filter(p => p.projectedPoints > 0).length,
    ranked: data.players?.filter(p => p.consensusRank > 0 && p.consensusRank < 999).length }));
  assert.equal(response.status, 200);
  assert.ok(data.players.filter(p => p.projectedPoints > 0).length >= 100);
  assert.ok(data.players.filter(p => p.consensusRank > 0 && p.consensusRank < 999).length >= 100);
} else {
  process.env.FANTASYPROS_API_KEY = 'test-only-key';
  const rows = Array.from({ length: 150 }, (_, i) => ({ player_id: i + 1, player_name: `Player ${i}`, position_id: 'WR', team_id: 'BUF', rank_ecr: i + 1, rank_ave:i+1.5,rank_std:3,rank_min:1,rank_max:9,player_bye_week:7, stats: { points:100,points_half:150,points_ppr: 200,rec_rec:100,fumbles:2 } }));
  let failRankings = false;
  let smallPool = false;
  let failNews = false;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://api.fantasypros.com/public/v2/json/'));
    assert.equal(options.headers['x-api-key'], 'test-only-key');
    if (url.includes('consensus-rankings')) {
      assert.equal(new URL(url).searchParams.get('week'), '0');
      if (failRankings) return Response.json({ message: 'Invalid Position' }, { status: 400 });
    }
    if(url.includes('/injuries'))return Response.json({injuries:[{player_id:1,status:'IR'}]});
    if(url.includes('/news'))return failNews?Response.json({}, {status:503}):Response.json({items:[{player_id:1,title:'Older',created:'2026-09-01 12:00:00'},{player_id:1,title:'Newest',created:'2026-09-06 12:00:00',impact:'Role update'}]});
    return Response.json({ players: smallPool ? rows.slice(0, 10) : rows });
  };
  const success = await GET(request());
  assert.equal(success.status, 200);
  const successData=await success.json();const first=successData.players[0];
  assert.equal(first.projectedPoints, 200);
  assert.equal(first.adp,1.5);assert.equal(first.adpSource,'average');assert.equal(first.rankStdDev,3);assert.equal(first.bye,7);assert.equal(first.injuryStatus,'IR');assert.equal(first.newsHeadline,'Newest');assert.equal(first.newsUpdatedAt,'2026-09-06T12:00:00.000Z');assert.deepEqual(first.pointsByScoring,{standard:100,'half-ppr':150,ppr:200});assert.equal(first.stats.rec,100);assert.equal(first.hasProjection,true);assert.equal(first.active,true);
  assert.equal(first.stats.rec_rec,100);assert.equal(first.stats.fumbles_lost,2);
  failNews=true;const degraded=await GET(request());assert.equal(degraded.status,200);assert.match((await degraded.json()).warnings.join(' '),/News could not be refreshed/);failNews=false;
  failRankings = true;
  const failure = await GET(request());
  const failureBody = await failure.json();
  assert.equal(failure.status, 502);
  assert.equal(failureBody.code, 'upstream_error');
  assert.match(failureBody.error, /HTTP 400/);
  assert.doesNotMatch(failureBody.error, /sample|subscription|paid HOF/i);
  failRankings = false;
  smallPool = true;
  const incomplete = await GET(request());
  assert.equal((await incomplete.json()).code, 'incomplete_data');
  console.log('Passed: draft parameters, average ADP, expert spread, injuries, newest news, timestamps, scoring totals, stat lines, optional-feed failure, upstream error classification, incomplete-data guard.');
}

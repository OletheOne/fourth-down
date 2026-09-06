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
  const rows = Array.from({ length: 150 }, (_, i) => ({ player_id: i + 1, player_name: `Player ${i}`, position_id: 'WR', team_id: 'BUF', rank_ecr: i + 1, stats: { points_ppr: 200 } }));
  let failRankings = false;
  let smallPool = false;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://api.fantasypros.com/public/v2/json/'));
    assert.equal(options.headers['x-api-key'], 'test-only-key');
    if (url.includes('consensus-rankings')) {
      assert.equal(new URL(url).searchParams.get('week'), '0');
      if (failRankings) return Response.json({ message: 'Invalid Position' }, { status: 400 });
    }
    return Response.json({ players: smallPool ? rows.slice(0, 10) : rows });
  };
  const success = await GET(request());
  assert.equal(success.status, 200);
  assert.equal((await success.json()).players[0].projectedPoints, 200);
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
  console.log('Passed: draft parameters, successful merge, upstream error classification, incomplete-data guard.');
}

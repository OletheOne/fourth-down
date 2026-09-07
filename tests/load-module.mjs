// Dependency-aware in-memory TS loader. No source edits or temporary compiled files.
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const urls = new Map();
export async function moduleUrl(path) {
  const url = path instanceof URL ? path : new URL(path, import.meta.url);
  if (urls.has(url.href)) return urls.get(url.href);
  if (url.pathname.endsWith('.json')) {
    const source = `export default ${await readFile(url,'utf8')}`;
    return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  }
  const source = await readFile(url,'utf8');
  let js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  for (const match of [...js.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)]) {
    const spec = match[1];
    const nested = await moduleUrl(new URL(/\.(json|ts|mjs)$/.test(spec)?spec:spec+'.ts',url));
    js=js.replaceAll(`'${spec}'`,`'${nested}'`).replaceAll(`"${spec}"`,`"${nested}"`);
  }
  const result=`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  urls.set(url.href,result);return result;
}
export async function loadModule(path) { return import(await moduleUrl(path)); }

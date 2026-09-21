import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Opt-in, native Chromium coverage; no instrumentation or production runtime changes.
export async function startBrowserCoverage(page) {
  if (process.env.GR_BROWSER_COVERAGE !== '1') return async () => {};
  const directory = process.env.NODE_V8_COVERAGE;
  if (!directory) throw new Error('Browser coverage requires NODE_V8_COVERAGE');
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  return async (name) => {
    const entries = await page.coverage.stopJSCoverage();
    const origin = new URL(process.env.TEST_URL).origin;
    const result = entries.filter(entry => entry.url.startsWith(`${origin}/assets/`) && entry.url.endsWith('.js'))
      .map((entry, index) => ({
        scriptId: String(index),
        url: pathToFileURL(resolve('dist/assets', basename(new URL(entry.url).pathname))).href,
        functions: entry.functions,
      }));
    if (!result.length) throw new Error(`No application coverage collected for ${name}`);
    const sourceMaps = {};
    for (const entry of result) {
      const file = new URL(entry.url);
      let data;
      try { data = JSON.parse(await readFile(new URL(`${file.href}.map`), 'utf8')); }
      catch (error) {
        if (error.code === 'ENOENT' && file.pathname.includes('rolldown-runtime-')) continue;
        throw error;
      }
      // c8's exclusion callback sees raw map sources before final resolution.
      // Relative ../../src paths would incorrectly skip every execution range
      // and leave v8-to-istanbul's default count=1 (a false 100% report).
      data.sources = data.sources.map(source => resolve(dirname(fileURLToPath(file)), data.sourceRoot || '', source));
      delete data.sourceRoot;
      sourceMaps[entry.url] = { data };
    }
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, `browser-${process.pid}-${name}.json`), JSON.stringify({ result, 'source-map-cache': sourceMaps }));
  };
}

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const assetsDir = join(distDir, 'assets');
const entry = readdirSync(assetsDir)
  .filter(file => /^index-[^/]+\.js$/.test(file))
  .map(file => ({ file, bytes: statSync(join(assetsDir, file)).size }))
  .sort((a, b) => b.bytes - a.bytes)[0];

const maxBytes = 800 * 1024;
if (!entry) throw new Error('Could not locate the production JavaScript entry chunk.');
console.log(`${entry.file}: ${entry.bytes} bytes (budget: ${maxBytes})`);
if (entry.bytes > maxBytes) {
  throw new Error(`Production entry chunk exceeds the ${maxBytes}-byte budget.`);
}

// The static dist/index.html must carry the production CSP as a meta tag, so a
// plain static host that ignores response headers still enforces the policy.
const html = readFileSync(join(distDir, 'index.html'), 'utf8');
if (!/Content-Security-Policy/.test(html)) {
  throw new Error('dist/index.html is missing the Content-Security-Policy meta tag — static deployments would ship without CSP.');
}
console.log('dist/index.html: Content-Security-Policy meta present');

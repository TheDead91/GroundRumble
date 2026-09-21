// Dev launcher: runs two Vite dev servers side by side.
//   - HTTPS on 0.0.0.0 (external): all non-localhost access is TLS-protected.
//   - HTTP on 127.0.0.1 (localhost only): local dev without a self-signed warning.
// Ctrl-C terminates both. Ports via --https-port / --http-port or defaults below.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const HTTPS_PORT = Number(process.env.HTTPS_PORT || 5199);
const HTTP_PORT = Number(process.env.HTTP_PORT || 5198);

const children = [];
const start = (name, args) => {
  const child = spawn(process.execPath, [viteBin, ...args], { cwd: root, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code, signal) => {
    console.log(`[dev-launcher] ${name} exited (code=${code} signal=${signal})`);
    shutdown();
  });
  return child;
};

const shutdown = () => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exit(0);
};

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);

console.log(`[dev-launcher] HTTPS external on :${HTTPS_PORT} (0.0.0.0), HTTP localhost on :${HTTP_PORT} (127.0.0.1)`);
start('https-external', ['--config', 'vite.https.config.mjs', '--host', '0.0.0.0', '--port', String(HTTPS_PORT), '--strictPort']);
start('http-localhost', ['--config', 'vite.local.config.mjs', '--host', '127.0.0.1', '--port', String(HTTP_PORT), '--strictPort']);

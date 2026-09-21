// Minimal OpenAI-compatible mock server used by the proxy end-to-end tests.
// Serves /v1/models, /v1/chat/completions, a /redirect hop, and /stats for
// asserting which endpoints were hit. Listens on 127.0.0.1:3999.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 3999);
const HOST = '127.0.0.1';

const hits = [];
const resetHits = () => { hits.length = 0; };

const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...headers
  });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (!url.pathname.startsWith('/stats')) hits.push(`${req.method} ${url.pathname}`);

  if (url.pathname === '/stats') {
    return sendJson(res, 200, { hits });
  }
  if (url.pathname === '/stats/reset') {
    resetHits();
    return sendJson(res, 200, { hits: [] });
  }
  if (url.pathname === '/redirect') {
    res.writeHead(302, { Location: '/v1/models' });
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/') {
    return sendJson(res, 200, { status: 'mock-alive' });
  }
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return sendJson(res, 200, { object: 'list', data: [{ id: 'test-model' }] });
  }
  if (req.method === 'POST' && (url.pathname === '/v1' || url.pathname === '/v1/chat/completions')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch { /* keep {} */ }
      const content = 'MOCK-COMPLETION-OK';
      sendJson(res, 200, {
        id: 'mock-completion',
        object: 'chat.completion',
        model: payload.model || 'test-model',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }]
      });
    });
    return;
  }
  return sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, HOST, () => {
  // Quiet by default so normal `npm test` output stays trustworthy; set
  // MOCK_VERBOSE=1 when debugging the proxy end-to-end harness.
  if (process.env.MOCK_VERBOSE === '1') console.log(`mock-ollama listening on http://${HOST}:${PORT}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

if (process.send) process.send({ type: 'ready', port: PORT });
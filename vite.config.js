import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Security response headers for the app's own server (dev + preview).
//
// Production (preview) CSP is strict: scripts/fonts/frames only from self,
// plugins forbidden, connections restricted to same-origin plus the arbitrary
// http(s) provider endpoints this tool exists to reach. Dev relaxes only what
// Vite's HMR and the React fast-refresh preamble need (inline script + ws:).
// The report popup is an about:blank child that inherits this policy, so its
// inline <style> blocks remain allowed via style-src 'unsafe-inline'.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), picture-in-picture=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

const cspFor = (mode) => mode === 'dev'
  ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http: https: ws: wss:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; frame-src 'self'; worker-src 'self'; manifest-src 'self'"
  : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http: https:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; frame-src 'self'; worker-src 'self'; manifest-src 'self'"

function securityHeaders() {
  const attach = (server, mode) => {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Content-Security-Policy', cspFor(mode))
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value)
      next()
    })
  }
  return {
    name: 'groundrumble-security-headers',
    configureServer(server) { attach(server, 'dev') },
    configurePreviewServer(server) { attach(server, 'preview') },
  }
}

// Bakes the production CSP into dist/index.html as a <meta> tag. The header CSP
// only exists when the app is served by Vite's dev/preview server; a plain
// static host (Netlify, GitHub Pages, S3, nginx...) that just serves dist/
// would otherwise lose every security directive. `frame-ancestors` is not a
// valid meta-directive (the browser logs a warning and ignores it), so it is
// stripped here — the header policy still enforces framing when served by
// Vite. `apply: 'build'` keeps dev HMR untouched.
function staticCspMeta() {
  const withoutFrameAncestors = cspFor('preview')
    .replace(/frame-ancestors 'none';?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const meta = `<meta http-equiv="Content-Security-Policy" content="${withoutFrameAncestors}">`
  return {
    name: 'groundrumble-static-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    ${meta}`)
    },
  }
}

// https://vite.dev/config/
//
// The dev workflow uses two dedicated configs via `npm run dev`
// (scripts/dev.mjs): vite.https.config.mjs serves HTTPS externally (0.0.0.0,
// port 5199) for all non-localhost access, and vite.local.config.mjs serves
// plain HTTP on loopback (127.0.0.1, port 5198) for localhost. This default
// config (plain HTTP on localhost) remains for bare `vite`/`vite build` runs.
export default defineConfig({
  // First plugin so header middleware runs before Vite's own handlers, giving
  // every response (HTML, assets) the security headers above.
  plugins: [securityHeaders(), staticCspMeta(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('atlas-bundled')) return 'atlas-data';
          if (id.includes('src/utils') && (id.includes('ai-') || id.includes('prompts'))) return 'ai-utils';
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-lucide';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})
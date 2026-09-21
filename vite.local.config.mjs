import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

// Localhost-only dev server: plain HTTP. Binds strictly to loopback so only
// localhost reaches it; anything reachable over the network goes through the
// HTTPS server instead. No self-signed cert, so local dev has no TLS warning.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    https: false,
  },
  plugins: [securityHeaders(), react()],
  build: {
    chunkSizeWarningLimit: 1000
  }
})

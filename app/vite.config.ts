import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served under /app/ in production (see Makefile); the Worker sets CSP and other headers.
const base = process.env.BASE_PATH ?? '/'

// Dev only: serve locally synthesized narration (make audio) the way the Worker serves it from R2.
function devNarration(): Plugin {
  const dir = resolve(__dirname, '../build/audio/out')
  const name = /^\/([a-z0-9-]{1,120}\.[0-9a-f]{12}\.m4a)$/
  return {
    name: 'dev-narration',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/audio', (req, res, next) => {
        const file = name.exec(req.url?.split('?')[0] ?? '')?.[1]
        if (!file) return next()
        let size: number
        try {
          size = statSync(resolve(dir, file)).size
        } catch {
          res.statusCode = 404
          return res.end()
        }
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
        const start = m?.[1] ? Number(m[1]) : m?.[2] ? Math.max(0, size - Number(m[2])) : 0
        const end = m?.[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
        res.setHeader('Content-Type', 'audio/mp4')
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Length', String(end - start + 1))
        if (m) {
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
        }
        createReadStream(resolve(dir, file), { start, end }).pipe(res)
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    devNarration(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '8Domains',
        short_name: '8Domains',
        description: 'Free, offline study feed for the CISSP® exam: concepts, flashcards, scenario questions.',
        theme_color: '#0c0a10',
        background_color: '#0c0a10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the latin subsets of the fonts are precached; other subsets load on demand.
        globPatterns: ['**/*.{js,css,html,svg,json,webmanifest}', 'assets/*-latin-wght-normal-*.woff2', 'assets/spectral-latin-*.woff2'],
        // kb files are fetched as kb/<file>?v=<version>; the precache entry is revisioned already.
        ignoreURLParametersMatching: [/^v$/],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})

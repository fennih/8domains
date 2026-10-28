import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served under /app/ in production (see Makefile); the Worker sets CSP and other headers.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
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

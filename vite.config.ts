import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // ── Auto-update strategy ──────────────────────────────────────
      // 'autoUpdate' = new SW installs & activates silently in background.
      // On next page load the user gets the new version with zero friction.
      registerType: 'autoUpdate',

      // Inject the SW registration script automatically into index.html
      injectRegister: 'auto',

      // Vite generates the SW — no manual sw.js to maintain
      strategies: 'generateSW',

      // Dev mode: also show SW in development (useful for testing)
      devOptions: {
        enabled: false,  // keep false — avoids dev-mode caching confusion
      },

      workbox: {
        // ── What to precache (everything in dist/) ──────────────────
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp}'],

        // ── Auto-cleanup: delete old caches on activate ─────────────
        cleanupOutdatedCaches: true,

        // ── Skip waiting: activate new SW immediately on install ─────
        skipWaiting: true,

        // ── Claim all open tabs immediately after activation ─────────
        clientsClaim: true,

        // ── Max file size to precache (5MB) ─────────────────────────
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        // ── Runtime caching rules ────────────────────────────────────
        runtimeCaching: [
          {
            // Supabase API — network-first, 5s timeout, then cached fallback
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-v1',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 300 }, // 5 min
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Map tiles — cache-first, 7 day TTL
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-v1',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts — cache-first, 30 day TTL
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-v1',
              expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // ── PWA manifest (serves as /manifest.json) ───────────────────
      manifest: {
        name: 'DCC SalesForce',
        short_name: 'DCC SFA',
        description: 'Field Sales Automation — GPS Tracking, Visit Logging, Real-time Analytics',
        start_url: '/',
        id: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#F5F7FB',
        theme_color: '#2563EB',
        lang: 'en',
        prefer_related_applications: false,
        icons: [
          { src: '/icons/icon-72.png',  sizes: '72x72',   type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-96.png',  sizes: '96x96',   type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],

  server: {
    port: 3000,
    open: true,
    hmr: { overlay: false },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.warn', 'console.info'],
        passes: 2,
      },
      mangle: { safari10: true },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts'
          if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) return 'maps'
          if (id.includes('/gsap/')) return 'animation'
          if (id.includes('/workbox-')) return 'workbox'
          if (id.includes('node_modules')) return 'vendor'
        },
        chunkFileNames:  'assets/[name]-[hash].js',
        entryFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 4096,
    target: ['es2020', 'chrome80', 'safari14'],
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand'],
    exclude: ['leaflet'],
  },
})

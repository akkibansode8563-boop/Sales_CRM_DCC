import { defineConfig } from 'vite'
import react           from '@vitejs/plugin-react'
import { VitePWA }     from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      // Files to precache (excluded: large map tiles)
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],

      // Don't replace the manual sw.js — let Workbox generate the service worker
      injectRegister: 'auto',
      strategies: 'generateSW',

      workbox: {
        // Precache all JS/CSS/HTML assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Cache-first for static assets (no network request for known files)
        runtimeCaching: [
          {
            // Supabase API — network-first with fallback
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 }, // 5 min TTL
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // CDN fonts & icons
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Leaflet tiles — cache with stale-while-revalidate for offline map panning
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],

        // Skip waiting — activate new SW immediately
        skipWaiting: true,
        clientsClaim: true,

        // Max precache size (default 2MB is too low for our app)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },

      manifest: {
        name:             'DCC SalesForce CRM',
        short_name:       'DCC SFA',
        description:      'Field Sales Management for DCC India',
        theme_color:      '#1A1F36',
        background_color: '#F5F7FB',
        display:          'standalone',
        orientation:      'portrait-primary',
        start_url:        '/',
        scope:            '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
          // 1. Recharts + D3 (heavy, analytics-only)
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts'
          // 2. Map libs
          if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) return 'maps'
          // 3. GSAP animation
          if (id.includes('/gsap/')) return 'animation'
          // 4. Workbox (PWA runtime)
          if (id.includes('/workbox-')) return 'workbox'
          // 5. Everything else in node_modules → one vendor chunk
          if (id.includes('node_modules')) return 'vendor'
        },
        chunkFileNames:  'assets/[name]-[hash].js',
        entryFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash].[ext]',
      }
    },

    chunkSizeWarningLimit:   700,
    assetsInlineLimit:       4096,
    target: ['es2020', 'chrome80', 'safari14'],
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand', 'gsap', 'idb'],
    exclude: ['leaflet'],
  },
})

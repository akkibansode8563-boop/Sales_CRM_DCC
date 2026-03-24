import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

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
        // No circular deps — use a single flat function
        manualChunks(id) {
          // 1. Recharts + D3 (heavy, analytics-only)
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts'
          // 2. Map libs
          if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) return 'maps'
          // 3. GSAP animation
          if (id.includes('/gsap/')) return 'animation'
          // 4. Everything else in node_modules → one vendor chunk (no circular)
          if (id.includes('node_modules')) return 'vendor'
        },
        chunkFileNames:  'assets/[name]-[hash].js',
        entryFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash].[ext]',
      }
    },

    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 4096,
    target: ['es2020', 'chrome80', 'safari14'],
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand', 'gsap'],
    exclude: ['leaflet'],
  },
})

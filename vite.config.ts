import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
        manualChunks(id) {
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
          if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) return 'maps';
          if (id.includes('/gsap/')) return 'animation';
          if (id.includes('node_modules')) return 'vendor';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 4096,
    target: ['es2020', 'chrome80', 'safari14'],
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'zustand', 'gsap'],
    exclude: ['leaflet'],
  },
});

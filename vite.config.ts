import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/* The dev server forwards /api to the Express process (npm run api), so the
   client can use same-origin paths and never needs a CORS round trip or a
   hard-coded port. Point VITE_API_TARGET elsewhere to develop against a
   different backend. */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:5174'

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  base: './',
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1600,
  },
}))

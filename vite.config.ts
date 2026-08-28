import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* The dev server forwards /api to the Express process (npm run api), so the
   client can use same-origin paths and never needs a CORS round trip or a
   hard-coded port. Point VITE_API_TARGET elsewhere to develop against a
   different backend. */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:5174'

/* One build, and it carries no records. Everything on screen comes from
   the deployment's own database over /api; there is nothing bundled to
   fall back to, by design. */
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
  },
})

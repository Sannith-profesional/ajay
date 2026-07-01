import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // During `vite dev`, forward API calls to the local express server.
      // In production on Vercel, /api is served by the serverless function instead.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  define: {
    // Vercel auto-injects `VERCEL_ENV` (production | preview | development)
    // at build time, but Vite's default envPrefix is `VITE_` so client code
    // can't see it directly. Bake it into the bundle so `ChatInput`'s
    // preview-banner check (`import.meta.env.VITE_VERCEL_ENV === 'preview'`)
    // resolves at runtime without leaking other env vars to the client.
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(
      process.env.VERCEL_ENV === 'preview'
        ? 'preview'
        : process.env.VERCEL_ENV === 'development'
        ? 'development'
        : 'production'
    ),
  },
})

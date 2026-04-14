import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import locationSeoPlugin from './vite-plugin-location-seo'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), locationSeoPlugin()],
  server: {},
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'query'
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'ui'
          }
          // Heavy export/PDF libs — split so they're only loaded when needed
          if (
            id.includes('node_modules/jspdf') ||
            id.includes('node_modules/jszip') ||
            id.includes('node_modules/html-to-image') ||
            id.includes('node_modules/html2canvas')
          ) {
            return 'pdf-export'
          }
          // Recharts — 342KB; isolate so pages that don't chart don't load it
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'charts'
          }
          // Supabase realtime/storage sub-packages — isolate from auth client
          if (id.includes('node_modules/@supabase/realtime') || id.includes('node_modules/@supabase/storage')) {
            return 'supabase-rt'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'SmartFarm Dashboard',
        short_name: 'SmartFarm',
        description: 'ระบบควบคุมและตรวจสอบฟาร์มอัจฉริยะ',
        theme_color: '#27ae60',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Cache all app shell assets (JS, CSS, HTML) — serves from cache when offline
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Network-first for API calls: try live data, fall back to cached response
        runtimeCaching: [
          {
            urlPattern: /^http.*\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => path,
      },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The PWA frontend lives in web/. The API (api/) is served by `vercel dev`
// during development; vite proxies /api to it.
export default defineConfig({
  root: 'web',
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      // Regex so it matches /api/* endpoints only — NOT the client module /api.js.
      '^/api/': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Club TMP Stock Manager',
        short_name: 'Stock Manager',
        description: 'Club TMP Stock Management System',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cache the app shell so the PWA opens offline. API calls are never
        // cached — offline data comes from IndexedDB, not the network.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});

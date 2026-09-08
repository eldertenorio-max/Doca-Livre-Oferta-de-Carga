import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'favicon.png',
        'favicon-16.png',
        'favicon-32.png',
        'favicon-48.png',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'badge-96.png',
        'badge.svg',
        'og-image.png',
        'og-square.png',
        'logo-doca-livre.png',
      ],
      manifest: {
        name: 'Doca Livre — Oferta de Carga',
        short_name: 'Oferta de Carga',
        description: 'Oferta de carga Doca Livre — negociação e mapa da frota.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        categories: ['business', 'logistics'],
        icons: [
          {
            src: 'icon-192.png?v=oferta7',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png?v=oferta7',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png?v=oferta7',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'apple-touch-icon.png?v=oferta7',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // HashRouter: a navegação é sempre /index.html. Não precachear HTML —
        // senão o SW entrega o site velho e o usuário acha que não atualizou.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webp}'],
        globIgnores: ['**/index.html'],
        navigateFallbackAllowlist: [],
        importScripts: ['push-sw.js'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Bundle JS ~2.1 MB; default Workbox é 2 MiB e derruba o build no Render
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'doca-html-network-first',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern:
              /^https:\/\/geoftp\.ibge\.gov\.br\/.*censo_2022\/(bairros|distritos)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ibge-bairros-shp',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
})

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
        'logo-doca-livre-escuro.png',
        'logo-icone.svg',
        'logo-icone-escuro.svg',
        'login-bg.svg',
        'earth-globe.jpg',
      ],
      // Sem manifesto: o Chrome/Edge não oferecem mais "Instalar app" (no Android só o app de verdade, em
      // android/). O iPhone, que não tem APK, recebe public/manifest-iphone.webmanifest pelo index.html.
      manifest: false,
      workbox: {
        // HashRouter: a navegação é sempre /index.html. Não precachear HTML —
        // senão o SW entrega o site velho e o usuário acha que não atualizou.
        globPatterns: ['**/*.{js,css,ico,png,svg,jpg,jpeg,woff2,webp}'],
        globIgnores: ['**/index.html'],
        // String vazia = sem createHandlerBoundToURL('index.html').
        navigateFallback: '',
        navigateFallbackAllowlist: [],
        importScripts: ['push-sw.js'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        runtimeCaching: [
          {
            // O instalador do app Android (/app/*.apk) e o assetlinks vão sempre direto ao servidor.
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' &&
              !url.pathname.startsWith('/app/') &&
              !url.pathname.startsWith('/.well-known/'),
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
          {
            urlPattern: /^https:\/\/services\.arcgisonline\.com\/.*\/tile\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-world-imagery',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
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

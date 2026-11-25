import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
  return {
    base: command === 'build' ? './' : '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [],
        manifest: {
          id: './',
          name: '日和手帳 Hiyori - 自由行隨行手帖',
          short_name: '日和手帳',
          lang: 'zh-TW',
          description:
            '日和手帳 Hiyori：自由行隨行手帖。支援行程總覽大表、路線地圖導覽、隨行即時天氣、多幣別記帳換算與發票管理、行前清單待辦。',
          theme_color: '#FAF9F6',
          background_color: '#FAF9F6',
          display: 'standalone',
          start_url: './',
          scope: './',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          ignoreURLParametersMatching: [/^_v$/, /^_t$/],
          navigateFallbackDenylist: [/^\/__\/auth/, /^\/__\/firebase/, /^\/api\//],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: [
            'assets/aistudio/**',
            'assets/PDFExportModal-*',
            'assets/vendor-pdf-*',
            'assets/html2canvas*',
            'assets/jspdf*',
            'assets/lite.esm-*',
          ],
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.*\.(?:js|css)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'hiyori-ondemand-assets',
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/.*tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles-cache',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
              { name: 'vendor-firebase', test: /node_modules[\\/](firebase|@firebase)[\\/]/, priority: 25 },
              { name: 'vendor-leaflet', test: /node_modules[\\/]leaflet[\\/]/, priority: 25 },
              { name: 'vendor-charts', test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/, priority: 25 },
              { name: 'vendor-pdf', test: /node_modules[\\/](jspdf|html2canvas|canvg|fflate|rgbcolor|stackblur-canvas)[\\/]/, priority: 25 },
              { name: 'vendor-icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 20 },
            ],
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

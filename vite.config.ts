import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// L'appli est publiée sur https://ecirbatp.github.io/DefyMe/ (DC-8, D-T-05).
export default defineConfig({
  base: '/DefyMe/',
  define: {
    __VERSION_APPLI__: JSON.stringify(version),
  },
  build: {
    target: 'es2020',
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icones/icone.svg', 'icones/apple-touch-icon.png'],
      manifest: {
        name: 'DefyMe',
        short_name: 'DefyMe',
        description: "Jeux de société entre amis, sur n'importe quel téléphone, sans compte.",
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f1ea',
        theme_color: '#1b2a4a',
        icons: [
          { src: 'icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icones/icone-masquable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout ce qui est construit est gardé sur le téléphone : l'appli s'ouvre hors ligne (D-D-07).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});

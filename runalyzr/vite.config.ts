import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  base: '/runalyzr/',
  resolve: {
    alias: {
      '@runalyzr/shared/math':  resolve(__dirname, '../shared/src/math/angles.ts'),
      '@runalyzr/shared/types': resolve(__dirname, '../shared/src/types/index.ts'),
      '@runalyzr/shared/pose':  resolve(__dirname, '../shared/src/pose/landmarker.ts'),
      '@runalyzr/shared/pdf':   resolve(__dirname, '../shared/src/pdf/renderer.ts'),
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm,task}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
      manifest: false,
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '法灵 AI 法律案件闭环',
        short_name: '法灵 AI',
        description: '移动端法律案件、证据、评估和方案闭环工作台',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  test: {
    environment: 'jsdom'
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000'
    }
  }
});

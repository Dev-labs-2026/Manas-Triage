import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 35 * 1024 * 1024, // allows files up to 35 MB to be cached
      },
      manifest: {
        name: 'MANAS-TRIAGE Offline System',
        short_name: 'MANAS-Triage',
        description: 'Offline-First AI-Powered Physical & Mental Emergency Triage',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
      }
    })
  ],
  worker: {
    format: 'es'
  }
});
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    // Той самий підхід, що й у frontend/vite.config.ts: дозволяє відкрити
    // адмінку через тимчасовий ngrok/tunnel-хост і проксує /api на
    // backend тут-таки, на сервері, тож CORS не задіюється. Лише для
    // локальної розробки.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

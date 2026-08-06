import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Дозволяє відкривати dev-сервер через тимчасовий ngrok-хост (домен
    // змінюється щоразу на безкоштовному плані) — інакше Vite блокує
    // невідомий Host-заголовок. Лише для локальної розробки.
    allowedHosts: true,
    proxy: {
      // Telegram бачить лише один походження (frontend-тунель); запити
      // на /api проксуються на backend тут-таки, на сервері, тож браузер
      // ніколи не робить крос-origin запит і CORS не задіюється.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

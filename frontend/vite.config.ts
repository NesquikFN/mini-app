import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function gitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: import.meta.dirname }).toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Lets the dev-preview debug panel prove both browsers are looking
  // at the exact same bundle, not a stale cached one — see
  // src/dev/SplashMotionPreview.tsx.
  define: {
    __BUILD_ID__: JSON.stringify(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT_HASH__: JSON.stringify(gitCommitHash()),
  },
  server: {
    // Fixed port so the ngrok tunnel and BotFather's Mini App URL always
    // point at the right process — fail loudly instead of silently
    // moving to 5174+ if 5173 is somehow already taken.
    port: 5173,
    strictPort: true,
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

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Окремий конфіг, а не блок `test` усередині vite.config.ts: продакшн-
 * збірка не повинна навіть знати про тести. Vitest бере цей файл замість
 * vite.config.ts, `vite build` — навпаки, лише vite.config.ts.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Явні імпорти describe/it/expect замість глобалів — tsconfig.app.json
    // навмисно тримає вузький `types`, і розширювати його заради тестів
    // не хочеться.
    globals: false,
  },
})

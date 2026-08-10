import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env'

/**
 * Заголовки безпеки для backend. Свідомо вручну, а не через helmet:
 * набір маленький, а кожен заголовок тут має бути перевірений на
 * сумісність із Telegram Mini App, тож явний список читається легше за
 * конфігурацію з відключеними за замовчуванням пунктами.
 *
 * Важливо: це API-сервіс (JSON + статичні зображення). Сам Mini App
 * віддає frontend-сервіс, і саме йому не можна забороняти фрейминг —
 * Telegram відкриває застосунок в iframe (web) та WebView (мобільні).
 * Тут X-Frame-Options: DENY безпечний: JSON-відповіді й картинки ніхто
 * не фреймить.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

  // Лише в production: на локальному http HSTS усе одно ігнорується, а
  // от закріпити https для localhost у браузері розробника — реальна
  // незручність, яку потім важко скасувати.
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  next()
}

/** Приватні відповіді API не повинні осідати в проміжних кешах чи в
 * кеші Telegram WebView. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

/**
 * /uploads віддається з backend-домену, а вбудовується в сторінку на
 * frontend-домені, тож ресурс має лишатись крос-оригінним:
 * Cross-Origin-Resource-Policy: cross-origin. Ставити тут same-origin
 * (як це робить helmet за замовчуванням) означало б зламати всі
 * обкладинки подій.
 *
 * Cache-Control навмисно НЕ no-store: обкладинки статичні й мають
 * кешуватись, інакше кожен показ списку подій — це знову мегабайти
 * трафіку в мобільному WebView.
 */
export function uploadsHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  next()
}

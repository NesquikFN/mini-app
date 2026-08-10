import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { apiRouter } from './routes'
import { requestLogger } from './middleware/requestLogger'
import { notFoundHandler } from './middleware/notFoundHandler'
import { errorHandler } from './middleware/errorHandler'
import { globalRateLimiter } from './middleware/rateLimit'

export const app = express()

app.disable('x-powered-by')

// Railway термінує TLS на своєму edge-проксі й додає рівно один хоп
// X-Forwarded-For. Саме 1, а не `true`: при `true` Express узяв би
// найлівіший (клієнтський) запис XFF, і будь-хто міг би підробити свій
// IP заголовком, обходячи ліміти запитів.
app.set('trust proxy', 1)

app.use(cors({ origin: env.FRONTEND_URL }))
app.use(express.json({ limit: '100kb' }))

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

if (env.NODE_ENV === 'development') {
  app.use(requestLogger)
}

app.use('/uploads', express.static(env.UPLOADS_DIR))
app.use('/api', globalRateLimiter, apiRouter)

app.use(notFoundHandler)
app.use(errorHandler)

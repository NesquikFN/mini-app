import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { apiRouter } from './routes'
import { requestLogger } from './middleware/requestLogger'
import { notFoundHandler } from './middleware/notFoundHandler'
import { errorHandler } from './middleware/errorHandler'

export const app = express()

app.disable('x-powered-by')

app.use(cors({ origin: env.FRONTEND_URL }))
app.use(express.json())

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

if (env.NODE_ENV === 'development') {
  app.use(requestLogger)
}

app.use('/api', apiRouter)

app.use(notFoundHandler)
app.use(errorHandler)

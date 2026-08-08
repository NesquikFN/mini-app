import { Router } from 'express'
import { healthRouter } from './health.routes'
import { authRouter } from './auth.routes'
import * as telegramWebhookController from '../controllers/telegram-webhook.controller'
import { eventsRouter } from './events.routes'
import { meRouter } from './me.routes'
import { dormitoriesRouter } from './dormitories.routes'
import { usersRouter } from './users.routes'
import { adminRouter } from './admin.routes'
import { requireTelegramAuth } from '../middleware/requireTelegramAuth'
import { requireAdmin } from '../middleware/requireAdmin'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.post('/telegram/webhook', telegramWebhookController.receiveUpdate)
apiRouter.use('/events', requireTelegramAuth, eventsRouter)
apiRouter.use('/me', requireTelegramAuth, meRouter)
apiRouter.use('/dormitories', requireTelegramAuth, dormitoriesRouter)
apiRouter.use('/users', requireTelegramAuth, usersRouter)
apiRouter.use('/admin', requireTelegramAuth, requireAdmin, adminRouter)

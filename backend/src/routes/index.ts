import { Router } from 'express'
import { healthRouter } from './health.routes'
import { authRouter } from './auth.routes'
import * as telegramWebhookController from '../controllers/telegram-webhook.controller'
import { eventsRouter } from './events.routes'
import { eventTemplatesRouter } from './event-templates.routes'
import { meRouter } from './me.routes'
import { dormitoriesRouter } from './dormitories.routes'
import { usersRouter } from './users.routes'
import { adminRouter } from './admin.routes'
import { appSettingsRouter } from './app-settings.routes'
import { requireTelegramAuth } from '../middleware/requireTelegramAuth'
import { requireAdmin } from '../middleware/requireAdmin'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.post('/telegram/webhook', telegramWebhookController.receiveUpdate)
apiRouter.use('/events', requireTelegramAuth, eventsRouter)
apiRouter.use('/event-templates', requireTelegramAuth, eventTemplatesRouter)
apiRouter.use('/me', requireTelegramAuth, meRouter)
apiRouter.use('/dormitories', requireTelegramAuth, dormitoriesRouter)
apiRouter.use('/users', requireTelegramAuth, usersRouter)
apiRouter.use('/app-settings', requireTelegramAuth, appSettingsRouter)
apiRouter.use('/admin', requireTelegramAuth, requireAdmin, adminRouter)

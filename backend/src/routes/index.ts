import { Router } from 'express'
import { healthRouter } from './health.routes'
import { authRouter } from './auth.routes'
import { eventsRouter } from './events.routes'
import { meRouter } from './me.routes'
import { adminRouter } from './admin.routes'
import { requireTelegramAuth } from '../middleware/requireTelegramAuth'
import { requireAdmin } from '../middleware/requireAdmin'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.use('/events', requireTelegramAuth, eventsRouter)
apiRouter.use('/me', requireTelegramAuth, meRouter)
apiRouter.use('/admin', requireTelegramAuth, requireAdmin, adminRouter)

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
import { requireApprovedUser } from '../middleware/requireApprovedUser'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.post('/telegram/webhook', telegramWebhookController.receiveUpdate)

// --- Доступні одразу після Telegram-автентифікації, ДО схвалення заявки ---
// /me — статус власного профілю й подача (чи повторна подача) заявки:
// саме цим живе RegistrationGate, тож гейтити його не можна, інакше
// несхвалений користувач не побачить навіть екран "очікуйте".
// Підмаршрути /me, не потрібні для реєстрації, закриті всередині
// me.routes.ts.
apiRouter.use('/me', requireTelegramAuth, meRouter)
// Довідник гуртожитків — лише публічні назви й id, без персональних
// даних; DormitoriesProvider у frontend завантажує його один раз при
// старті застосунку, ще до того, як стане відомий статус заявки.
apiRouter.use('/dormitories', requireTelegramAuth, dormitoriesRouter)

// --- Потребують схваленої заявки ---
apiRouter.use('/events', requireTelegramAuth, requireApprovedUser, eventsRouter)
apiRouter.use('/event-templates', requireTelegramAuth, requireApprovedUser, eventTemplatesRouter)
apiRouter.use('/users', requireTelegramAuth, requireApprovedUser, usersRouter)
apiRouter.use('/app-settings', requireTelegramAuth, requireApprovedUser, appSettingsRouter)

// Адмінка навмисно без requireApprovedUser: право визначає лише
// admin_users, і адміністратор має лишатись працездатним незалежно від
// стану власної заявки (наприклад, якщо бекфіл 0019 колись не зачепив
// його рядок).
apiRouter.use('/admin', requireTelegramAuth, requireAdmin, adminRouter)

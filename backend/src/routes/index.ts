import { Router } from 'express'
import { healthRouter } from './health.routes'
import { authRouter } from './auth.routes'
import * as telegramWebhookController from '../controllers/telegram-webhook.controller'
import { eventsRouter } from './events.routes'
import { eventTemplatesRouter } from './event-templates.routes'
import { quickPlansRouter } from './quick-plans.routes'
import { meRouter } from './me.routes'
import { dormitoriesRouter } from './dormitories.routes'
import { usersRouter } from './users.routes'
import { adminRouter } from './admin.routes'
import { appSettingsRouter } from './app-settings.routes'
import { requireTelegramAuth } from '../middleware/requireTelegramAuth'
import { requireAdmin } from '../middleware/requireAdmin'
import { requireApprovedUser } from '../middleware/requireApprovedUser'
import { authRateLimiter, perUserRateLimiter } from '../middleware/rateLimit'

export const apiRouter = Router()

/** Автентифікований користувач + його персональний ліміт запитів
 * (ключ — users.id, а не IP: спільний NAT гуртожитку не повинен
 * блокувати сусідів). */
const authenticated = [requireTelegramAuth, perUserRateLimiter]
/** Те саме + схвалена заявка на реєстрацію. */
const approved = [...authenticated, requireApprovedUser]

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRateLimiter, authRouter)
apiRouter.post('/telegram/webhook', telegramWebhookController.receiveUpdate)

// --- Доступні одразу після Telegram-автентифікації, ДО схвалення заявки ---
// /me — статус власного профілю й подача (чи повторна подача) заявки:
// саме цим живе RegistrationGate, тож гейтити його не можна, інакше
// несхвалений користувач не побачить навіть екран "очікуйте".
// Підмаршрути /me, не потрібні для реєстрації, закриті всередині
// me.routes.ts.
apiRouter.use('/me', ...authenticated, meRouter)
// Довідник гуртожитків — лише публічні назви й id, без персональних
// даних; DormitoriesProvider у frontend завантажує його один раз при
// старті застосунку, ще до того, як стане відомий статус заявки.
apiRouter.use('/dormitories', ...authenticated, dormitoriesRouter)

// --- Потребують схваленої заявки ---
apiRouter.use('/events', ...approved, eventsRouter)
apiRouter.use('/event-templates', ...approved, eventTemplatesRouter)
apiRouter.use('/quick-plans', ...approved, quickPlansRouter)
apiRouter.use('/users', ...approved, usersRouter)
apiRouter.use('/app-settings', ...approved, appSettingsRouter)

// Адмінка навмисно без requireApprovedUser: право визначає лише
// admin_users, і адміністратор має лишатись працездатним незалежно від
// стану власної заявки (наприклад, якщо бекфіл 0019 колись не зачепив
// його рядок).
apiRouter.use('/admin', ...authenticated, requireAdmin, adminRouter)

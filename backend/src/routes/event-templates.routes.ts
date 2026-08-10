import { Router, raw } from 'express'
import * as eventTemplatesController from '../controllers/event-templates.controller'
import { requireTemplateManager } from '../middleware/requireTemplateManager'
import { imageUploadRateLimiter, templateLaunchRateLimiter } from '../middleware/rateLimit'

/**
 * Mounted at /api/event-templates with only requireTelegramAuth (see
 * routes/index.ts) — every authenticated user can browse and launch a
 * template. Creating/editing/deleting one additionally requires
 * requireTemplateManager (admin or host).
 */
export const eventTemplatesRouter = Router()

eventTemplatesRouter.get('/', eventTemplatesController.listEventTemplates)
eventTemplatesRouter.get('/manager-status', eventTemplatesController.getTemplateManagerStatus)
eventTemplatesRouter.post('/', requireTemplateManager, eventTemplatesController.createEventTemplate)
eventTemplatesRouter.put(
  '/:templateId',
  requireTemplateManager,
  eventTemplatesController.updateEventTemplate,
)
eventTemplatesRouter.put(
  '/:templateId/image',
  requireTemplateManager,
  imageUploadRateLimiter,
  raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  eventTemplatesController.uploadEventTemplateImage,
)
eventTemplatesRouter.delete(
  '/:templateId',
  requireTemplateManager,
  eventTemplatesController.deleteEventTemplate,
)
// Запуск шаблону створює подію з тією ж розсилкою — той самий рівень
// обмеження, що й у POST /api/events.
eventTemplatesRouter.post(
  '/:templateId/create-event',
  templateLaunchRateLimiter,
  eventTemplatesController.createFromEventTemplate,
)

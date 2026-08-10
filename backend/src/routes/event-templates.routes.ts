import { Router, raw } from 'express'
import * as eventTemplatesController from '../controllers/event-templates.controller'
import { requireTemplateManager } from '../middleware/requireTemplateManager'
import { imageUploadRateLimiter, templateLaunchRateLimiter } from '../middleware/rateLimit'
import { MAX_IMAGE_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '../utils/uploads'

/**
 * Змонтований із requireTelegramAuth + requireApprovedUser (див.
 * routes/index.ts) — переглядати й запускати шаблони може будь-який
 * схвалений користувач. Створення/редагування/видалення додатково
 * вимагає requireTemplateManager (admin або host).
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
  raw({ type: UPLOAD_CONTENT_TYPES, limit: MAX_IMAGE_UPLOAD_BYTES }),
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

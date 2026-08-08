import { Router, raw } from 'express'
import * as eventTemplatesController from '../controllers/event-templates.controller'
import { requireTemplateManager } from '../middleware/requireTemplateManager'

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
  raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  eventTemplatesController.uploadEventTemplateImage,
)
eventTemplatesRouter.delete(
  '/:templateId',
  requireTemplateManager,
  eventTemplatesController.deleteEventTemplate,
)
eventTemplatesRouter.post('/:templateId/create-event', eventTemplatesController.createFromEventTemplate)

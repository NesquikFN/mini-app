import { Router, raw } from 'express'
import * as eventTemplatesController from '../controllers/event-templates.controller'

/** Mounted at /api/event-templates with only requireTelegramAuth (see
 * routes/index.ts) — accessible to every authenticated user, not just
 * admins. */
export const eventTemplatesRouter = Router()

eventTemplatesRouter.get('/', eventTemplatesController.listEventTemplates)
eventTemplatesRouter.post('/', eventTemplatesController.createEventTemplate)
eventTemplatesRouter.put('/:templateId', eventTemplatesController.updateEventTemplate)
eventTemplatesRouter.put(
  '/:templateId/image',
  raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  eventTemplatesController.uploadEventTemplateImage,
)
eventTemplatesRouter.delete('/:templateId', eventTemplatesController.deleteEventTemplate)
eventTemplatesRouter.post('/:templateId/create-event', eventTemplatesController.createFromEventTemplate)

import { Router, raw } from 'express'
import * as eventsController from '../controllers/events.controller'
import { createEventRateLimiter, imageUploadRateLimiter } from '../middleware/rateLimit'

export const eventsRouter = Router()

eventsRouter.get('/', eventsController.listEvents)
eventsRouter.get('/:id/share-link', eventsController.getEventShareLink)
eventsRouter.get('/:id', eventsController.getEvent)
// Кожна створена подія розсилає DM усім підписникам — окремий, значно
// суворіший ліміт, ніж загальний користувацький.
eventsRouter.post('/', createEventRateLimiter, eventsController.createEvent)
eventsRouter.patch('/:id', eventsController.updateEvent)
eventsRouter.delete('/:id', eventsController.deleteEvent)
eventsRouter.put(
  '/:id/image',
  imageUploadRateLimiter,
  raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  eventsController.uploadEventImage,
)
eventsRouter.post('/:id/join', eventsController.joinEvent)
eventsRouter.delete('/:id/leave', eventsController.leaveEvent)
eventsRouter.delete('/:id/participants/:userId', eventsController.removeParticipant)

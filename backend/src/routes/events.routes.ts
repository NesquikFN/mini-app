import { Router, raw } from 'express'
import * as eventsController from '../controllers/events.controller'
import { createEventRateLimiter, imageUploadRateLimiter } from '../middleware/rateLimit'
import { MAX_IMAGE_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from '../utils/uploads'

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
  raw({ type: UPLOAD_CONTENT_TYPES, limit: MAX_IMAGE_UPLOAD_BYTES }),
  eventsController.uploadEventImage,
)
eventsRouter.post('/:id/join', eventsController.joinEvent)
eventsRouter.delete('/:id/leave', eventsController.leaveEvent)
eventsRouter.delete('/:id/participants/:userId', eventsController.removeParticipant)

// Лист очікування. Повний список і зняття з черги доступні лише
// організатору — перевірка авторства всередині events.service.
eventsRouter.post('/:id/waitlist', eventsController.joinWaitlist)
eventsRouter.delete('/:id/waitlist', eventsController.leaveWaitlist)
eventsRouter.get('/:id/waitlist', eventsController.getWaitlist)
eventsRouter.delete('/:id/waitlist/:userId', eventsController.removeFromWaitlist)

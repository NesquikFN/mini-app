import { Router, raw } from 'express'
import * as eventsController from '../controllers/events.controller'
import * as eventRatingsController from '../controllers/event-ratings.controller'
import {
  createEventRateLimiter,
  eventShareRateLimiter,
  imageUploadRateLimiter,
  submitEventRatingRateLimiter,
} from '../middleware/rateLimit'
import * as eventShareController from '../controllers/event-share.controller'
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

// Поширення події карткою. Обидва маршрути під окремим лімітом: вони
// рендерять зображення й ходять у Bot API.
eventsRouter.post('/:id/share-card', eventShareRateLimiter, eventShareController.createShareCardUrl)
eventsRouter.post('/:id/share-message', eventShareRateLimiter, eventShareController.createShareMessage)

// Лист очікування. Повний список і зняття з черги доступні лише
// організатору — перевірка авторства всередині events.service.
eventsRouter.post('/:id/waitlist', eventsController.joinWaitlist)
eventsRouter.delete('/:id/waitlist', eventsController.leaveWaitlist)
eventsRouter.get('/:id/waitlist', eventsController.getWaitlist)
eventsRouter.delete('/:id/waitlist/:userId', eventsController.removeFromWaitlist)

// Коротка оцінка завершеної події — право оцінювати (учасник, не
// організатор, подія завершена, у межах 7 днів) перевіряє сервіс, не тут.
eventsRouter.get('/:id/rating', eventRatingsController.getMyRating)
eventsRouter.put('/:id/rating', submitEventRatingRateLimiter, eventRatingsController.submitRating)

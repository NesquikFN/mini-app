import { Router, raw } from 'express'
import * as eventsController from '../controllers/events.controller'

export const eventsRouter = Router()

eventsRouter.get('/', eventsController.listEvents)
eventsRouter.get('/templates', eventsController.listEventTemplates)
eventsRouter.post('/templates/:templateId/create-event', eventsController.createEventFromTemplate)
eventsRouter.get('/:id', eventsController.getEvent)
eventsRouter.post('/', eventsController.createEvent)
eventsRouter.patch('/:id', eventsController.updateEvent)
eventsRouter.delete('/:id', eventsController.deleteEvent)
eventsRouter.put(
  '/:id/image',
  raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  eventsController.uploadEventImage,
)
eventsRouter.post('/:id/join', eventsController.joinEvent)
eventsRouter.delete('/:id/leave', eventsController.leaveEvent)
eventsRouter.delete('/:id/participants/:userId', eventsController.removeParticipant)

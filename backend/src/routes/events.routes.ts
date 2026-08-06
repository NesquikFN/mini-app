import { Router } from 'express'
import * as eventsController from '../controllers/events.controller'

export const eventsRouter = Router()

eventsRouter.get('/', eventsController.listEvents)
eventsRouter.get('/:id', eventsController.getEvent)
eventsRouter.post('/', eventsController.createEvent)
eventsRouter.post('/:id/join', eventsController.joinEvent)
eventsRouter.delete('/:id/leave', eventsController.leaveEvent)

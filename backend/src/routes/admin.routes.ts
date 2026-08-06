import { Router } from 'express'
import * as adminController from '../controllers/admin.controller'
import * as eventsController from '../controllers/events.controller'

export const adminRouter = Router()

adminRouter.get('/stats', adminController.getStats)

adminRouter.get('/users', adminController.listUsers)

// Список і створення подій — та сама логіка, що й у звичайному Mini App
// API (events.controller.ts), тому переюзаємо контролери напряму замість
// повторної реалізації.
adminRouter.get('/events', eventsController.listEvents)
adminRouter.post('/events', eventsController.createEvent)

adminRouter.get('/events/:id', adminController.getEventDetail)
adminRouter.patch('/events/:id', adminController.updateEvent)
adminRouter.delete('/events/:id', adminController.deleteEvent)
adminRouter.delete('/events/:id/participants/:userId', adminController.removeParticipant)

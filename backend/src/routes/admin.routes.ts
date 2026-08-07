import { Router } from 'express'
import * as adminController from '../controllers/admin.controller'

export const adminRouter = Router()

adminRouter.get('/check', adminController.check)
adminRouter.get('/stats', adminController.getStats)

adminRouter.get('/users', adminController.listUsers)
adminRouter.get('/users/:id', adminController.getUserDetail)

adminRouter.get('/events', adminController.listEvents)
adminRouter.get('/events/:id', adminController.getEventDetail)
adminRouter.delete('/events/:id', adminController.deleteEvent)
adminRouter.get('/events/:id/participants', adminController.getEventParticipants)
adminRouter.delete('/events/:id/participants/:userId', adminController.removeParticipant)

adminRouter.get('/admins', adminController.listAdmins)
adminRouter.post('/admins', adminController.addAdmin)
adminRouter.delete('/admins/:userId', adminController.removeAdmin)

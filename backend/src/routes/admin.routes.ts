import { Router } from 'express'
import * as adminController from '../controllers/admin.controller'

export const adminRouter = Router()

adminRouter.get('/check', adminController.check)
adminRouter.get('/stats', adminController.getStats)
adminRouter.get('/notification-settings', adminController.getNotificationSettings)
adminRouter.put('/notification-settings', adminController.updateNotificationSettings)
adminRouter.get('/notification-chats', adminController.listNotificationChats)
adminRouter.get('/notification-topics', adminController.listNotificationTopics)

adminRouter.get('/users', adminController.listUsers)
adminRouter.get('/banned-users', adminController.listBannedUsers)
adminRouter.get('/users/:id', adminController.getUserDetail)
adminRouter.delete('/users/:id', adminController.deleteUser)
adminRouter.put('/users/:id/ban', adminController.banUser)
adminRouter.delete('/users/:id/ban', adminController.unbanUser)

adminRouter.get('/events', adminController.listEvents)
adminRouter.get('/events/:id', adminController.getEventDetail)
adminRouter.delete('/events/:id', adminController.deleteEvent)
adminRouter.get('/events/:id/participants', adminController.getEventParticipants)
adminRouter.delete('/events/:id/participants/:userId', adminController.removeParticipant)

adminRouter.get('/admins', adminController.listAdmins)
adminRouter.post('/admins', adminController.addAdmin)
adminRouter.delete('/admins/:userId', adminController.removeAdmin)

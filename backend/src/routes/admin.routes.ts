import { Router } from 'express'
import * as adminController from '../controllers/admin.controller'
import * as adminRegistrationsController from '../controllers/admin-registrations.controller'
import { telegramProbeRateLimiter } from '../middleware/rateLimit'

export const adminRouter = Router()

adminRouter.get('/check', adminController.check)
adminRouter.get('/stats', adminController.getStats)
adminRouter.get('/notification-settings', adminController.getNotificationSettings)
adminRouter.put('/notification-settings', adminController.updateNotificationSettings)
// Ці два самі ходять у Telegram Bot API (getChatMember на кожен відомий
// чат) — окремий ліміт, щоб адмінська сторінка не могла впертись у
// ліміти Telegram і тимчасово вимкнути бота для всіх.
adminRouter.get('/notification-chats', telegramProbeRateLimiter, adminController.listNotificationChats)
adminRouter.get('/notification-topics', telegramProbeRateLimiter, adminController.listNotificationTopics)
adminRouter.get('/notification-log', adminController.listNotificationLog)
adminRouter.delete('/notification-log', adminController.clearNotificationLog)

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

adminRouter.get('/hosts', adminController.listHosts)
adminRouter.post('/hosts', adminController.addHost)
adminRouter.delete('/hosts/:userId', adminController.removeHost)

adminRouter.get('/vips', adminController.listVips)
adminRouter.post('/vips', adminController.addVip)
adminRouter.delete('/vips/:userId', adminController.removeVip)

adminRouter.get('/gpus', adminController.listGpus)
adminRouter.post('/gpus', adminController.addGpu)
adminRouter.delete('/gpus/:userId', adminController.removeGpu)

adminRouter.get('/quick-plans', adminController.listQuickPlans)
adminRouter.delete('/quick-plans/:id', adminController.deleteQuickPlan)

adminRouter.get('/registrations', adminRegistrationsController.list)
adminRouter.get('/registrations/:userId', adminRegistrationsController.getDetail)
adminRouter.post('/registrations/:userId/approve', adminRegistrationsController.approve)
adminRouter.post('/registrations/:userId/reject', adminRegistrationsController.reject)

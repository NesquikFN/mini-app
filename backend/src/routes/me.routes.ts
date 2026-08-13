import { Router } from 'express'
import * as meController from '../controllers/me.controller'
import { requireApprovedUser } from '../middleware/requireApprovedUser'

/**
 * Змонтований лише з requireTelegramAuth (routes/index.ts) — читання
 * власного профілю й подача заявки мають працювати ДО схвалення, інакше
 * RegistrationGate не зміг би показати ні форму, ні статус "очікуйте".
 * Усе інше під /me схвалення вже вимагає.
 */
export const meRouter = Router()

meRouter.get('/', meController.getMe)
meRouter.post('/registration', meController.submitRegistration)

meRouter.patch('/', requireApprovedUser, meController.updateMe)
meRouter.get('/events', requireApprovedUser, meController.getMyEvents)

meRouter.get('/notifications', requireApprovedUser, meController.getMyNotificationSettings)
meRouter.patch('/notifications', requireApprovedUser, meController.updateMyNotificationSettings)

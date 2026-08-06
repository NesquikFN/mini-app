import { Router } from 'express'
import * as meController from '../controllers/me.controller'

export const meRouter = Router()

meRouter.get('/', meController.getMe)
meRouter.get('/events', meController.getMyEvents)

import { Router } from 'express'
import * as usersController from '../controllers/users.controller'

export const usersRouter = Router()

usersRouter.get('/:id', usersController.getPublicProfile)
usersRouter.get('/:id/organizer-reputation', usersController.getOrganizerReputation)

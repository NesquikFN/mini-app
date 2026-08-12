import { Router } from 'express'
import * as pollsController from '../controllers/polls.controller'

export const pollsRouter = Router()

pollsRouter.get('/active', pollsController.getActivePoll)
pollsRouter.post('/:id/vote', pollsController.vote)

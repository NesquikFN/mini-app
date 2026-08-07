import { Router } from 'express'
import * as dormitoriesController from '../controllers/dormitories.controller'

export const dormitoriesRouter = Router()

dormitoriesRouter.get('/', dormitoriesController.listDormitories)

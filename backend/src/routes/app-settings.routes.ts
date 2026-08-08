import { Router } from 'express'
import * as appSettingsController from '../controllers/app-settings.controller'
import { requireAdmin } from '../middleware/requireAdmin'

export const appSettingsRouter = Router()

appSettingsRouter.get('/', appSettingsController.getAppSettings)
appSettingsRouter.put('/', requireAdmin, appSettingsController.updateAppSettings)

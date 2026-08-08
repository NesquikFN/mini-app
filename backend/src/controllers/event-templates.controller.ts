import type { Request, Response } from 'express'
import * as eventsService from '../services/events.service'
import { IMAGE_EXTENSIONS_BY_CONTENT_TYPE, saveUpload } from '../utils/uploads'
import { AppError } from '../utils/AppError'
import { eventTemplateIdParamSchema, eventTemplateSchema } from '../validation/event.schemas'

/**
 * "Ігри" — гейтиться лише requireTelegramAuth (routes/event-templates.routes.ts),
 * не requireAdmin: будь-який юзер може дивитись, створювати, редагувати,
 * видаляти й запускати шаблони. Раніше жила під /admin/event-templates.
 */
export async function listEventTemplates(_req: Request, res: Response): Promise<void> {
  res.json({ templates: await eventsService.listEventTemplates() })
}

export async function createEventTemplate(req: Request, res: Response): Promise<void> {
  const input = eventTemplateSchema.parse(req.body)
  res.status(201).json({ template: await eventsService.createEventTemplate(input) })
}

export async function updateEventTemplate(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  const input = eventTemplateSchema.parse(req.body)
  res.json({ template: await eventsService.updateEventTemplate(templateId, input) })
}

export async function uploadEventTemplateImage(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'IMAGE_REQUIRED', 'Оберіть фотографію')
  }

  const contentType = req.headers['content-type'] ?? ''
  const extension = IMAGE_EXTENSIONS_BY_CONTENT_TYPE[contentType]
  if (!extension) {
    throw new AppError(415, 'IMAGE_TYPE_UNSUPPORTED', 'Підтримуються JPG, PNG або WebP')
  }

  const imageUrl = await saveUpload(`templates/${templateId}/cover.${extension}`, req.body)
  const template = await eventsService.updateEventTemplateImage(templateId, imageUrl)
  res.json({ template })
}

export async function deleteEventTemplate(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  await eventsService.deleteEventTemplate(templateId)
  res.json({ success: true })
}

export async function createFromEventTemplate(req: Request, res: Response): Promise<void> {
  const { templateId } = eventTemplateIdParamSchema.parse(req.params)
  const event = await eventsService.createEventFromTemplate(
    templateId,
    req.user.id,
    req.user.dormitoryId,
  )
  res.status(201).json({ event })
}

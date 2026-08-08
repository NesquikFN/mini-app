import type { Request, Response } from 'express'
import { settingsRepository } from '../repositories/settings.repository'
import { socialLinksSchema } from '../validation/admin.schemas'

export async function getAppSettings(_req: Request, res: Response): Promise<void> {
  res.json(await settingsRepository.getSocialLinks())
}

export async function updateAppSettings(req: Request, res: Response): Promise<void> {
  const { discordUrl, telegramUrl } = socialLinksSchema.parse(req.body)
  res.json(await settingsRepository.setSocialLinks(discordUrl || undefined, telegramUrl || undefined))
}

import type { Request, Response } from 'express'
import { authenticateTelegramUser } from '../services/auth.service'

export async function telegramAuth(req: Request, res: Response): Promise<void> {
  const initData = (req.body as { initData?: unknown } | undefined)?.initData
  const { user, token } = await authenticateTelegramUser(initData)
  res.json({ user, token })
}

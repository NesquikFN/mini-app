import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env'
import { usersRepository } from '../repositories/users.repository'
import { verifySession } from '../services/session.service'
import { AppError } from '../utils/AppError'

export async function requireTelegramAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization)
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Потрібна автентифікація через Telegram')
    }

    const payload = verifySession(token, env.JWT_SECRET)
    const user = await usersRepository.getUserById(payload.sub)
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Користувача сесії не знайдено')
    }

    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

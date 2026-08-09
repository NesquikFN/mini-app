import { registrationsRepository } from '../repositories/registrations.repository'
import { toAuthUser } from '../repositories/users.repository'
import { AppError } from '../utils/AppError'
import type { AuthUser, RegistrationStatus } from '../types/user'
import type { RegistrationDetail, RegistrationsResponse } from '../types/admin'
import type { SubmitRegistrationInput } from '../validation/user.schemas'
import * as telegramNotifications from './telegram-notifications.service'

function buildPagination(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
}

export async function submitRegistration(
  userId: string,
  input: SubmitRegistrationInput,
): Promise<AuthUser> {
  const updated = await registrationsRepository.submit(userId, {
    age: input.age,
    faculty: input.faculty,
    instagram: input.instagram ?? null,
    bio: input.bio ?? null,
  })
  return toAuthUser(updated)
}

export async function listRegistrations(
  page: number,
  limit: number,
  status?: RegistrationStatus,
  search?: string,
): Promise<RegistrationsResponse> {
  const { registrations, total } = await registrationsRepository.findPaginated(page, limit, status, search)
  return { registrations, pagination: buildPagination(page, limit, total) }
}

export async function getRegistrationDetail(userId: string): Promise<RegistrationDetail> {
  const detail = await registrationsRepository.findById(userId)
  if (!detail) throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  return detail
}

/** Заявки вже не 'pending' після атомарного update у репозиторії (0 рядків
 * повернулось) — цей виклик лише підбирає, ЯКУ саме помилку показати
 * (юзера нема vs заявку вже розглянули), нічого в БД не змінюючи. */
async function throwPendingConflict(userId: string): Promise<never> {
  const existing = await registrationsRepository.findById(userId)
  if (!existing) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Користувача не знайдено')
  }
  throw new AppError(409, 'REGISTRATION_NOT_PENDING', 'Цю заявку вже розглянуто')
}

export async function approveRegistration(
  reviewerId: string,
  userId: string,
): Promise<RegistrationDetail> {
  if (reviewerId === userId) {
    throw new AppError(409, 'CANNOT_MODERATE_OWN_REGISTRATION', 'Не можна модерувати власну заявку')
  }

  const updated = await registrationsRepository.approve(userId, reviewerId)
  if (!updated) {
    return throwPendingConflict(userId)
  }

  // Помилка відправки не повинна відкочувати вже застосоване схвалення —
  // воно вже в БД, і немає сенсу скасовувати рішення через збій Telegram
  // API. sendAndLog усередині вже пише невдачу в notification_log.
  try {
    await telegramNotifications.sendRegistrationApprovedMessage(String(updated.telegramId))
  } catch (error) {
    console.error('Не вдалося надіслати сповіщення про схвалення реєстрації:', error)
  }

  return updated
}

export async function rejectRegistration(
  reviewerId: string,
  userId: string,
  reason?: string,
): Promise<RegistrationDetail> {
  if (reviewerId === userId) {
    throw new AppError(409, 'CANNOT_MODERATE_OWN_REGISTRATION', 'Не можна модерувати власну заявку')
  }

  const updated = await registrationsRepository.reject(userId, reviewerId, reason ?? null)
  if (!updated) {
    return throwPendingConflict(userId)
  }

  return updated
}

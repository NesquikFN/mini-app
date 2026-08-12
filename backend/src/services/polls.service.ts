import { pollsRepository, type PollRow } from '../repositories/polls.repository'
import { pollBroadcastsRepository } from '../repositories/poll-broadcasts.repository'
import { usersRepository } from '../repositories/users.repository'
import { AppError } from '../utils/AppError'
import { mapWithConcurrency } from '../utils/concurrency'
import { NOTIFICATION_CONCURRENCY, sendPollBroadcastMessage } from './telegram-notifications.service'
import type {
  AdminPollResponse,
  PollAudience,
  PollBroadcastReport,
  PollResponse,
} from '../types/poll'
import type { CreatePollInput } from '../validation/poll.schemas'

/** Округлені відсотки голосів. Без голосів узагалі — усі варіанти 0%, а
 * не NaN/ділення на нуль. Сума округлених відсотків може відхилятись від
 * 100 на кілька відсоткових пунктів (звичайний наслідок округлення
 * кожного варіанту окремо) — прийнятно для компактної картки. */
export function calculatePercentages(votes: number[]): number[] {
  const total = votes.reduce((sum, count) => sum + count, 0)
  if (total === 0) return votes.map(() => 0)
  return votes.map((count) => Math.round((count / total) * 100))
}

function pollNotFound(): AppError {
  return new AppError(404, 'POLL_NOT_FOUND', 'Опитування не знайдено')
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

async function toResponse(poll: PollRow, viewerId?: string): Promise<PollResponse> {
  const optionRows = await pollsRepository.getOptionsWithCounts(poll.id)
  const percentages = calculatePercentages(optionRows.map((option) => option.votes))
  const totalVotes = await pollsRepository.getTotalVoters(poll.id)
  const myOptionId = viewerId
    ? (await pollsRepository.getMyVote(poll.id, viewerId)) ?? undefined
    : undefined

  return {
    id: poll.id,
    question: poll.question,
    status: poll.status,
    endsAt: poll.ends_at ?? undefined,
    createdAt: poll.created_at,
    publishedAt: poll.published_at ?? undefined,
    finishedAt: poll.finished_at ?? undefined,
    options: optionRows.map((option, index) => ({
      id: option.id,
      text: option.text,
      position: option.position,
      votes: option.votes,
      percentage: percentages[index],
    })),
    totalVotes,
    myOptionId,
  }
}

// ---------------------------------------------------------------------
// Користувацькі дії
// ---------------------------------------------------------------------

/** Єдине опубліковане опитування, якщо є — той самий unique-індекс у БД
 * гарантує, що активне щонайбільше одне. */
export async function getActivePollForViewer(viewerId: string): Promise<PollResponse | null> {
  const poll = await pollsRepository.findActive()
  if (!poll) return null
  return toResponse(poll, viewerId)
}

/**
 * Голос — атомарний upsert у репозиторії (один SQL-оператор: insert або,
 * при повторному голосуванні, on conflict update). Якщо rowCount === 0,
 * причину з'ясовує окремий SELECT: немає опитування, воно вже не
 * активне, або вказаний варіант йому не належить — три різні відповіді
 * користувачу замість однієї загальної помилки.
 */
export async function votePoll(
  pollId: string,
  optionId: string,
  userId: string,
): Promise<PollResponse> {
  const success = await pollsRepository.vote(pollId, optionId, userId)
  if (!success) {
    const poll = await pollsRepository.findById(pollId)
    if (!poll) throw pollNotFound()
    if (poll.status !== 'active') {
      throw new AppError(409, 'POLL_NOT_ACTIVE', 'Опитування вже завершено')
    }
    throw new AppError(400, 'INVALID_POLL_OPTION', 'Обраний варіант не належить цьому опитуванню')
  }

  const poll = await pollsRepository.findById(pollId)
  if (!poll) throw pollNotFound()
  return toResponse(poll, userId)
}

// ---------------------------------------------------------------------
// Адмінські дії
// ---------------------------------------------------------------------

async function toAdminResponse(poll: PollRow): Promise<AdminPollResponse> {
  const base = await toResponse(poll)
  const lastBroadcast = await pollBroadcastsRepository.findLastCompleted(poll.id)
  return {
    ...base,
    lastBroadcastAt: lastBroadcast?.completed_at ?? undefined,
    lastBroadcastAudience: lastBroadcast?.audience,
  }
}

export async function listPollsForAdmin(): Promise<AdminPollResponse[]> {
  const polls = await pollsRepository.listAll()
  return Promise.all(polls.map(toAdminResponse))
}

async function getPollRowOrThrow(id: string): Promise<PollRow> {
  const poll = await pollsRepository.findById(id)
  if (!poll) throw pollNotFound()
  return poll
}

export async function createPoll(adminId: string, input: CreatePollInput): Promise<AdminPollResponse> {
  const id = await pollsRepository.create(input.question, input.options, input.endsAt ?? null, adminId)
  return toAdminResponse(await getPollRowOrThrow(id))
}

export async function updatePoll(id: string, input: CreatePollInput): Promise<AdminPollResponse> {
  const updated = await pollsRepository.update(id, input.question, input.options, input.endsAt ?? null)
  if (!updated) {
    await getPollRowOrThrow(id) // 404, якщо опитування взагалі не існує
    throw new AppError(409, 'POLL_NOT_EDITABLE', 'Редагувати можна лише опитування-чернетку')
  }
  return toAdminResponse(await getPollRowOrThrow(id))
}

export async function publishPoll(id: string): Promise<AdminPollResponse> {
  let published: PollRow | null
  try {
    published = await pollsRepository.publish(id)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'POLL_ALREADY_ACTIVE',
        'Уже є активне опитування. Спочатку завершіть його.',
      )
    }
    throw error
  }
  if (!published) {
    await getPollRowOrThrow(id)
    throw new AppError(409, 'POLL_NOT_DRAFT', 'Опублікувати можна лише опитування-чернетку')
  }
  return toAdminResponse(published)
}

export async function finishPoll(id: string): Promise<AdminPollResponse> {
  const finished = await pollsRepository.finish(id)
  if (!finished) {
    await getPollRowOrThrow(id)
    throw new AppError(409, 'POLL_NOT_ACTIVE', 'Завершити можна лише активне опитування')
  }
  return toAdminResponse(finished)
}

export async function deletePoll(id: string): Promise<void> {
  const removed = await pollsRepository.remove(id)
  if (!removed) throw pollNotFound()
}

export async function getAudienceCount(audience: PollAudience): Promise<number> {
  return usersRepository.countBroadcastAudience(audience)
}

/**
 * Масова розсилка опитування в особисті повідомлення.
 *
 * Захист від повторної розсилки — два незалежні шари:
 *  1. Аудитний гейт: якщо для цього опитування вже є ЗАВЕРШЕНИЙ запуск
 *     розсилки (будь-якій аудиторії) і `resend` не передано, запит
 *     відхиляється — адмін мусить явно підтвердити повтор.
 *  2. Технічна гарантія: навіть якщо resend=true (або гейт колись
 *     обійдуть), кожен одержувач, кому це опитування вже було УСПІШНО
 *     надіслано (за журналом сповіщень), пропускається — один
 *     telegram-чат не отримує те саме опитування двічі. Саме це і
 *     формує лічильник `skipped` у звіті.
 */
export async function broadcastPoll(
  pollId: string,
  adminId: string,
  audience: PollAudience,
  resend: boolean,
): Promise<PollBroadcastReport> {
  const poll = await getPollRowOrThrow(pollId)
  if (poll.status !== 'active') {
    throw new AppError(409, 'POLL_NOT_ACTIVE', 'Розсилати можна лише опубліковане опитування')
  }

  const lastBroadcast = await pollBroadcastsRepository.findLastCompleted(pollId)
  if (lastBroadcast && !resend) {
    throw new AppError(
      409,
      'POLL_ALREADY_BROADCAST',
      'Це опитування вже надсилалося раніше. Повторна розсилка потребує додаткового підтвердження.',
    )
  }

  const options = await pollsRepository.getOptionsWithCounts(pollId)
  const [allTelegramIds, alreadySent] = await Promise.all([
    usersRepository.getBroadcastAudienceTelegramIds(audience),
    pollBroadcastsRepository.findAlreadySentChatIds(pollId),
  ])

  const targeted = allTelegramIds.length
  const recipients = allTelegramIds.filter((telegramId) => !alreadySent.has(String(telegramId)))
  const skipped = targeted - recipients.length

  const broadcastId = await pollBroadcastsRepository.start(pollId, audience, targeted, adminId)

  let sent = 0
  let failed = 0
  await mapWithConcurrency(recipients, NOTIFICATION_CONCURRENCY, async (telegramId) => {
    // Кожен одержувач ловиться окремо: одна відмова (заблокував бота,
    // 403, тимчасовий 5xx) не повинна зупиняти розсилку решті — той
    // самий принцип, що й у announceEvent/event-reminders.
    try {
      await sendPollBroadcastMessage(String(telegramId), {
        id: poll.id,
        question: poll.question,
        options: options.map((option) => option.text),
      })
      sent += 1
    } catch {
      failed += 1
    }
  })

  await pollBroadcastsRepository.complete(broadcastId, sent, failed, skipped)

  return { audience, targeted, sent, failed, skipped }
}

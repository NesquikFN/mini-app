import {
  quickPlansRepository,
  type QuickPlanWithParticipants,
} from '../repositories/quick-plans.repository'
import { usersRepository } from '../repositories/users.repository'
import { AppError } from '../utils/AppError'
import { kyivNow } from '../utils/kyivTime'
import { NO_DORMITORY_ID } from '../types/dormitory'
import type { PublicUser } from '../types/user'
import type {
  QuickPlanLifetime,
  QuickPlanResponse,
} from '../types/quick-plan'
import type { CreateQuickPlanInput } from '../validation/quick-plan.schemas'
import { sendQuickPlanJoinNotification } from './telegram-notifications.service'

/** Стеля активних планів на одного автора — головний антиспам-запобіжник
 * (окремо від rate limit, який обмежує лише темп, а не кількість). */
export const MAX_ACTIVE_PLANS_PER_USER = 3

const LIFETIME_HOURS: Record<Exclude<QuickPlanLifetime, 'today'>, number> = {
  '3h': 3,
  '6h': 6,
  '12h': 12,
}

/**
 * Абсолютний момент, коли план протухне. Для 'today' рахуємо, скільки
 * хвилин лишилось до київської півночі, і додаємо їх до «зараз» — так
 * результат не залежить від таймзони самого процесу (Railway працює в
 * UTC), рівно як і решта часової математики в utils/kyivTime.ts.
 */
export function resolveExpiresAt(lifetime: QuickPlanLifetime, now = new Date()): string {
  if (lifetime === 'today') {
    const { time } = kyivNow()
    const [hours, minutes] = time.split(':').map(Number)
    const minutesLeft = 24 * 60 - (hours * 60 + minutes)
    return new Date(now.getTime() + minutesLeft * 60_000).toISOString()
  }
  return new Date(now.getTime() + LIFETIME_HOURS[lifetime] * 60 * 60_000).toISOString()
}

/** Гуртожиток «Без гуртожитку» — це не місце, де можна зустрітись, тож
 * такий користувач створює лише онлайн-плани (та сама логіка, що й для
 * подій у event-invariants.ts). */
function assertCanCreate(input: CreateQuickPlanInput, dormitoryId: string | undefined): void {
  if (input.isOnline) return

  if (!dormitoryId || dormitoryId === NO_DORMITORY_ID) {
    throw new AppError(
      400,
      'ONLINE_PLAN_REQUIRED',
      'Без гуртожитку можна створювати лише онлайн-плани',
    )
  }
}

/** Чи видно план цьому глядачеві: онлайн — усім, офлайн — лише своєму
 * гуртожитку. Єдине джерело правди для GET/join/leave, щоб жоден із
 * шляхів не виявився м'якшим за інші. */
function isVisibleTo(plan: QuickPlanWithParticipants, viewerDormitoryId?: string): boolean {
  if (plan.isOnline) return true
  return Boolean(viewerDormitoryId) && plan.dormitoryId === viewerDormitoryId
}

/**
 * Недоступний план завжди виглядає як неіснуючий — та сама 404, що й для
 * простроченого чи видаленого. Інакше відповідь «немає прав» сама по собі
 * підтверджувала б, що план із таким id існує в чужому гуртожитку.
 */
function planNotFound(): AppError {
  return new AppError(404, 'QUICK_PLAN_NOT_FOUND', 'План не знайдено')
}

/** Один batch-запит публічних профілів на весь список планів (автори +
 * учасники разом), а не по запиту на план — той самий підхід, що й
 * attachParticipantPreviews в events.service.ts. */
async function toResponses(
  plans: QuickPlanWithParticipants[],
  viewerId: string,
): Promise<QuickPlanResponse[]> {
  if (plans.length === 0) return []

  const ids = new Set<string>()
  for (const plan of plans) {
    ids.add(plan.creatorId)
    for (const participantId of plan.participantIds) ids.add(participantId)
  }

  const users = await usersRepository.getPublicUsersByIds([...ids])
  const byId = new Map(users.map((user) => [user.id, user]))
  const resolve = (id: string): PublicUser => byId.get(id) ?? { id, firstName: 'Учасник DormHub' }

  return plans.map((plan) => ({
    id: plan.id,
    creatorId: plan.creatorId,
    text: plan.text,
    category: plan.category,
    isOnline: plan.isOnline,
    dormitoryId: plan.dormitoryId,
    expiresAt: plan.expiresAt,
    createdAt: plan.createdAt,
    creator: resolve(plan.creatorId),
    participants: plan.participantIds.map(resolve),
    participantCount: plan.participantIds.length,
    joined: plan.participantIds.includes(viewerId),
  }))
}

async function toResponse(
  plan: QuickPlanWithParticipants,
  viewerId: string,
): Promise<QuickPlanResponse> {
  const [response] = await toResponses([plan], viewerId)
  return response
}

/** Активний план, видимий саме цьому глядачеві — або 404. Спільний вхід
 * для join/leave/delete, тож жоден із них не може «побачити» чуже. */
async function getVisiblePlanOrThrow(
  planId: string,
  viewerDormitoryId: string | undefined,
): Promise<QuickPlanWithParticipants> {
  const plan = await quickPlansRepository.findById(planId)
  if (!plan || !isVisibleTo(plan, viewerDormitoryId)) {
    throw planNotFound()
  }
  return plan
}

export async function listQuickPlans(
  viewerId: string,
  viewerDormitoryId: string | undefined,
): Promise<QuickPlanResponse[]> {
  // «Без гуртожитку» (і взагалі будь-хто без обраного гуртожитку) бачить
  // лише глобальні онлайн-плани — передавати такий id у фільтр не можна,
  // інакше він став би окремим «гуртожитком» зі своїми офлайн-планами.
  const scopeDormitoryId =
    viewerDormitoryId && viewerDormitoryId !== NO_DORMITORY_ID ? viewerDormitoryId : undefined
  const plans = await quickPlansRepository.findVisible(scopeDormitoryId)
  return toResponses(plans, viewerId)
}

export async function createQuickPlan(
  creatorId: string,
  creatorDormitoryId: string | undefined,
  input: CreateQuickPlanInput,
): Promise<QuickPlanResponse> {
  assertCanCreate(input, creatorDormitoryId)

  const activeCount = await quickPlansRepository.countActiveByCreator(creatorId)
  if (activeCount >= MAX_ACTIVE_PLANS_PER_USER) {
    throw new AppError(
      409,
      'QUICK_PLAN_LIMIT_REACHED',
      `Одночасно можна мати не більше ${MAX_ACTIVE_PLANS_PER_USER} активних планів`,
    )
  }

  const plan = await quickPlansRepository.insert({
    creatorId,
    text: input.text,
    category: input.category,
    isOnline: input.isOnline,
    // Онлайн-план глобальний і гуртожитку не має; офлайн завжди бере
    // гуртожиток автора з сесії (assertCanCreate уже гарантував, що він є).
    dormitoryId: input.isOnline ? null : creatorDormitoryId ?? null,
    expiresAt: resolveExpiresAt(input.lifetime),
  })

  return toResponse(plan, creatorId)
}

/**
 * Автор у списку відгуків не з'являється — він і так очевидно «з вами»,
 * а окремий рядок лише плутав би лічильник. Повторний виклик нічого не
 * дублює (unique + on conflict do nothing у репозиторії) і DM не шле.
 */
export async function joinQuickPlan(
  planId: string,
  userId: string,
  viewerDormitoryId: string | undefined,
): Promise<QuickPlanResponse> {
  const plan = await getVisiblePlanOrThrow(planId, viewerDormitoryId)
  if (plan.creatorId === userId) {
    throw new AppError(409, 'QUICK_PLAN_OWN_PLAN', 'Це ваш власний план')
  }

  const inserted = await quickPlansRepository.addParticipant(planId, userId)

  if (inserted) {
    // Збій Telegram не має відкочувати вже зафіксований відгук — тому
    // помилка ловиться тут і лише логується (sendAndLog уже записав її
    // в notification_log). Той самий принцип, що й для join-підтверджень
    // подій в events.service.ts.
    await notifyAuthorOfJoin(plan, userId).catch((error: unknown) => {
      console.error(`Не вдалося сповістити автора плану ${planId} про відгук:`, error)
    })
  }

  const updated = await quickPlansRepository.findById(planId)
  return toResponse(updated ?? plan, userId)
}

async function notifyAuthorOfJoin(
  plan: QuickPlanWithParticipants,
  joinerId: string,
): Promise<void> {
  const [author, joiner] = await Promise.all([
    usersRepository.getUserById(plan.creatorId),
    usersRepository.getPublicUserById(joinerId),
  ])
  if (!author || !joiner) return

  await sendQuickPlanJoinNotification(String(author.telegramId), {
    planText: plan.text,
    joinerName: joiner.nickname ?? joiner.firstName,
  })
}

export async function leaveQuickPlan(
  planId: string,
  userId: string,
  viewerDormitoryId: string | undefined,
): Promise<QuickPlanResponse> {
  const plan = await getVisiblePlanOrThrow(planId, viewerDormitoryId)

  const removed = await quickPlansRepository.removeParticipant(planId, userId)
  if (!removed) {
    throw new AppError(409, 'QUICK_PLAN_NOT_JOINED', 'Ви не відгукувались на цей план')
  }

  const updated = await quickPlansRepository.findById(planId)
  return toResponse(updated ?? plan, userId)
}

export async function deleteOwnQuickPlan(
  planId: string,
  userId: string,
  viewerDormitoryId: string | undefined,
): Promise<void> {
  const plan = await getVisiblePlanOrThrow(planId, viewerDormitoryId)
  if (plan.creatorId !== userId) {
    throw new AppError(403, 'QUICK_PLAN_OWNER_REQUIRED', 'Видалити план може лише його автор')
  }
  await quickPlansRepository.remove(planId)
}

/** Адмінське видалення — без перевірки гуртожитку й авторства (доступ
 * уже обмежений requireAdmin на рівні роутера). */
export async function deleteQuickPlanAsAdmin(planId: string): Promise<void> {
  const removed = await quickPlansRepository.remove(planId)
  if (!removed) {
    throw planNotFound()
  }
}

export interface AdminQuickPlansResponse {
  plans: QuickPlanResponse[]
  total: number
}

export async function listQuickPlansForAdmin(
  adminId: string,
  limit: number,
): Promise<AdminQuickPlansResponse> {
  const { plans, total } = await quickPlansRepository.findRecentActive(limit)
  return { plans: await toResponses(plans, adminId), total }
}

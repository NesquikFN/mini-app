import { AppError } from '../utils/AppError'
import { isKyivDateTimeInPast } from '../utils/kyivTime'
import { NO_DORMITORY_ID } from '../types/dormitory'

/**
 * Правила, яким має відповідати подія — в одному місці, щоб створення й
 * редагування не розходились. Раніше перевірки жили тільки всередині
 * createEvent, тож PATCH міг привести подію у стан, який create ніколи
 * не дозволив би створити (наприклад офлайн-подія в «Без гуртожитку» —
 * така подія потім невидима навіть власному авторові).
 *
 * Функції навмисно чисті (без запитів у БД) — так їх можна юніт-тестувати
 * без бази, і так їх неможливо «забути» викликати непомітно: обидва
 * шляхи запису приймають той самий об'єкт.
 */

/** Стеля учасників. Колонка max_participants — Postgres `integer`, тож
 * без межі великий JSON-number валить драйвер; 10000 із запасом більше
 * за будь-яку реальну подію в гуртожитку. */
export const MAX_EVENT_PARTICIPANTS = 10_000

export interface EventInvariantInput {
  /** Гуртожиток події (з профілю автора або шаблону) — не з тіла запиту. */
  dormitoryId: string
  isOnline: boolean
  location: string
  date: string
  time: string
  maxParticipants: number
  /** Скільки учасників уже є — лише для редагування. */
  currentParticipantCount?: number
}

export function assertEventInvariants(input: EventInvariantInput): void {
  if (input.dormitoryId === NO_DORMITORY_ID && !input.isOnline) {
    throw new AppError(
      400,
      'ONLINE_EVENT_REQUIRED',
      'Без гуртожитку можна створювати лише онлайн-події',
    )
  }

  // Офлайн-подія без місця не має сенсу. Для онлайн-події місце
  // формальне («Онлайн»), тож там нічого не вимагаємо.
  if (!input.isOnline && input.location.trim().length === 0) {
    throw new AppError(400, 'LOCATION_REQUIRED', 'Вкажіть місце проведення офлайн-події')
  }

  if (isKyivDateTimeInPast(input.date, input.time)) {
    throw new AppError(
      400,
      'EVENT_DATE_IN_PAST',
      'Дата й час події не можуть бути в минулому',
    )
  }

  if (input.maxParticipants < 1 || input.maxParticipants > MAX_EVENT_PARTICIPANTS) {
    throw new AppError(
      400,
      'MAX_PARTICIPANTS_OUT_OF_RANGE',
      `Кількість учасників має бути від 1 до ${MAX_EVENT_PARTICIPANTS}`,
    )
  }

  if (
    input.currentParticipantCount !== undefined &&
    input.maxParticipants < input.currentParticipantCount
  ) {
    throw new AppError(
      400,
      'MAX_PARTICIPANTS_TOO_SMALL',
      'Ліміт не може бути меншим за поточну кількість учасників',
    )
  }
}

/** Завершену подію не редагують — вона вже в архіві. */
export function assertEventEditable(event: { date: string; time: string }): void {
  if (isKyivDateTimeInPast(event.date, event.time)) {
    throw new AppError(409, 'EVENT_ARCHIVED', 'Завершену подію не можна редагувати')
  }
}

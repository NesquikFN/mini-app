import type { PublicUser } from './user'

export interface DormEvent {
  id: string
  creatorId: string
  title: string
  description: string
  imageUrl?: string
  groupUrl?: string
  gameUrl?: string
  isOnline: boolean
  vipOnly: boolean
  gpuOnly: boolean
  date: string
  time: string
  location: string
  maxParticipants: number
  participants: string[]
  /** === participants.length; API завжди надсилає його, optional тут
   * лише про всяк випадок для типу — компоненти рахують сумісно й через
   * participants.length. */
  participantCount?: number
  /** Перші (за часом приєднання) щонайбільше 3 учасники з публічними
   * профілями — для ParticipantAvatarStack на картці події. */
  participantPreview?: PublicUser[]
  createdAt: string
  /** FK на dormitories.id — гуртожиток творця на момент створення. */
  dormitoryId: string
  /** Скільки людей у черзі. Сам список черги звичайному користувачу не
   * повертається — лише організатору й адміну окремим запитом. */
  waitlistCount?: number
  /** Позиція поточного користувача в черзі (1-based), якщо він у ній. */
  viewerWaitlistPosition?: number
  /** Автоматичний бейдж «Надійний організатор» творця події — рахується
   * на бекенді з актуальних даних, ніде не зберігається. */
  creatorReliable?: boolean
}

export interface CreateEventInput {
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  groupUrl?: string
  gameUrl?: string
  isOnline: boolean
  vipOnly: boolean
  gpuOnly: boolean
  imageFile?: File
}

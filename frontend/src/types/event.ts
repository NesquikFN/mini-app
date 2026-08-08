import type { PublicUser } from './user'

export interface DormEvent {
  id: string
  creatorId: string
  title: string
  description: string
  imageUrl?: string
  groupUrl?: string
  isOnline: boolean
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
}

export interface CreateEventInput {
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  groupUrl?: string
  isOnline: boolean
  imageFile?: File
}

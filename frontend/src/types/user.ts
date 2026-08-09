export type RegistrationStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected'

export interface AuthUser {
  id: string
  telegramId: number
  firstName: string
  username?: string
  photoUrl?: string
  nickname?: string
  instagram?: string
  bio?: string
  age?: number
  faculty?: string
  registrationStatus: RegistrationStatus
  /** Лише коли registrationStatus === 'rejected'. */
  registrationRejectionReason?: string
  /** FK на dormitories.id, ще не обраний користувачем — undefined. */
  dormitoryId?: string
  /** Особиста підписка на DM-сповіщення про нові події від бота. */
  notifyNewEvents: boolean
  isAdmin: boolean
  isHost: boolean
  isVip: boolean
}

/** Публічний профіль організатора чи учасника події — те, що API
 * GET /events/:id повертає про будь-кого, не лише про себе. */
export interface PublicUser {
  id: string
  firstName: string
  username?: string
  photoUrl?: string
  nickname?: string
  instagram?: string
  bio?: string
  age?: number
  dormitoryId?: string
}

export interface UpdateProfileInput {
  nickname: string | null
  instagram: string | null
  bio: string | null
  age: number | null
}

export interface SubmitRegistrationInput {
  age: number
  faculty: string
  instagram?: string
  bio?: string
}

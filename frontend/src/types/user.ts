export interface AuthUser {
  id: string
  telegramId: number
  firstName: string
  username?: string
  photoUrl?: string
  /** FK на dormitories.id, ще не обраний користувачем — undefined. */
  dormitoryId?: string
  /** Особиста підписка на DM-сповіщення про нові події від бота. */
  notifyNewEvents: boolean
}

/** Публічний профіль організатора чи учасника події — те, що API
 * GET /events/:id повертає про будь-кого, не лише про себе. */
export interface PublicUser {
  id: string
  firstName: string
  username?: string
  photoUrl?: string
  dormitoryId?: string
}

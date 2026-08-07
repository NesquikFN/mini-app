import type { AuthUser } from '../types/user'

export function isUserBanned(user: Pick<AuthUser, 'bannedPermanently' | 'bannedUntil'>): boolean {
  if (user.bannedPermanently) return true
  if (!user.bannedUntil) return false
  return new Date(user.bannedUntil).getTime() > Date.now()
}

export function bannedMessage(user: Pick<AuthUser, 'bannedPermanently' | 'bannedUntil'>): string {
  if (user.bannedPermanently || !user.bannedUntil) {
    return 'Ваш доступ до DormHub заблоковано адміністратором'
  }
  return `Ваш доступ до DormHub заблоковано до ${new Date(user.bannedUntil).toLocaleString('uk-UA')}`
}

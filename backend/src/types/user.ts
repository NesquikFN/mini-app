export interface AuthUser {
  id: string
  telegramId: number
  firstName: string
  username?: string
}

/** Ширший погляд на users-рядок для адмін-панелі — включає поля, які
 * звичайному Mini App користувачу не показуються (прізвище, дата
 * реєстрації). */
export interface AdminUserView {
  id: string
  telegramId: number
  firstName: string
  lastName?: string
  username?: string
  createdAt: string
}

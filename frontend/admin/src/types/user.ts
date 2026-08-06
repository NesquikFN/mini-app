export interface AuthUser {
  id: string
  telegramId: number
  firstName: string
  username?: string
}

/** Ширший погляд на users для адмін-панелі — з прізвищем і датою
 * реєстрації, яких звичайний Mini App не показує. */
export interface AdminUserView {
  id: string
  telegramId: number
  firstName: string
  lastName?: string
  username?: string
  createdAt: string
}

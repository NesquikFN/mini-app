export interface AuthUser {
  id: string
  telegramId: number
  firstName: string
  username?: string
  /** FK на dormitories.id. Ще не обраний користувачем — undefined. */
  dormitoryId?: string
}

/** Ширший погляд на users-рядок для адмін-панелі — включає поля, які
 * звичайному Mini App користувачу не показуються (прізвище, telegram_id,
 * дата реєстрації). */
export interface AdminUserView {
  id: string
  telegramId: number
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
  dormitoryId?: string
  createdAt: string
}

/** Мінімальний публічний профіль — усе, що будь-який автентифікований
 * користувач DormHub може побачити про організатора чи учасника чужої
 * події. Без telegram_id, дати реєстрації чи інших полів AdminUserView.
 * dormitoryId лишається — це не приватна інформація в застосунку, що
 * весь побудований навколо гуртожитків. */
export interface PublicUser {
  id: string
  firstName: string
  username?: string
  photoUrl?: string
  dormitoryId?: string
}

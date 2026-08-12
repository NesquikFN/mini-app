import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { getTelegramWebApp, isRunningInTelegram } from '../services/telegram'
import {
  VISITS_BEFORE_PROMPT,
  isAlreadyAdded,
  isDismissed,
  isUnknownCooldownOver,
  registerVisit,
  rememberAdded,
  rememberDismissed,
  rememberShown,
} from '../services/homeScreenPrompt'
import type { TelegramHomeScreenStatus } from '../types/telegram'

export interface HomeScreenShortcut {
  /** Чи показувати банер прямо зараз. */
  isVisible: boolean
  /** Статус ще перевіряється — банер свідомо прихований, щоб не блимнути
   * і не зникнути одразу після відповіді Telegram. */
  isChecking: boolean
  /** Викликати ЛИШЕ з обробника тапу: Telegram показує нативний діалог,
   * а той дозволений тільки як реакція на дію користувача. */
  addToHomeScreen: () => void
  /** «Не зараз» — ховає банер на 30 днів. */
  dismiss: () => void
  /**
   * Ярлик щойно додано — привід показати toast. Поза чотирма полями з
   * технічного завдання: подія `homeScreenAdded` приходить сюди, а
   * рендерити toast має компонент, тож інакше цей факт нікуди передати,
   * не повертаючи Telegram-логіку назад у HomePage.
   */
  justAdded: boolean
}

/**
 * Пропозиція додати DormHub на головний екран телефона (Bot API 8.0+).
 *
 * Показуємо тільки коли збіглося все: схвалений користувач, справжній
 * Telegram-клієнт із підтримкою цієї функції, третє окреме відвідування,
 * ярлика ще немає і людина раніше не відмовлялася.
 *
 * Уся робота з Telegram і localStorage замкнена тут — HomePage лише
 * підключає хук і віддає результат компоненту банера.
 */
/**
 * Чи взагалі є сенс питати Telegram про статус ярлика. Усе тут —
 * синхронні читання, тож відповідь відома ще до першого рендера і не
 * потребує setState всередині ефекту.
 *
 * Звичайний браузер (локальна розробка через DEV_AUTH) і клієнти до
 * Bot API 8.0 відсіюються тут-таки: у них немає ні методу, ні самого
 * головного екрана.
 */
function canAskTelegram(): boolean {
  if (!isRunningInTelegram()) return false
  if (!getTelegramWebApp()?.checkHomeScreenStatus) return false
  // Ярлик уже додано або людина відмовилась — статус нічого не змінить.
  return !isAlreadyAdded() && !isDismissed()
}

export function useHomeScreenShortcut(): HomeScreenShortcut {
  const { user } = useCurrentUser()
  const isApproved = user?.registrationStatus === 'approved'

  const [isChecking, setIsChecking] = useState(() => isApproved && canAskTelegram())
  const [isVisible, setIsVisible] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  /** Статус може прийти двічі — і callback-ом, і подією homeScreenChecked.
   * Обробляємо перший, решту ігноруємо. */
  const statusHandled = useRef(false)

  useEffect(() => {
    if (!isApproved || !canAskTelegram()) return

    const webApp = getTelegramWebApp()
    if (!webApp?.checkHomeScreenStatus) return

    const visits = registerVisit()
    let active = true

    const resolveStatus = (status: TelegramHomeScreenStatus): void => {
      if (!active || statusHandled.current) return
      statusHandled.current = true
      setIsChecking(false)

      if (status === 'added') {
        // Ярлик уже є — запам'ятовуємо, щоб більше не турбувати Telegram.
        rememberAdded()
        return
      }
      if (status === 'unsupported') return

      if (visits < VISITS_BEFORE_PROMPT) return

      // `unknown` означає «додавання підтримується, але чи є ярлик —
      // невідомо». Показувати щоразу було б настирливо для того, хто вже
      // додав застосунок, тож розріджуємо показ.
      if (status === 'unknown' && !isUnknownCooldownOver()) return

      rememberShown()
      setIsVisible(true)
    }

    const handleChecked = (event: { status: TelegramHomeScreenStatus }): void => {
      resolveStatus(event.status)
    }

    const handleAdded = (): void => {
      if (!active) return
      rememberAdded()
      setIsVisible(false)
      setJustAdded(true)
    }

    webApp.onEvent?.('homeScreenChecked', handleChecked)
    webApp.onEvent?.('homeScreenAdded', handleAdded)
    // Callback і подія дублюють один одного навмисно: різні клієнти
    // відповідають по-різному, а resolveStatus усе одно спрацює один раз.
    webApp.checkHomeScreenStatus(resolveStatus)

    return () => {
      active = false
      webApp.offEvent?.('homeScreenChecked', handleChecked)
      webApp.offEvent?.('homeScreenAdded', handleAdded)
    }
  }, [isApproved])

  const addToHomeScreen = useCallback(() => {
    const webApp = getTelegramWebApp()
    if (!webApp?.addToHomeScreen) {
      // Функція недоступна — тихо прибираємо банер, без помилки.
      setIsVisible(false)
      return
    }
    // Синхронно, прямо з тапу: нативний діалог Telegram інакше не
    // відкриється. Успіх підтверджує лише подія homeScreenAdded, тож
    // банер тут навмисно не ховаємо — інакше вийшов би фальшивий успіх
    // для того, хто діалог закрив.
    webApp.addToHomeScreen()
  }, [])

  const dismiss = useCallback(() => {
    rememberDismissed()
    setIsVisible(false)
  }, [])

  return { isVisible, isChecking, addToHomeScreen, dismiss, justAdded }
}

import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { UserContext, type UserContextValue } from '../context/UserContext'
import { EventsContext, type EventsContextValue } from '../context/EventsContext'
import { DormitoriesContext, type DormitoriesContextValue } from '../context/DormitoriesContext'
import type { AuthUser, RegistrationStatus } from '../types/user'
import type {
  TelegramHomeScreenCheckedEvent,
  TelegramHomeScreenStatus,
} from '../types/telegram'

/**
 * Спільна обв'язка для тестів пропозиції «додати на головний екран»:
 * підроблений Telegram WebApp і контексти без мережевих запитів.
 */

export function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    telegramId: 123456789,
    firstName: 'Тимофій',
    registrationStatus: 'approved' satisfies RegistrationStatus,
    notifyNewEvents: true,
    isAdmin: false,
    isHost: false,
    isVip: false,
    isGpu: false,
    ...overrides,
  }
}

type CheckedHandler = (event: TelegramHomeScreenCheckedEvent) => void
type AddedHandler = () => void

export interface FakeWebApp {
  addToHomeScreen: ReturnType<typeof vi.fn>
  checkHomeScreenStatus: ReturnType<typeof vi.fn>
  onEvent: ReturnType<typeof vi.fn>
  offEvent: ReturnType<typeof vi.fn>
  /** Емулює подію homeScreenAdded від клієнта Telegram. */
  emitAdded: () => void
  /** Емулює подію homeScreenChecked (шлях без callback). */
  emitChecked: (status: TelegramHomeScreenStatus) => void
  /** Скільки обробників лишилось підписаними — для перевірки cleanup. */
  activeListenerCount: () => number
}

export interface InstallWebAppOptions {
  /** Статус, який поверне checkHomeScreenStatus у callback. `null` —
   * не відповідати взагалі (клієнт мовчить). */
  status?: TelegramHomeScreenStatus | null
  /** Клієнт до Bot API 8.0: методу немає зовсім. */
  supportsHomeScreen?: boolean
}

/**
 * Ставить window.Telegram.WebApp із підробленими методами головного
 * екрана. Повертає ручки для емуляції подій і перевірки підписок.
 */
export function installFakeWebApp(options: InstallWebAppOptions = {}): FakeWebApp {
  const { status = 'missed', supportsHomeScreen = true } = options

  const checkedHandlers = new Set<CheckedHandler>()
  const addedHandlers = new Set<AddedHandler>()

  const onEvent = vi.fn((eventType: string, handler: CheckedHandler | AddedHandler) => {
    if (eventType === 'homeScreenChecked') checkedHandlers.add(handler as CheckedHandler)
    if (eventType === 'homeScreenAdded') addedHandlers.add(handler as AddedHandler)
  })
  const offEvent = vi.fn((eventType: string, handler: CheckedHandler | AddedHandler) => {
    if (eventType === 'homeScreenChecked') checkedHandlers.delete(handler as CheckedHandler)
    if (eventType === 'homeScreenAdded') addedHandlers.delete(handler as AddedHandler)
  })

  const checkHomeScreenStatus = vi.fn((callback?: (value: TelegramHomeScreenStatus) => void) => {
    if (status !== null) callback?.(status)
  })

  const webApp = {
    initData: '',
    initDataUnsafe: {},
    colorScheme: 'dark',
    themeParams: {},
    BackButton: { isVisible: false, show() {}, hide() {}, onClick() {}, offClick() {} },
    ready() {},
    expand() {},
    setHeaderColor() {},
    setBackgroundColor() {},
    addToHomeScreen: vi.fn(),
    onEvent,
    offEvent,
    ...(supportsHomeScreen ? { checkHomeScreenStatus } : {}),
  }

  window.Telegram = { WebApp: webApp as unknown as NonNullable<typeof window.Telegram>['WebApp'] }

  return {
    addToHomeScreen: webApp.addToHomeScreen,
    checkHomeScreenStatus,
    onEvent,
    offEvent,
    emitAdded: () => addedHandlers.forEach((handler) => handler()),
    emitChecked: (value) => checkedHandlers.forEach((handler) => handler({ status: value })),
    activeListenerCount: () => checkedHandlers.size + addedHandlers.size,
  }
}

/** Прибирає Telegram — імітація відкриття у звичайному браузері. */
export function removeWebApp(): void {
  delete window.Telegram
}

const noopAsync = async () => {
  throw new Error('not used in tests')
}

export function buildUserContext(user: AuthUser | null): UserContextValue {
  return {
    user,
    status: user ? 'success' : 'loading',
    errorMessage: null,
    reload: () => {},
    updateProfile: noopAsync,
    submitRegistration: noopAsync,
  }
}

function buildEventsContext(): EventsContextValue {
  return {
    events: [],
    status: 'success',
    errorMessage: null,
    pendingEventId: null,
    scope: 'mine',
    setScope: () => {},
    reload: () => {},
    createEvent: noopAsync,
    updateEvent: noopAsync,
    deleteEvent: noopAsync,
    removeParticipant: noopAsync,
    joinEvent: noopAsync,
    leaveEvent: noopAsync,
    joinWaitlist: noopAsync,
    leaveWaitlist: noopAsync,
  }
}

function buildDormitoriesContext(): DormitoriesContextValue {
  return {
    dormitories: [],
    status: 'success',
    errorMessage: null,
    reload: () => {},
    getDormitoryName: () => '',
  }
}

/** Провайдери, яких вистачає і хуку, і повному рендеру HomePage. */
export function AppProviders({ user, children }: { user: AuthUser | null; children: ReactNode }) {
  return (
    <MemoryRouter>
      <UserContext.Provider value={buildUserContext(user)}>
        <EventsContext.Provider value={buildEventsContext()}>
          <DormitoriesContext.Provider value={buildDormitoriesContext()}>
            {children}
          </DormitoriesContext.Provider>
        </EventsContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>
  )
}

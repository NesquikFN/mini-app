import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { AddToHomeScreenBanner } from '../components/AddToHomeScreenBanner'
import { useHomeScreenShortcut } from './useHomeScreenShortcut'
import { HomePage } from '../pages/HomePage'
import {
  AppProviders,
  buildUser,
  installFakeWebApp,
  removeWebApp,
  type FakeWebApp,
  type InstallWebAppOptions,
} from '../test/harness'
import {
  DISMISS_DURATION_MS,
  VISITS_BEFORE_PROMPT,
  VISIT_THROTTLE_MS,
} from '../services/homeScreenPrompt'

// HomePage тягне мережеві виклики — у тестах вони не потрібні.
vi.mock('../services/api', () => ({
  fetchAppSettings: () => Promise.resolve({}),
  fetchQuickPlans: () => Promise.resolve([]),
  fetchActivePoll: () => Promise.resolve(null),
  getErrorMessage: () => 'error',
  createQuickPlanRequest: () => Promise.resolve(),
  deleteQuickPlanRequest: () => Promise.resolve(),
  joinQuickPlanRequest: () => Promise.resolve(),
  leaveQuickPlanRequest: () => Promise.resolve(),
  votePollRequest: () => Promise.resolve(),
  updateMyDormitory: () => Promise.resolve(),
}))

const BANNER = 'add-to-home-screen-banner'

/** Дрібний споживач хука — рівно те, що робить HomePage. */
function Harness() {
  const shortcut = useHomeScreenShortcut()
  return <AddToHomeScreenBanner {...shortcut} />
}

function renderHarness(options: InstallWebAppOptions = {}): FakeWebApp {
  const webApp = installFakeWebApp(options)
  render(
    <AppProviders user={buildUser()}>
      <Harness />
    </AppProviders>,
  )
  return webApp
}

function bannerVisible(): boolean {
  return screen.queryByTestId(BANNER) !== null
}

/** Доводить лічильник до n-го відвідування так само, як це робив би
 * користувач: кожне відкриття рознесене більш ніж на 6 годин. */
function seedVisits(count: number): void {
  const now = Date.now()
  localStorage.setItem('dormhub_home_visits_v1', String(count))
  localStorage.setItem('dormhub_home_last_visit_v1', String(now - VISIT_THROTTLE_MS - 1))
}

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

afterEach(() => {
  removeWebApp()
  vi.restoreAllMocks()
})

describe('коли банер з\'являється', () => {
  it('мовчить до третього окремого відвідування', () => {
    renderHarness({ status: 'missed' })
    expect(bannerVisible()).toBe(false)
    expect(localStorage.getItem('dormhub_home_visits_v1')).toBe('1')
  })

  it('показується саме на третьому відвідуванні', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ status: 'missed' })

    expect(localStorage.getItem('dormhub_home_visits_v1')).toBe(String(VISITS_BEFORE_PROMPT))
    expect(bannerVisible()).toBe(true)
  })

  it('не рахує повторне відкриття раніше ніж через 6 годин', () => {
    const now = Date.now()
    localStorage.setItem('dormhub_home_visits_v1', '2')
    localStorage.setItem('dormhub_home_last_visit_v1', String(now - 60_000))

    renderHarness({ status: 'missed' })

    // Лічильник не зрушив, отже і банер не з'явився — це саме той
    // випадок, що закриває reload сторінки.
    expect(localStorage.getItem('dormhub_home_visits_v1')).toBe('2')
    expect(bannerVisible()).toBe(false)
  })
})

describe('статуси Telegram', () => {
  it('unsupported — банера немає', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ status: 'unsupported' })
    expect(bannerVisible()).toBe(false)
  })

  it('added — банера немає, прапорець збережено', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ status: 'added' })

    expect(bannerVisible()).toBe(false)
    expect(localStorage.getItem('dormhub_home_screen_added_v1')).toBe('1')
  })

  it('missed — банер показується', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ status: 'missed' })
    expect(bannerVisible()).toBe(true)
  })

  it('unknown — показує один раз і не падає', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ status: 'unknown' })

    expect(bannerVisible()).toBe(true)
    expect(localStorage.getItem('dormhub_home_prompt_last_shown_v1')).not.toBeNull()
  })

  it('unknown — не показується вдруге, доки не мине пауза', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    localStorage.setItem('dormhub_home_prompt_last_shown_v1', String(Date.now() - 60_000))

    renderHarness({ status: 'unknown' })
    expect(bannerVisible()).toBe(false)
  })

  it('клієнт без методу взагалі — банера немає', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ supportsHomeScreen: false })
    expect(bannerVisible()).toBe(false)
  })

  it('клієнт до Bot API 8.0 — метод є, але кидає; банера немає і нічого не падає', () => {
    // Саме так поводиться справжній telegram-web-app.js: методи оголошені
    // завжди, а на версії нижче 8.0 кидають WebAppMethodUnsupported.
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    const webApp = renderHarness({ version: '7.10', status: 'missed' })

    expect(bannerVisible()).toBe(false)
    // Навіть не намагаємось питати — версію перевірено заздалегідь.
    expect(webApp.checkHomeScreenStatus).not.toHaveBeenCalled()
  })

  it('статус, що прийшов подією homeScreenChecked, теж враховується', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    // Клієнт мовчить у callback і відповідає лише подією.
    const webApp = renderHarness({ status: null })
    expect(bannerVisible()).toBe(false)

    act(() => webApp.emitChecked('missed'))
    expect(bannerVisible()).toBe(true)
  })
})

describe('додавання на головний екран', () => {
  it('не викликає addToHomeScreen автоматично', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    const webApp = renderHarness({ status: 'missed' })

    expect(bannerVisible()).toBe(true)
    expect(webApp.addToHomeScreen).not.toHaveBeenCalled()
  })

  it('викликає addToHomeScreen на тап «Додати»', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    const webApp = renderHarness({ status: 'missed' })

    act(() => screen.getByRole('button', { name: 'Додати' }).click())
    expect(webApp.addToHomeScreen).toHaveBeenCalledTimes(1)
  })

  it('не показує успіх, поки Telegram не надіслав homeScreenAdded', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ status: 'missed' })

    act(() => screen.getByRole('button', { name: 'Додати' }).click())

    expect(bannerVisible()).toBe(true)
    expect(screen.queryByText('DormHub додано на головний екран')).toBeNull()
    expect(localStorage.getItem('dormhub_home_screen_added_v1')).toBeNull()
  })

  it('homeScreenAdded ховає банер і показує toast', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    const webApp = renderHarness({ status: 'missed' })

    act(() => screen.getByRole('button', { name: 'Додати' }).click())
    act(() => webApp.emitAdded())

    expect(bannerVisible()).toBe(false)
    expect(screen.getByText('DormHub додано на головний екран')).toBeTruthy()
    expect(localStorage.getItem('dormhub_home_screen_added_v1')).toBe('1')
  })
})

describe('відмова', () => {
  it('«Не зараз» ховає банер одразу', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    renderHarness({ status: 'missed' })

    act(() => screen.getByRole('button', { name: 'Не зараз' }).click())

    expect(bannerVisible()).toBe(false)
    expect(localStorage.getItem('dormhub_home_prompt_dismissed_v1')).not.toBeNull()
  })

  it('тримає банер прихованим 30 днів і повертає після них', () => {
    const now = Date.now()

    seedVisits(VISITS_BEFORE_PROMPT)
    localStorage.setItem('dormhub_home_prompt_dismissed_v1', String(now - DISMISS_DURATION_MS + 60_000))
    renderHarness({ status: 'missed' })
    expect(bannerVisible()).toBe(false)

    removeWebApp()
    localStorage.setItem('dormhub_home_prompt_dismissed_v1', String(now - DISMISS_DURATION_MS - 60_000))
    seedVisits(VISITS_BEFORE_PROMPT)
    renderHarness({ status: 'missed' })
    expect(bannerVisible()).toBe(true)
  })
})

describe('середовище', () => {
  it('у звичайному браузері банер не показується', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    // Ключовий момент: поза Telegram window.Telegram.WebApp усе одно
    // існує — telegram-web-app.js підключено скриптом в index.html і він
    // рапортує version === '6.0'. Перевірено на живому деплої, тому
    // самої лише наявності об'єкта для гейта недостатньо.
    const webApp = renderHarness({ version: '6.0', status: 'missed' })

    expect(bannerVisible()).toBe(false)
    expect(webApp.checkHomeScreenStatus).not.toHaveBeenCalled()
    // Відвідування теж не рахуємо — лічильник має сенс лише там, де
    // пропозиція взагалі може з'явитись.
    expect(localStorage.getItem('dormhub_home_visits_v1')).toBe(String(VISITS_BEFORE_PROMPT - 1))
  })

  it('без Telegram SDK узагалі банер не показується', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    removeWebApp()

    render(
      <AppProviders user={buildUser()}>
        <Harness />
      </AppProviders>,
    )

    expect(bannerVisible()).toBe(false)
    expect(localStorage.getItem('dormhub_home_visits_v1')).toBe(String(VISITS_BEFORE_PROMPT - 1))
  })

  it('несхваленому користувачу банер не показується', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    installFakeWebApp({ status: 'missed' })

    render(
      <AppProviders user={buildUser({ registrationStatus: 'pending' })}>
        <Harness />
      </AppProviders>,
    )

    expect(bannerVisible()).toBe(false)
  })

  it('знімає обробники Telegram при unmount', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    const webApp = installFakeWebApp({ status: 'missed' })

    const { unmount } = render(
      <AppProviders user={buildUser()}>
        <Harness />
      </AppProviders>,
    )
    expect(webApp.activeListenerCount()).toBe(2)

    unmount()

    expect(webApp.activeListenerCount()).toBe(0)
    expect(webApp.offEvent).toHaveBeenCalledWith('homeScreenChecked', expect.any(Function))
    expect(webApp.offEvent).toHaveBeenCalledWith('homeScreenAdded', expect.any(Function))
  })
})

describe('пошкоджений localStorage', () => {
  it('сміття у ключах не ламає HomePage і не показує банер завчасно', () => {
    localStorage.setItem('dormhub_home_visits_v1', 'не число')
    localStorage.setItem('dormhub_home_last_visit_v1', '{}')
    localStorage.setItem('dormhub_home_prompt_dismissed_v1', 'NaN')
    localStorage.setItem('dormhub_home_screen_added_v1', 'можливо')
    installFakeWebApp({ status: 'missed' })

    render(
      <AppProviders user={buildUser()}>
        <HomePage />
      </AppProviders>,
    )

    // Сторінка відрендерилась, а зіпсований лічильник почався з нуля.
    expect(screen.getByText('Збирайся · грай · знайомся')).toBeTruthy()
    expect(bannerVisible()).toBe(false)
    expect(localStorage.getItem('dormhub_home_visits_v1')).toBe('1')
  })

  it('недоступний localStorage не ламає HomePage', () => {
    seedVisits(VISITS_BEFORE_PROMPT - 1)
    installFakeWebApp({ status: 'missed' })
    // Приватний режим у деяких WebView: кожне звернення кидає.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    render(
      <AppProviders user={buildUser()}>
        <HomePage />
      </AppProviders>,
    )

    expect(screen.getByText('Збирайся · грай · знайомся')).toBeTruthy()
  })
})

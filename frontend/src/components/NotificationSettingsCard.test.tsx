import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { NotificationSettingsCard } from './NotificationSettingsCard'
import type { PersonalNotificationSettings } from '../services/api'

const fetchMyNotificationSettings = vi.fn()
const updateMyNotificationSettings = vi.fn()

vi.mock('../services/api', () => ({
  fetchMyNotificationSettings: (...args: unknown[]) => fetchMyNotificationSettings(...args),
  updateMyNotificationSettings: (...args: unknown[]) => updateMyNotificationSettings(...args),
  getErrorMessage: () => 'Не вдалося зберегти.',
}))

function fakeSettings(overrides: Partial<PersonalNotificationSettings> = {}): PersonalNotificationSettings {
  return {
    newEventsEnabled: true,
    joinConfirmationEnabled: true,
    organizerJoinEnabled: true,
    ...overrides,
  }
}

afterEach(() => {
  fetchMyNotificationSettings.mockReset()
  updateMyNotificationSettings.mockReset()
  window.localStorage.clear()
})

describe('NotificationSettingsCard', () => {
  it('renders nothing until settings load from the backend', async () => {
    fetchMyNotificationSettings.mockResolvedValue(fakeSettings())
    const { container } = render(<NotificationSettingsCard />)
    await waitFor(() => expect(fetchMyNotificationSettings).toHaveBeenCalled())
    expect(container.innerHTML).not.toBe('')
  })

  it('shows all three toggles with Ukrainian labels', async () => {
    fetchMyNotificationSettings.mockResolvedValue(fakeSettings())
    render(<NotificationSettingsCard />)

    expect(await screen.findByText('Нові події')).toBeTruthy()
    expect(screen.getByText('Підтвердження участі')).toBeTruthy()
    expect(screen.getByText('Нові учасники моїх подій')).toBeTruthy()
  })

  it('saves immediately on toggle, never reading from localStorage as the source of truth', async () => {
    fetchMyNotificationSettings.mockResolvedValue(fakeSettings({ joinConfirmationEnabled: true }))
    updateMyNotificationSettings.mockResolvedValue(fakeSettings({ joinConfirmationEnabled: false }))
    render(<NotificationSettingsCard />)

    const button = (await screen.findByText('Підтвердження участі')).closest('button')
    await act(async () => {
      button?.click()
    })

    await waitFor(() =>
      expect(updateMyNotificationSettings).toHaveBeenCalledWith({ joinConfirmationEnabled: false }),
    )
    // Жодного читання/запису localStorage — лише виклик backend.
    expect(window.localStorage.length).toBe(0)
  })

  it('rolls back the optimistic toggle and shows an error when saving fails', async () => {
    fetchMyNotificationSettings.mockResolvedValue(fakeSettings({ organizerJoinEnabled: true }))
    updateMyNotificationSettings.mockRejectedValue(new Error('network down'))
    render(<NotificationSettingsCard />)

    const button = (await screen.findByText('Нові учасники моїх подій')).closest('button')
    await act(async () => {
      button?.click()
    })

    expect(await screen.findByText('Не вдалося зберегти.')).toBeTruthy()
  })

  it('re-fetches from the backend on every mount instead of trusting cached client state', async () => {
    fetchMyNotificationSettings.mockResolvedValue(fakeSettings({ newEventsEnabled: false }))
    render(<NotificationSettingsCard />)
    await waitFor(() => expect(fetchMyNotificationSettings).toHaveBeenCalledTimes(1))
  })
})

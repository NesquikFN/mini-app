import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { EventRatingSection } from './EventRatingSection'
import type { EventRatingSelfResponse } from '../types/eventRating'

const fetchMyEventRating = vi.fn()
const submitEventRating = vi.fn()

vi.mock('../services/api', () => ({
  fetchMyEventRating: (...args: unknown[]) => fetchMyEventRating(...args),
  submitEventRating: (...args: unknown[]) => submitEventRating(...args),
  getErrorMessage: () => 'Не вдалося оцінити подію.',
}))

afterEach(() => {
  fetchMyEventRating.mockReset()
  submitEventRating.mockReset()
})

function response(overrides: Partial<EventRatingSelfResponse> = {}): EventRatingSelfResponse {
  return { myRating: null, canRate: true, ...overrides }
}

describe('EventRatingSection', () => {
  it('renders nothing when the user cannot rate and has not rated', async () => {
    fetchMyEventRating.mockResolvedValue(response({ canRate: false, myRating: null }))
    const { container } = render(<EventRatingSection eventId="event-1" />)
    await waitFor(() => expect(fetchMyEventRating).toHaveBeenCalledWith('event-1'))
    expect(container.innerHTML).toBe('')
  })

  it('shows the five rating buttons for an eligible participant', async () => {
    fetchMyEventRating.mockResolvedValue(response())
    render(<EventRatingSection eventId="event-1" />)

    expect(await screen.findByText('Як пройшла подія?')).toBeTruthy()
    expect(screen.getByText('Чудово')).toBeTruthy()
    expect(screen.getByText('Погано')).toBeTruthy()
  })

  it('submits a rating with one tap and shows the thank-you state', async () => {
    fetchMyEventRating.mockResolvedValue(response())
    submitEventRating.mockResolvedValue(
      response({ myRating: { rating: 5, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }),
    )
    render(<EventRatingSection eventId="event-1" />)

    const button = (await screen.findByText('Чудово')).closest('button')
    await act(async () => {
      button?.click()
    })

    await waitFor(() => expect(submitEventRating).toHaveBeenCalledWith('event-1', 5, []))
    expect(await screen.findByText('Дякуємо за відгук')).toBeTruthy()
  })

  it('lets the user toggle optional tags after rating', async () => {
    fetchMyEventRating.mockResolvedValue(
      response({ myRating: { rating: 4, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }),
    )
    submitEventRating.mockResolvedValue(
      response({
        myRating: { rating: 4, tags: ['well_organized'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      }),
    )
    render(<EventRatingSection eventId="event-1" />)

    const tagButton = (await screen.findByText('Гарна організація')).closest('button')
    await act(async () => {
      tagButton?.click()
    })

    await waitFor(() => expect(submitEventRating).toHaveBeenCalledWith('event-1', 4, ['well_organized']))
  })

  it('shows a read-only summary once the edit window has closed', async () => {
    fetchMyEventRating.mockResolvedValue(
      response({
        canRate: false,
        myRating: { rating: 3, tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      }),
    )
    render(<EventRatingSection eventId="event-1" />)

    expect(await screen.findByText('Дякуємо за відгук')).toBeTruthy()
    const button = screen.getByText('Нормально').closest('button')
    expect(button).toHaveProperty('disabled', true)
  })

  it('shows an error without crashing when submitting fails', async () => {
    fetchMyEventRating.mockResolvedValue(response())
    submitEventRating.mockRejectedValue(new Error('network down'))
    render(<EventRatingSection eventId="event-1" />)

    const button = (await screen.findByText('Добре')).closest('button')
    await act(async () => {
      button?.click()
    })

    expect(await screen.findByText('Не вдалося оцінити подію.')).toBeTruthy()
    expect(screen.getByText('Як пройшла подія?')).toBeTruthy()
  })
})

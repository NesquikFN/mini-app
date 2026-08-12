import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { PollSection } from './PollSection'
import { setPendingPollId } from '../services/pollDeepLink'
import type { Poll } from '../types/poll'

const fetchActivePoll = vi.fn()
const votePollRequest = vi.fn()

vi.mock('../services/api', () => ({
  fetchActivePoll: (...args: unknown[]) => fetchActivePoll(...args),
  votePollRequest: (...args: unknown[]) => votePollRequest(...args),
  getErrorMessage: () => 'Не вдалося проголосувати.',
}))

function fakePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    // Навмисно не збігається з текстом заголовка секції ("Що
    // організувати наступним?"), інакше пошук по тексту в тестах
    // знаходив би два елементи.
    question: 'Що зіграти цієї суботи?',
    status: 'active',
    createdAt: new Date().toISOString(),
    options: [
      { id: 'opt-1', text: 'Мафія', position: 0, votes: 0, percentage: 0 },
      { id: 'opt-2', text: 'Футбол', position: 1, votes: 0, percentage: 0 },
    ],
    totalVotes: 0,
    ...overrides,
  }
}

afterEach(() => {
  fetchActivePoll.mockReset()
  votePollRequest.mockReset()
})

describe('PollSection', () => {
  it('renders nothing when there is no active poll', async () => {
    fetchActivePoll.mockResolvedValue(null)
    const { container } = render(<PollSection />)
    await waitFor(() => expect(fetchActivePoll).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })

  it('renders the active poll question and options', async () => {
    fetchActivePoll.mockResolvedValue(fakePoll())
    render(<PollSection />)

    expect(await screen.findByText('Що зіграти цієї суботи?')).toBeTruthy()
    expect(screen.getByText('Мафія')).toBeTruthy()
    expect(screen.getByText('Футбол')).toBeTruthy()
  })

  it('lets a user vote and shows updated results afterwards', async () => {
    fetchActivePoll.mockResolvedValue(fakePoll())
    votePollRequest.mockResolvedValue(
      fakePoll({
        myOptionId: 'opt-1',
        totalVotes: 1,
        options: [
          { id: 'opt-1', text: 'Мафія', position: 0, votes: 1, percentage: 100 },
          { id: 'opt-2', text: 'Футбол', position: 1, votes: 0, percentage: 0 },
        ],
      }),
    )
    render(<PollSection />)

    const optionButton = (await screen.findByText('Мафія')).closest('button')
    expect(optionButton).toBeTruthy()

    await act(async () => {
      optionButton?.click()
    })

    await waitFor(() => expect(votePollRequest).toHaveBeenCalledWith('poll-1', 'opt-1'))
    expect(await screen.findByText('100% · 1')).toBeTruthy()
  })

  it('shows an error message without crashing when the vote request fails', async () => {
    fetchActivePoll.mockResolvedValue(fakePoll())
    votePollRequest.mockRejectedValue(new Error('network down'))
    render(<PollSection />)

    const optionButton = (await screen.findByText('Мафія')).closest('button')
    await act(async () => {
      optionButton?.click()
    })

    expect(await screen.findByText('Не вдалося проголосувати.')).toBeTruthy()
    // Питання й варіанти лишаються на екрані — помилка голосування не ламає картку.
    expect(screen.getByText('Що організувати наступним?')).toBeTruthy()
  })

  it('does not crash and does not highlight when a deep link points at a poll other than the active one (finished/invalid link)', async () => {
    setPendingPollId('some-other-poll-id')
    fetchActivePoll.mockResolvedValue(fakePoll({ id: 'poll-1' }))
    render(<PollSection />)

    expect(await screen.findByText('Що зіграти цієї суботи?')).toBeTruthy()
    const card = document.getElementById('poll-poll-1')
    expect(card).toBeTruthy()
    expect(card?.className).not.toContain('accent-soft-bg')
  })

  it('highlights the poll card when the deep-link id matches the loaded active poll', async () => {
    setPendingPollId('poll-1')
    fetchActivePoll.mockResolvedValue(fakePoll({ id: 'poll-1' }))
    render(<PollSection />)

    await waitFor(() => {
      const card = document.getElementById('poll-poll-1')
      expect(card?.className).toContain('accent-soft-bg')
    })
  })
})

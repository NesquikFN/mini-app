import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OrganizerReputationCard } from './OrganizerReputationCard'
import type { OrganizerReputation } from '../types/eventRating'

function fakeReputation(overrides: Partial<OrganizerReputation> = {}): OrganizerReputation {
  return {
    ratingsCount: 0,
    completedEventsCount: 0,
    totalParticipantsInCompletedEvents: 0,
    topTags: [],
    isReliableOrganizer: false,
    ...overrides,
  }
}

describe('OrganizerReputationCard', () => {
  it('renders nothing for someone who has never completed an event', () => {
    const { container } = render(<OrganizerReputationCard reputation={fakeReputation()} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows "Ще недостатньо оцінок" below the 3-rating threshold', () => {
    render(
      <OrganizerReputationCard
        reputation={fakeReputation({ completedEventsCount: 2, ratingsCount: 2 })}
      />,
    )
    expect(screen.getByText('Ще недостатньо оцінок')).toBeTruthy()
  })

  it('shows the average, count, and completed events once there is enough data', () => {
    render(
      <OrganizerReputationCard
        reputation={fakeReputation({
          completedEventsCount: 7,
          ratingsCount: 24,
          averageRating: 4.8,
          totalParticipantsInCompletedEvents: 50,
          topTags: ['well_organized'],
        })}
      />,
    )

    expect(screen.getByText('4,8')).toBeTruthy()
    expect(screen.getByText(/24 оцінки/)).toBeTruthy()
    expect(screen.getByText(/Проведено 7 подій/)).toBeTruthy()
    expect(screen.getByText(/Учасників у проведених подіях: 50/)).toBeTruthy()
    expect(screen.getByText(/гарна організація/)).toBeTruthy()
  })

  it('never claims participants actually attended', () => {
    render(
      <OrganizerReputationCard
        reputation={fakeReputation({ completedEventsCount: 3, totalParticipantsInCompletedEvents: 12 })}
      />,
    )
    expect(screen.queryByText(/прийшло/i)).toBeNull()
  })
})

import type { Event } from '../types/event'
import { addDays, toISODate } from '../utils/date'

const events: Event[] = []
let nextId = 1

export type NewEvent = Omit<Event, 'id'>

export const eventsRepository = {
  findAll(): Event[] {
    return events
  },

  findById(id: string): Event | undefined {
    return events.find((event) => event.id === id)
  },

  insert(newEvent: NewEvent): Event {
    const event: Event = { ...newEvent, id: `event-${nextId++}` }
    events.push(event)
    return event
  },
}

function dateOffset(days: number): string {
  return toISODate(addDays(new Date(), days))
}

eventsRepository.insert({
  creatorId: 'user-2',
  title: 'Кіновечір',
  description: 'Дивимось разом новинку кінопрокату у кімнаті відпочинку.',
  date: dateOffset(0),
  time: '20:00',
  location: 'Кімната відпочинку',
  maxParticipants: 20,
  participantIds: ['user-2', 'user-3', 'user-4'],
  createdAt: new Date().toISOString(),
})

eventsRepository.insert({
  creatorId: 'user-1',
  title: 'Футбол',
  description: 'Товариський матч 5 на 5 на спортивному майданчику гуртожитку.',
  date: dateOffset(1),
  time: '18:00',
  location: 'Спортивний майданчик',
  maxParticipants: 16,
  participantIds: ['user-1', 'user-3'],
  createdAt: new Date().toISOString(),
})

eventsRepository.insert({
  creatorId: 'user-5',
  title: 'Турнір FIFA',
  description: 'Однокруговий турнір на PlayStation, лише 2 місця.',
  date: dateOffset(2),
  time: '17:00',
  location: 'Кімната відпочинку',
  maxParticipants: 2,
  participantIds: ['user-5', 'user-6'],
  createdAt: new Date().toISOString(),
})

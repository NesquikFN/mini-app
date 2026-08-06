import type { DormEvent, Participant } from '../types/event'
import type { User } from '../types/user'
import { addDays, toISODate } from '../utils/date'

export const currentUser: User = {
  id: 'user-1',
  name: 'Тимофій',
  username: 'tymofii',
}

export const participants: Participant[] = [
  { id: 'user-1', name: 'Тимофій', username: 'tymofii' },
  { id: 'user-2', name: 'Олена', username: 'olena_k' },
  { id: 'user-3', name: 'Максим', username: 'maxim_p' },
  { id: 'user-4', name: 'Софія' },
  { id: 'user-5', name: 'Андрій', username: 'andrii90' },
  { id: 'user-6', name: 'Ірина' },
  { id: 'user-7', name: 'Богдан', username: 'bodya' },
  { id: 'user-8', name: 'Марія' },
  { id: 'user-9', name: 'Віктор' },
  { id: 'user-10', name: 'Наталія', username: 'natalia_d' },
  { id: 'user-11', name: 'Дмитро' },
  { id: 'user-12', name: 'Юлія' },
  { id: 'user-13', name: 'Артем' },
  { id: 'user-14', name: 'Катерина' },
  { id: 'user-15', name: 'Олег' },
  { id: 'user-16', name: 'Христина' },
  { id: 'user-17', name: 'Ростислав' },
  { id: 'user-18', name: 'Вікторія' },
  { id: 'user-19', name: 'Павло' },
  { id: 'user-20', name: 'Аліна' },
]

export const participantsById: Record<string, Participant> = Object.fromEntries(
  participants.map((participant) => [participant.id, participant]),
)

function dateOffset(days: number): string {
  return toISODate(addDays(new Date(), days))
}

export const initialEvents: DormEvent[] = [
  {
    id: 'event-1',
    emoji: '🎬',
    title: 'Кіновечір',
    description:
      'Дивимось разом новинку кінопрокату у кімнаті відпочинку. Приносьте пледи та смаколики!',
    date: dateOffset(0),
    time: '20:00',
    location: 'Кімната відпочинку',
    maxParticipants: 20,
    creatorId: 'user-2',
    participantIds: [
      'user-2',
      'user-1',
      'user-3',
      'user-4',
      'user-5',
      'user-6',
      'user-7',
      'user-8',
      'user-9',
      'user-10',
      'user-11',
      'user-12',
    ],
  },
  {
    id: 'event-2',
    emoji: '⚽',
    title: 'Футбол',
    description:
      'Товариський матч 5 на 5 на спортивному майданчику гуртожитку.',
    date: dateOffset(1),
    time: '18:00',
    location: 'Спортивний майданчик',
    maxParticipants: 16,
    creatorId: 'user-1',
    participantIds: [
      'user-1',
      'user-2',
      'user-3',
      'user-4',
      'user-5',
      'user-6',
      'user-7',
      'user-8',
    ],
  },
  {
    id: 'event-3',
    emoji: '🎮',
    title: 'Турнір FIFA',
    description:
      'Однокруговий турнір на PlayStation. Реєстрація на місці, переможець отримує повагу гуртожитку.',
    date: dateOffset(2),
    time: '17:00',
    location: 'Кімната відпочинку',
    maxParticipants: 16,
    creatorId: 'user-6',
    participantIds: [
      'user-6',
      'user-2',
      'user-3',
      'user-4',
      'user-5',
      'user-7',
      'user-8',
      'user-9',
      'user-10',
      'user-11',
      'user-12',
      'user-13',
      'user-14',
      'user-15',
      'user-16',
      'user-17',
    ],
  },
  {
    id: 'event-4',
    emoji: '🎲',
    title: 'Вечір настільних ігор',
    description:
      'Монополія, Каркассон та інші настільні ігри. Своя гра — вітається.',
    date: dateOffset(4),
    time: '19:00',
    location: '2 поверх',
    maxParticipants: 12,
    creatorId: 'user-5',
    participantIds: [
      'user-5',
      'user-2',
      'user-3',
      'user-4',
      'user-6',
      'user-7',
    ],
  },
  {
    id: 'event-5',
    emoji: '🍕',
    title: 'Вечір піци',
    description: 'Замовляємо піцу на всіх та знайомимось із новими сусідами.',
    date: dateOffset(9),
    time: '20:00',
    location: 'Кухня',
    maxParticipants: 15,
    creatorId: 'user-1',
    participantIds: [
      'user-1',
      'user-2',
      'user-3',
      'user-4',
      'user-5',
      'user-6',
      'user-7',
      'user-8',
      'user-9',
    ],
  },
]

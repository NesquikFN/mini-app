export interface DormEvent {
  id: string
  creatorId: string
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  participants: string[]
  createdAt: string
  /** FK на dormitories.id — гуртожиток творця на момент створення. */
  dormitoryId: string
}

export interface CreateEventInput {
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
}

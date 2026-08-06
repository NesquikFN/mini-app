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
}

export interface CreateEventInput {
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
}

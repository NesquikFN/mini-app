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

export interface EventInput {
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
}

export type UpdateEventInput = Partial<EventInput>

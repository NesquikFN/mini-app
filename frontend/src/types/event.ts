export interface Participant {
  id: string
  name: string
  username?: string
}

export interface DormEvent {
  id: string
  emoji: string
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  participantIds: string[]
  creatorId: string
}

export interface CreateEventInput {
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
}

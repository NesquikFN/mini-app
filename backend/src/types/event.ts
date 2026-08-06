export interface Event {
  id: string
  creatorId: string
  title: string
  description: string
  date: string
  time: string
  location: string
  maxParticipants: number
  participantIds: string[]
  createdAt: string
}

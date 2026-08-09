export interface Event {
  id: string
  creatorId: string
  title: string
  description: string
  imageUrl?: string
  groupUrl?: string
  gameUrl?: string
  isOnline: boolean
  vipOnly: boolean
  date: string
  time: string
  location: string
  maxParticipants: number
  participantIds: string[]
  createdAt: string
  /** FK на dormitories.id — гуртожиток творця на момент створення. */
  dormitoryId: string
  sourceTemplateId?: string
}

export type PollStatus = 'draft' | 'active' | 'finished'

export type PollAudience = 'all' | 'subscribers'

export interface PollOptionResult {
  id: string
  text: string
  position: number
  votes: number
  percentage: number
}

export interface Poll {
  id: string
  question: string
  status: PollStatus
  endsAt?: string
  createdAt: string
  publishedAt?: string
  finishedAt?: string
  options: PollOptionResult[]
  totalVotes: number
  /** Варіант, який обрав поточний користувач — undefined, якщо ще не голосував. */
  myOptionId?: string
}

export interface AdminPoll extends Poll {
  lastBroadcastAt?: string
  lastBroadcastAudience?: PollAudience
}

export interface PollBroadcastReport {
  audience: PollAudience
  targeted: number
  sent: number
  failed: number
  skipped: number
}

export const POLL_AUDIENCE_LABELS: Record<PollAudience, string> = {
  all: 'Усім користувачам',
  subscribers: 'Тільки підписникам сповіщень',
}

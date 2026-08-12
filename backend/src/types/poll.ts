export type PollStatus = 'draft' | 'active' | 'finished'

export type PollAudience = 'all' | 'subscribers'

export interface PollOptionResult {
  id: string
  text: string
  position: number
  votes: number
  percentage: number
}

/** Форма, що йде і звичайному користувачу (GET /polls/active), і
 * адміну (GET /admin/polls) — адмінський шар лише додає lastBroadcast*. */
export interface PollResponse {
  id: string
  question: string
  status: PollStatus
  endsAt?: string
  createdAt: string
  publishedAt?: string
  finishedAt?: string
  options: PollOptionResult[]
  totalVotes: number
  /** Варіант, який обрав саме цей глядач — undefined, якщо ще не голосував. */
  myOptionId?: string
}

export interface AdminPollResponse extends PollResponse {
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

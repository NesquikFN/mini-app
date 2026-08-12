import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchActivePoll, getErrorMessage, votePollRequest } from '../services/api'
import type { Poll } from '../types/poll'

export type PollStatus = 'loading' | 'success' | 'error'

const REFRESH_INTERVAL_MS = 15_000

/**
 * Єдине активне опитування з тихим автооновленням — той самий патерн, що
 * й useQuickPlans: фонове оновлення ніколи не показує скелетон і не
 * зачіпає статус, тож картка не "стрибає" під пальцем, поки хтось голосує.
 */
export function usePoll() {
  const [poll, setPoll] = useState<Poll | null>(null)
  const [status, setStatus] = useState<PollStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const requestId = useRef(0)
  const pollRef = useRef<Poll | null>(null)

  const load = useCallback((silent = false) => {
    const currentRequest = ++requestId.current
    fetchActivePoll()
      .then((data) => {
        if (currentRequest !== requestId.current) return
        pollRef.current = data
        setPoll(data)
        setStatus('success')
        setErrorMessage(null)
      })
      .catch((error: unknown) => {
        if (currentRequest !== requestId.current || silent) return
        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      })
  }, [])

  useEffect(() => {
    load()

    const refresh = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      requestId.current += 1
    }
  }, [load])

  const reload = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    load()
  }, [load])

  const vote = useCallback(async (optionId: string) => {
    const current = pollRef.current
    // Повторне натискання на вже обраний варіант нічого не змінює на
    // сервері — не варто зайвого запиту заради no-op.
    if (!current || current.myOptionId === optionId) return

    setVoting(true)
    setVoteError(null)
    try {
      const updated = await votePollRequest(current.id, optionId)
      pollRef.current = updated
      setPoll(updated)
    } catch (error) {
      setVoteError(getErrorMessage(error))
    } finally {
      setVoting(false)
    }
  }, [])

  return { poll, status, errorMessage, voteError, voting, reload, vote }
}

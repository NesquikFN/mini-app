import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createQuickPlanRequest,
  deleteQuickPlanRequest,
  fetchQuickPlans,
  getErrorMessage,
  joinQuickPlanRequest,
  leaveQuickPlanRequest,
} from '../services/api'
import type { CreateQuickPlanInput, QuickPlan } from '../types/quickPlan'

export type QuickPlansStatus = 'loading' | 'success' | 'error'

const REFRESH_INTERVAL_MS = 10_000

/**
 * Швидкі плани з тихим автооновленням раз на 10 секунд.
 *
 * Той самий надійний патерн, що й оновлення учасників на сторінці події:
 *  - `requestId` відсікає відповідь застарілого запиту, якщо новіший уже
 *    повернувся (інакше повільна стара відповідь перезаписала б свіжий
 *    стан після join/leave);
 *  - фонове оновлення `silent` ніколи не показує скелетон і не чіпає
 *    статус, тож список не «стрибає» під пальцем;
 *  - інтервал працює лише коли Mini App видимий, плюс негайне оновлення
 *    одразу після повернення користувача у застосунок.
 */
export function useQuickPlans() {
  const [plans, setPlans] = useState<QuickPlan[]>([])
  const [status, setStatus] = useState<QuickPlansStatus>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const requestId = useRef(0)

  const load = useCallback((silent = false) => {
    const currentRequest = ++requestId.current
    fetchQuickPlans()
      .then((data) => {
        if (currentRequest !== requestId.current) return
        setPlans(data)
        setStatus('success')
        setErrorMessage(null)
      })
      .catch((error: unknown) => {
        // Невдале фонове оновлення лишає на екрані попередній список —
        // показувати помилку замість робочих даних тут було б гірше.
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
      // Скасовує ще незавершені запити цього монтування, щоб їхні
      // відповіді не намагались оновити вже розмонтований стан.
      requestId.current += 1
    }
  }, [load])

  const reload = useCallback(() => {
    setStatus('loading')
    setErrorMessage(null)
    load()
  }, [load])

  /** Точкова заміна одного плану у списку — після join/leave не треба
   * перезапитувати весь список, сервер повернув уже оновлений план. */
  const replacePlan = useCallback((plan: QuickPlan) => {
    setPlans((prev) => prev.map((item) => (item.id === plan.id ? plan : item)))
  }, [])

  const createPlan = useCallback(async (input: CreateQuickPlanInput) => {
    const plan = await createQuickPlanRequest(input)
    setPlans((prev) => [plan, ...prev])
    return plan
  }, [])

  const deletePlan = useCallback(async (planId: string) => {
    setPendingPlanId(planId)
    try {
      await deleteQuickPlanRequest(planId)
      setPlans((prev) => prev.filter((item) => item.id !== planId))
    } finally {
      setPendingPlanId(null)
    }
  }, [])

  const joinPlan = useCallback(async (planId: string) => {
    setPendingPlanId(planId)
    try {
      replacePlan(await joinQuickPlanRequest(planId))
    } finally {
      setPendingPlanId(null)
    }
  }, [replacePlan])

  const leavePlan = useCallback(async (planId: string) => {
    setPendingPlanId(planId)
    try {
      replacePlan(await leaveQuickPlanRequest(planId))
    } finally {
      setPendingPlanId(null)
    }
  }, [replacePlan])

  return {
    plans,
    status,
    errorMessage,
    pendingPlanId,
    reload,
    createPlan,
    deletePlan,
    joinPlan,
    leavePlan,
  }
}

import { useContext } from 'react'
import { EventsContext } from '../context/EventsContext'

export function useEvents() {
  const ctx = useContext(EventsContext)
  if (!ctx) {
    throw new Error('useEvents must be used within EventsProvider')
  }
  return ctx
}

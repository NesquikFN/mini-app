import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { EventsProvider } from './context/EventsProvider'
import { UserProvider } from './context/UserProvider'
import { DormitoriesProvider } from './context/DormitoriesProvider'
import { AdminStatusProvider } from './context/AdminStatusProvider'
import { AdminGuard } from './layouts/AdminGuard'
import { DormitoryGate } from './layouts/DormitoryGate'
import { MainLayout } from './layouts/MainLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { HomePage } from './pages/HomePage'
import { EventsPage } from './pages/EventsPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { CreateEventPage } from './pages/CreateEventPage'
import { EditEventPage } from './pages/EditEventPage'
import { ProfilePage } from './pages/ProfilePage'
import { UserProfilePage } from './pages/UserProfilePage'
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { AdminUserDetailPage } from './pages/admin/AdminUserDetailPage'
import { AdminEventsPage } from './pages/admin/AdminEventsPage'
import { AdminEventDetailPage } from './pages/admin/AdminEventDetailPage'
import { AdminAdminsPage } from './pages/admin/AdminAdminsPage'
import { AdminHostsPage } from './pages/admin/AdminHostsPage'
import { AdminBannedUsersPage } from './pages/admin/AdminBannedUsersPage'
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage'
import { AdminNotificationLogPage } from './pages/admin/AdminNotificationLogPage'
import { EventTemplatesPage } from './pages/EventTemplatesPage'
import { getTelegramStartParam, getTelegramWebApp } from './services/telegram'

// TEMPORARY — chasing the "stuck on event page after deep-link entry" bug.
// Computed once, synchronously, at module load — *not* inside an effect,
// so both StartAppRedirect and DeepLinkDebugOverlay see the same answer
// from their very first render (an effect-set flag would arrive too late
// for the overlay's own first-render useState initializer to see it).
// Remove this and both components together once the real cause is found.
const deepLinkEventId = getTelegramStartParam()?.match(/^event_([0-9a-fA-F-]{36})$/)?.[1]

/** Jumps straight to an event when the Mini App was opened via the
 * "🎉 Приєднатися" button on a group announcement (a t.me/<bot>?startapp=
 * deep link) — see sendEventAnnouncement in the backend. */
function StartAppRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!deepLinkEventId) return

    // NOT { replace: true } — confirmed via on-device debug logging that
    // subsequent <Link>/<NavLink> taps land on the correct element and
    // fire pointerdown/pointerup/click in full, yet never navigate,
    // specifically (and only) on this deep-link path. Replacing the
    // initial history entry leaves the WebView with no "back" target;
    // some Telegram clients' own anchor-click handling appears to swallow
    // in-app <a> navigation in that state. Pushing a normal entry instead
    // (same as every other in-app link click) avoids it.
    navigate(`/events/${deepLinkEventId}`)
    getTelegramWebApp()?.expand()
  }, [navigate])

  return null
}

/** TEMPORARY diagnostic overlay — only ever renders on the exact deep-link
 * path that's reportedly getting stuck. pointerEvents: 'none' so it can
 * never itself be the thing eating a tap. Logs where taps actually land
 * (or don't) so we have real data instead of guessing blind — take a
 * screenshot and send it over, then this whole component gets deleted. */
function DeepLinkDebugOverlay() {
  const visible = Boolean(deepLinkEventId)
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    if (!visible) return

    function record(entry: string) {
      setLog((prev) => [...prev.slice(-13), entry])
    }

    function onPointer(event: Event) {
      const target = event.target as HTMLElement | null
      const label = target ? `${target.tagName}${target.className ? '.' + String(target.className).slice(0, 24) : ''}` : 'null'
      let coords = ''
      if (event instanceof MouseEvent) coords = `${Math.round(event.clientX)},${Math.round(event.clientY)}`
      else if (event instanceof TouchEvent) {
        const t = event.touches[0] ?? event.changedTouches[0]
        if (t) coords = `${Math.round(t.clientX)},${Math.round(t.clientY)}`
      }
      record(`${event.type} @${coords} -> ${label}`)
    }

    const types = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']
    types.forEach((type) => window.addEventListener(type, onPointer, { capture: true }))

    function onVisibility() {
      record(`visibilitychange -> ${document.visibilityState}, hasFocus=${document.hasFocus()}`)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      types.forEach((type) => window.removeEventListener(type, onPointer, { capture: true }))
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [visible])

  if (!visible) return null

  const webApp = getTelegramWebApp()

  return (
    <div
      style={{
        position: 'fixed',
        left: 4,
        right: 4,
        bottom: 64,
        zIndex: 999999,
        maxHeight: '45vh',
        overflow: 'auto',
        pointerEvents: 'none',
        background: 'rgba(0,0,0,0.88)',
        color: '#7CFC00',
        fontFamily: 'monospace',
        fontSize: 10,
        lineHeight: 1.4,
        padding: 8,
        borderRadius: 8,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      <div>window: {window.innerWidth}x{window.innerHeight} dpr={window.devicePixelRatio}</div>
      <div>
        tg: expanded={String(webApp?.isExpanded)} vh={webApp?.viewportHeight} stable={webApp?.viewportStableHeight}
      </div>
      <div>tg: platform={webApp?.platform} version={webApp?.version}</div>
      <div>--- events ---</div>
      {log.length === 0 && <div>(waiting for taps…)</div>}
      {log.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AdminStatusProvider>
        <UserProvider>
          <DormitoriesProvider>
            <EventsProvider>
              <BrowserRouter>
                <StartAppRedirect />
                <DeepLinkDebugOverlay />
                <Routes>
                  <Route element={<DormitoryGate />}>
                    <Route element={<MainLayout />}>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/events" element={<EventsPage />} />
                      <Route path="/events/:id" element={<EventDetailPage />} />
                      <Route path="/events/:id/edit" element={<EditEventPage />} />
                      <Route path="/create" element={<CreateEventPage />} />
                      <Route path="/templates" element={<EventTemplatesPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/users/:id" element={<UserProfilePage />} />
                    </Route>
                  </Route>

                  <Route element={<AdminGuard />}>
                    <Route element={<AdminLayout />}>
                      <Route path="/admin" element={<AdminOverviewPage />} />
                      <Route path="/admin/users" element={<AdminUsersPage />} />
                      <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
                      <Route path="/admin/events" element={<AdminEventsPage />} />
                      <Route path="/admin/events/:id" element={<AdminEventDetailPage />} />
                      <Route path="/admin/admins" element={<AdminAdminsPage />} />
                      <Route path="/admin/hosts" element={<AdminHostsPage />} />
                      <Route path="/admin/banned" element={<AdminBannedUsersPage />} />
                      <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
                      <Route path="/admin/notification-log" element={<AdminNotificationLogPage />} />
                    </Route>
                  </Route>
                </Routes>
              </BrowserRouter>
            </EventsProvider>
          </DormitoriesProvider>
        </UserProvider>
      </AdminStatusProvider>
    </AuthProvider>
  )
}

export default App

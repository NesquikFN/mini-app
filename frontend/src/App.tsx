import { useEffect, useRef } from 'react'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { EventsProvider } from './context/EventsProvider'
import { UserProvider } from './context/UserProvider'
import { DormitoriesProvider } from './context/DormitoriesProvider'
import { AdminStatusProvider } from './context/AdminStatusProvider'
import { AdminGuard } from './layouts/AdminGuard'
import { RegistrationGate } from './layouts/RegistrationGate'
import { DormitoryGate } from './layouts/DormitoryGate'
import { MainLayout } from './layouts/MainLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { HomePage } from './pages/HomePage'
import { EventsPage } from './pages/EventsPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { CreateEventPage } from './pages/CreateEventPage'
import { EditEventPage } from './pages/EditEventPage'
import { ProfilePage } from './pages/ProfilePage'
import { EditProfilePage } from './pages/EditProfilePage'
import { UserProfilePage } from './pages/UserProfilePage'
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { AdminUserDetailPage } from './pages/admin/AdminUserDetailPage'
import { AdminEventsPage } from './pages/admin/AdminEventsPage'
import { AdminEventDetailPage } from './pages/admin/AdminEventDetailPage'
import { AdminAdminsPage } from './pages/admin/AdminAdminsPage'
import { AdminHostsPage } from './pages/admin/AdminHostsPage'
import { AdminVipsPage } from './pages/admin/AdminVipsPage'
import { AdminGpusPage } from './pages/admin/AdminGpusPage'
import { AdminBannedUsersPage } from './pages/admin/AdminBannedUsersPage'
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage'
import { AdminNotificationLogPage } from './pages/admin/AdminNotificationLogPage'
import { AdminRegistrationsPage } from './pages/admin/AdminRegistrationsPage'
import { AdminRegistrationDetailPage } from './pages/admin/AdminRegistrationDetailPage'
import { EventTemplatesPage } from './pages/EventTemplatesPage'
import { getTelegramStartParam, getTelegramWebApp } from './services/telegram'

/** Jumps straight to an event when the Mini App was opened via the
 * "🎉 Приєднатися" button on a group announcement (a t.me/<bot>?startapp=
 * deep link) — see sendEventAnnouncement in the backend. */
function StartAppRedirect() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    // In BrowserRouter the navigate function may change identity after a
    // route transition. The Telegram start_param stays present for the
    // whole Mini App session, so without this guard every later navigation
    // can send the user back to the originally linked event.
    if (handled.current) return
    handled.current = true

    const match = getTelegramStartParam()?.match(/^event_([0-9a-fA-F-]{36})$/)
    if (!match) return

    navigate(`/events/${match[1]}`)
    getTelegramWebApp()?.expand()
  }, [navigate])

  return null
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
                <Routes>
                  <Route element={<RegistrationGate />}>
                    <Route element={<DormitoryGate />}>
                      <Route element={<MainLayout />}>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/events" element={<EventsPage />} />
                        <Route path="/events/:id" element={<EventDetailPage />} />
                        <Route path="/events/:id/edit" element={<EditEventPage />} />
                        <Route path="/create" element={<CreateEventPage />} />
                        <Route path="/templates" element={<EventTemplatesPage />} />
                        <Route path="/profile" element={<ProfilePage />} />
                        <Route path="/profile/edit" element={<EditProfilePage />} />
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
                        <Route path="/admin/vips" element={<AdminVipsPage />} />
                        <Route path="/admin/gpus" element={<AdminGpusPage />} />
                        <Route path="/admin/banned" element={<AdminBannedUsersPage />} />
                        <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
                        <Route path="/admin/notification-log" element={<AdminNotificationLogPage />} />
                        <Route path="/admin/registrations" element={<AdminRegistrationsPage />} />
                        <Route path="/admin/registrations/:userId" element={<AdminRegistrationDetailPage />} />
                      </Route>
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

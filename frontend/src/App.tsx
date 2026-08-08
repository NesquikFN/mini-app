import { useEffect } from 'react'
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
import { getTelegramStartParam } from './services/telegram'

/** Jumps straight to an event when the Mini App was opened via the
 * "🎉 Приєднатися" button on a group announcement (a t.me/<bot>?startapp=
 * deep link) — see sendEventAnnouncement in the backend. */
function StartAppRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const match = getTelegramStartParam()?.match(/^event_([0-9a-fA-F-]{36})$/)
    if (match) navigate(`/events/${match[1]}`, { replace: true })
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

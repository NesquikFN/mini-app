import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { AdminLayout } from './layouts/AdminLayout'
import { DashboardPage } from './pages/DashboardPage'
import { UsersPage } from './pages/UsersPage'
import { EventsPage } from './pages/EventsPage'
import { CreateEventPage } from './pages/CreateEventPage'
import { EventDetailPage } from './pages/EventDetailPage'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/new" element={<CreateEventPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

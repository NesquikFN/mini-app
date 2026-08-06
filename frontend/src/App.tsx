import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { EventsProvider } from './context/EventsProvider'
import { UserProvider } from './context/UserProvider'
import { MainLayout } from './layouts/MainLayout'
import { HomePage } from './pages/HomePage'
import { EventsPage } from './pages/EventsPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { CreateEventPage } from './pages/CreateEventPage'
import { ProfilePage } from './pages/ProfilePage'

function App() {
  return (
    <UserProvider>
      <EventsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/create" element={<CreateEventPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </EventsProvider>
    </UserProvider>
  )
}

export default App

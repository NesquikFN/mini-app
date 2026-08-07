import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// This app has never registered a Service Worker or used the Cache API —
// but earlier, unrelated experimentation on this same origin (before this
// build existed) may have left one behind, and once registered a Service
// Worker keeps intercepting every future load and serving whatever it
// cached, completely independent of what the server now returns; a plain
// page reload does not undo this. Unconditionally unregistering on every
// load is a safe no-op when nothing is registered, and permanently closes
// off "stuck on an old cached build" as a source of confusion.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister())
  })
}
if ('caches' in window) {
  caches.keys().then((keys) => {
    keys.forEach((key) => caches.delete(key))
  })
}

// import.meta.env.DEV is statically false in production builds, so
// this branch is dead code there; the dynamic import is also
// code-split into its own chunk that a dead branch never fetches — the
// dev motion preview cannot reach real users regardless of query params.
const SplashMotionPreview = lazy(() =>
  import('./dev/SplashMotionPreview.tsx').then((m) => ({ default: m.SplashMotionPreview })),
)

const isSplashPreview =
  import.meta.env.DEV && new URLSearchParams(location.search).has('splashPreview')

const rootElement = isSplashPreview ? (
  <Suspense fallback={null}>
    <SplashMotionPreview />
  </Suspense>
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(<StrictMode>{rootElement}</StrictMode>)

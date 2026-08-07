import { useEffect, useRef, useState } from 'react'
import { SplashVisual } from './splash/SplashVisual'
import { SplashTimeline, type SplashRefs } from './splash/splashTimeline'
import {
  HOUSE_PATHS,
  HUB_BADGE_RECT,
  HUB_TEXT,
  LOGO_H,
  LOGO_W,
  ORM_TEXT,
  STROKE,
  STROKE_WIDTH,
  VIEWBOX_H,
  VIEWBOX_W,
  WORDMARK_FONT,
} from './splash/geometry'

type AppState = 'loading' | 'ready' | 'error'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

const REDUCED_MOTION_FADE_MS = 260
const DEBUG = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
function log(id: string, ...args: unknown[]) {
  if (!DEBUG) return

  console.log(`[SplashScreen#${id}]`, ...args)
}

/**
 * Cold-start splash screen. See src/components/splash/splashTimeline.ts
 * for the actual motion — this component's only job is to mount the
 * shared visual DOM, own exactly one SplashTimeline instance for its
 * lifetime (never in React state — a plain `useRef`, so it survives
 * re-renders untouched), and translate `appState` into the timeline's
 * `requestFinish()` call.
 *
 * `appState` is the one and only real readiness signal (see
 * AuthProvider.tsx) — nothing here ever completes on a fixed timer;
 * `requestFinish()` only unlocks a fixed, pre-choreographed animation
 * script that was already going to play once triggered. Two
 * independent readiness flags gate that call:
 *   - `visualReady` — SVG refs exist, path lengths measured, initial
 *     styles committed, and at least one paint has happened since.
 *   - `appReady`    — `appState` has left 'loading'.
 * If `appReady` arrives before `visualReady` (a real possibility on a
 * fast local network), the request is only *remembered*, not acted on,
 * until `visualReady` catches up — see `pendingFinishRef` below.
 */
export function SplashScreen({
  appState,
  onFinished,
}: {
  appState: AppState
  onFinished: () => void
}) {
  const [reducedMotion] = useState(() => prefersReducedMotion())
  // Stable for the component's whole lifetime — used to correlate every
  // lifecycle log line (mount/unmount/refs-ready/appReady/finish/...)
  // under one id, so a second id appearing mid-sequence in the console
  // is unambiguous proof of a remount.
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 8))
  const timelineRef = useRef<SplashTimeline | null>(null)
  const finishedRef = useRef(false)
  const appStateRef = useRef(appState)
  const visualReadyRef = useRef(false)
  const pendingFinishRef = useRef<{ requested: boolean; isError: boolean }>({
    requested: false,
    isError: false,
  })

  useEffect(() => {
    log(instanceId, 'SplashScreen mount', { appState })
    return () => {
      log(instanceId, 'SplashScreen unmount')
    }
    // instanceId is stable; appState intentionally not a dep — this
    // fires exactly once per real mount, logging whatever appState
    // happened to be at that instant is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function maybeRequestFinish() {
    if (!visualReadyRef.current) return
    if (!pendingFinishRef.current.requested) return
    timelineRef.current?.requestFinish(pendingFinishRef.current.isError)
  }

  useEffect(() => {
    appStateRef.current = appState
    if (appState === 'loading') return
    log(instanceId, 'appReady received', { isError: appState === 'error', visualReady: visualReadyRef.current })
    pendingFinishRef.current = { requested: true, isError: appState === 'error' }
    if (!reducedMotion) maybeRequestFinish()
    // maybeRequestFinish reads refs only, stable across renders — not
    // included as a dep to avoid re-running this on unrelated renders.

  }, [appState, instanceId, reducedMotion])

  const handleRefsReady = (refs: SplashRefs) => {
    if (reducedMotion) return
    // Guards against StrictMode's mount->cleanup->mount double-invoke
    // calling this twice for the *same* live mount — the cleanup
    // effect below nulls timelineRef back out on a real unmount, so a
    // genuine remount still gets a fresh, working timeline.
    if (timelineRef.current) return
    log(instanceId, 'SVG refs ready')
    const timeline = new SplashTimeline(
      refs,
      () => {
        if (finishedRef.current) return
        finishedRef.current = true
        onFinished()
      },
      instanceId,
    )
    timelineRef.current = timeline
    if (DEBUG) {
      // Diagnostic-only escape hatch so a real production lifecycle run
      // can be slowed down from the console for screenshot verification
      // (e.g. `__splashTimeline.setRate(0.1)`) without adding any new
      // behavior to the component itself. Never referenced by app code.
      ;(window as unknown as { __splashTimeline?: SplashTimeline }).__splashTimeline = timeline
    }
    timeline.start()
    // One more frame so the browser has fully committed the initial
    // (hidden, fully-undrawn) styles the constructor just set
    // synchronously, *then* reveal the root and mark visualReady —
    // satisfies "at least one requestAnimationFrame after the initial
    // styles are applied" before anything is shown or the finish
    // sequence is allowed to start.
    requestAnimationFrame(() => {
      refs.root.style.visibility = 'visible'
      visualReadyRef.current = true
      log(instanceId, 'visualReady')
      if (appStateRef.current !== 'loading') {
        pendingFinishRef.current = { requested: true, isError: appStateRef.current === 'error' }
      }
      maybeRequestFinish()
    })
  }

  useEffect(() => {
    return () => {
      // Root cause of a StrictMode-era bug found in the dev preview:
      // without resetting this to null, a mount->cleanup->mount
      // simulation destroys the timeline here, then the *next* mount's
      // handleRefsReady hits the guard above (still non-null, just
      // dead) and returns early — every signal ends up wired to a
      // cancelled instance whose tick() no-ops forever. This must
      // stay paired with the guard in handleRefsReady.
      timelineRef.current?.destroy()
      timelineRef.current = null
    }
  }, [])

  // Reduced motion bypasses the timeline engine entirely: no bounce, no
  // draw — hold a fully-assembled static mark until appReady, then a
  // short fade. Still gated on the real appState, never a fixed timer.
  const reducedFinishedRef = useRef(false)
  useEffect(() => {
    if (!reducedMotion) return
    if (appState === 'loading') return
    const timer = setTimeout(() => {
      if (reducedFinishedRef.current) return
      reducedFinishedRef.current = true
      onFinished()
    }, REDUCED_MOTION_FADE_MS)
    return () => clearTimeout(timer)
  }, [appState, reducedMotion, onFinished])

  if (reducedMotion) {
    return <ReducedMotionSplash exiting={appState !== 'loading'} />
  }

  return <SplashVisual onRefsReady={handleRefsReady} />
}

function ReducedMotionSplash({ exiting }: { exiting: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{
        opacity: exiting ? 0 : 1,
        transition: `opacity ${REDUCED_MOTION_FADE_MS}ms ease`,
      }}
      role="status"
      aria-label="DormHub завантажується"
    >
      <StaticMark />
    </div>
  )
}

function StaticMark() {
  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} width={LOGO_W} height={LOGO_H} fill="none">
      <g fill="none" stroke={STROKE} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
        <path d={HOUSE_PATHS.outerD} />
        <path d={HOUSE_PATHS.roof} />
        <path d={HOUSE_PATHS.leftWall} />
        <path d={HOUSE_PATHS.innerDetail} />
      </g>
      <text
        x={ORM_TEXT.x}
        y={ORM_TEXT.y}
        fill="#FFFFFF"
        fontFamily={WORDMARK_FONT}
        fontSize={ORM_TEXT.fontSize}
        fontWeight={700}
        letterSpacing={ORM_TEXT.letterSpacing}
      >
        orm
      </text>
      <rect
        x={HUB_BADGE_RECT.x}
        y={HUB_BADGE_RECT.y}
        width={HUB_BADGE_RECT.width}
        height={HUB_BADGE_RECT.height}
        rx={HUB_BADGE_RECT.rx}
        fill={STROKE}
      />
      <text
        x={HUB_TEXT.x}
        y={HUB_TEXT.y}
        fill="#000000"
        stroke="#000000"
        strokeWidth={1.5}
        paintOrder="stroke fill"
        fontFamily={WORDMARK_FONT}
        fontSize={HUB_TEXT.fontSize}
        fontWeight={700}
        letterSpacing={HUB_TEXT.letterSpacing}
      >
        Hub
      </text>
    </svg>
  )
}

import { useCallback, useEffect, useRef, useState, type TransitionEvent } from 'react'

/**
 * Cold-start splash screen. Driven entirely by `appState`, never by a
 * fixed timer for the loading portion — see AuthProvider.tsx for how
 * `appState` maps onto the real Telegram-auth request lifecycle.
 *
 *   loop            — infinite bounce, exactly as long as appState==='loading'
 *   final-hop        — one closing (smaller) hop once appState flips
 *   draw             — logo strokes drawn from the landing point outward
 *   reveal-orm/hub   — wordmark reveal
 *   hold             — brief pause on the completed mark
 *   exit             — opacity fade, then onFinished() unmounts us
 *
 * The setTimeout calls below only sequence an already-decided, fixed
 * animation script (durations named in the task spec) — they never
 * gate on or approximate real loading time, which is solely driven by
 * `appState` transitioning away from 'loading'.
 */

type AppState = 'loading' | 'ready' | 'error'
type Phase =
  | 'loop'
  | 'final-hop'
  | 'draw'
  | 'reveal-orm'
  | 'reveal-hub'
  | 'hold'
  | 'exit'

const FINAL_HOP_MS = 420
const DRAW_MS = 500
const ORM_REVEAL_MS = 260
const HUB_REVEAL_MS = 220
const HOLD_MS = 380
const FADE_MS = 300
const ERROR_FADE_DELAY_MS = 120

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function SplashScreen({
  appState,
  onFinished,
}: {
  appState: AppState
  onFinished: () => void
}) {
  // Lazy useState initializer, not useRef — reading `.current` during
  // render is unsafe under React's concurrent rendering (react-hooks/refs).
  const [reducedMotion] = useState(() => prefersReducedMotion())
  const [phase, setPhase] = useState<Phase>('loop')
  // Kept in sync via an effect (not a plain render-body assignment —
  // react-hooks/refs disallows writing during render too) purely so
  // handleLoopIteration can read the *latest* appState without the CSS
  // loop animation retargeting every time appState changes.
  const appStateRef = useRef(appState)
  useEffect(() => {
    appStateRef.current = appState
  }, [appState])
  const finishStarted = useRef(false)
  // Once the mark has started drawing, it (and the wordmark) must stay
  // visible through the 'exit' fade instead of vanishing the instant we
  // leave 'hold' — otherwise the fade-out would fade an empty screen.
  // Stays false on the error path (phase goes straight to 'exit'
  // without ever drawing), so a failed load never flashes the logo.
  // Set from inside the setTimeout callback below (not synchronously in
  // an effect body — react-hooks/set-state-in-effect), right where the
  // transition into 'draw' actually happens.
  const [hasDrawn, setHasDrawn] = useState(false)

  // Reduced motion: skip the whole choreography, just hold a static
  // mark briefly and fade once ready/error.
  useEffect(() => {
    if (!reducedMotion) return
    if (appState === 'loading') return
    const timer = setTimeout(() => setPhase('exit'), 250)
    return () => clearTimeout(timer)
  }, [appState, reducedMotion])

  // Full choreography: advance loop -> final-hop only at a bounce
  // boundary (onAnimationIteration below), never mid-flight.
  function handleLoopIteration() {
    if (reducedMotion) return
    if (appStateRef.current === 'loading') return
    if (finishStarted.current) return
    finishStarted.current = true
    setPhase('final-hop')
  }

  useEffect(() => {
    if (reducedMotion) return
    if (phase !== 'final-hop') return
    const isError = appStateRef.current === 'error'
    const timer = setTimeout(
      () => {
        if (isError) {
          setPhase('exit')
        } else {
          setHasDrawn(true)
          setPhase('draw')
        }
      },
      isError ? ERROR_FADE_DELAY_MS : FINAL_HOP_MS,
    )
    return () => clearTimeout(timer)
  }, [phase, reducedMotion])

  useEffect(() => {
    if (reducedMotion || phase !== 'draw') return
    const timer = setTimeout(() => setPhase('reveal-orm'), DRAW_MS)
    return () => clearTimeout(timer)
  }, [phase, reducedMotion])

  useEffect(() => {
    if (reducedMotion || phase !== 'reveal-orm') return
    const timer = setTimeout(() => setPhase('reveal-hub'), ORM_REVEAL_MS)
    return () => clearTimeout(timer)
  }, [phase, reducedMotion])

  useEffect(() => {
    if (reducedMotion || phase !== 'reveal-hub') return
    const timer = setTimeout(() => setPhase('hold'), HUB_REVEAL_MS)
    return () => clearTimeout(timer)
  }, [phase, reducedMotion])

  useEffect(() => {
    if (reducedMotion || phase !== 'hold') return
    const timer = setTimeout(() => setPhase('exit'), HOLD_MS)
    return () => clearTimeout(timer)
  }, [phase, reducedMotion])

  const finishedRef = useRef(false)
  const handleExitEnd = useCallback(
    (event?: TransitionEvent<HTMLDivElement>) => {
      // Ignore transitions bubbling up from descendants — only the
      // root's own opacity fade should trigger completion.
      if (event && event.target !== event.currentTarget) return
      if (finishedRef.current) return
      finishedRef.current = true
      onFinished()
    },
    [onFinished],
  )
  // Belt-and-suspenders: if the transitionend/animationend never fires
  // (e.g. tab backgrounded), don't hang forever.
  useEffect(() => {
    if (phase !== 'exit') return
    const timer = setTimeout(() => handleExitEnd(), FADE_MS + 200)
    return () => clearTimeout(timer)
  }, [phase, handleExitEnd])

  // On a successful run, 'exit' keeps everything at its fully-revealed
  // state so the fade-out dims a complete logo rather than an empty
  // frame. On the error path (never reached 'draw'), 'exit' just fades
  // out the black backdrop, nothing else was ever drawn.
  const successExit = phase === 'exit' && hasDrawn
  const drawing =
    phase === 'draw' ||
    phase === 'reveal-orm' ||
    phase === 'reveal-hub' ||
    phase === 'hold' ||
    successExit
  const showDot = phase === 'loop' || phase === 'final-hop'
  const ormVisible = phase === 'reveal-orm' || phase === 'reveal-hub' || phase === 'hold' || successExit
  const hubVisible = phase === 'reveal-hub' || phase === 'hold' || successExit
  const exiting = phase === 'exit'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{
        opacity: exiting ? 0 : 1,
        transition: exiting ? `opacity ${FADE_MS}ms ease` : undefined,
      }}
      onTransitionEnd={exiting ? handleExitEnd : undefined}
      role="status"
      aria-label="DormHub завантажується"
    >
      <div
        className="dormhub-splash-camera relative flex items-center justify-center"
        style={{
          width: 220,
          height: 220,
          animation: reducedMotion ? 'none' : 'dormhub-splash-drift 2600ms ease-in-out infinite',
        }}
      >
        {/* shadow — fixed vertically, only reacts in size/opacity */}
        {showDot && !reducedMotion && (
          <div
            className="dormhub-splash-shadow absolute rounded-full bg-black"
            style={{
              width: 20,
              height: 6,
              bottom: 78,
              animation: 'dormhub-splash-shadow 760ms cubic-bezier(0.45,0,0.55,1) infinite',
            }}
          />
        )}

        {/* the dot */}
        {showDot && (
          <div
            className="dormhub-splash-dot absolute rounded-full"
            style={{
              width: reducedMotion ? 14 : 13,
              height: reducedMotion ? 14 : 13,
              backgroundColor: '#FF8A00',
              bottom: 78,
              animation: reducedMotion
                ? 'none'
                : phase === 'final-hop'
                  ? `dormhub-splash-final-hop ${FINAL_HOP_MS}ms cubic-bezier(0.45,0,0.55,1) forwards`
                  : 'dormhub-splash-bounce 760ms cubic-bezier(0.45,0,0.55,1) infinite',
            }}
            onAnimationIteration={handleLoopIteration}
          />
        )}

        {/* logo mark, drawn from the same center point the dot was
            bouncing on top of */}
        {(drawing || reducedMotion) && (
          <DormHubMark
            drawing={!reducedMotion && drawing}
            instant={reducedMotion}
            ormVisible={ormVisible || reducedMotion}
            hubVisible={hubVisible || reducedMotion}
          />
        )}
      </div>
    </div>
  )
}

const STROKE = '#FF8A00'
const STROKE_WIDTH = 9

/** Approximated from the provided storyboard reference (no vector asset
 * exists in the repo) — geometry, not a design-tool export. If the
 * brand needs pixel-perfect curves, swap these `d` values for the real
 * SVG paths. */
const PATHS = {
  roof: 'M22 58 L40 24 L60 42',
  leftWall: 'M21 63 L21 79',
  door: 'M50 60 L50 74 L62 74 L62 60 Z',
  arc: 'M60 42 A 27 27 0 1 1 34 88',
}

function DormHubMark({
  drawing,
  instant,
  ormVisible,
  hubVisible,
}: {
  drawing: boolean
  instant: boolean
  ormVisible: boolean
  hubVisible: boolean
}) {
  return (
    <div className="flex items-center" style={{ transform: 'translateY(-2px)' }}>
      <svg
        width={72}
        height={72}
        viewBox="0 0 100 100"
        fill="none"
        style={{ overflow: 'visible' }}
      >
        {Object.entries(PATHS).map(([key, d], index) => (
          <AnimatedPath
            key={key}
            d={d}
            drawing={drawing}
            instant={instant}
            delayMs={index * 35}
          />
        ))}
      </svg>

      <div
        className="overflow-hidden"
        style={{
          maxWidth: ormVisible ? 60 : 0,
          transition: instant ? undefined : `max-width ${ORM_REVEAL_MS}ms ease`,
        }}
      >
        <span
          className="whitespace-nowrap text-[40px] font-bold text-white"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          orm
        </span>
      </div>

      <div
        className="ml-1 flex items-center rounded-lg px-2"
        style={{
          backgroundColor: '#FF8A00',
          opacity: hubVisible ? 1 : 0,
          transform: hubVisible ? 'scale(1)' : 'scale(0.85)',
          transition: instant ? undefined : `opacity ${HUB_REVEAL_MS}ms ease, transform ${HUB_REVEAL_MS}ms ease`,
        }}
      >
        <span
          className="whitespace-nowrap text-[40px] font-bold text-black"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          Hub
        </span>
      </div>
    </div>
  )
}

function AnimatedPath({
  d,
  drawing,
  instant,
  delayMs,
}: {
  d: string
  drawing: boolean
  instant: boolean
  delayMs: number
}) {
  const ref = useRef<SVGPathElement>(null)
  const [length, setLength] = useState(0)

  useEffect(() => {
    if (ref.current) setLength(ref.current.getTotalLength())
  }, [d])

  const revealed = drawing || instant

  return (
    <path
      ref={ref}
      d={d}
      stroke={STROKE}
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={length}
      strokeDashoffset={instant ? 0 : revealed ? 0 : length}
      style={
        instant
          ? undefined
          : {
              transition: `stroke-dashoffset ${DRAW_MS - delayMs}ms cubic-bezier(0.3,0.1,0.2,1) ${delayMs}ms`,
            }
      }
    />
  )
}

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SplashVisual } from '../components/splash/SplashVisual'
import { BOUNCE_CYCLE_MS, SplashTimeline, type SplashRefs } from '../components/splash/splashTimeline'

// Injected by vite.config.ts — see that file. Proves both browsers are
// looking at the exact same bundle, not one serving a stale cached copy.
const BUILD_ID = __BUILD_ID__
const BUILD_TIME = __BUILD_TIME__
const COMMIT_HASH = __COMMIT_HASH__

/**
 * Dev-only motion preview/debug tool. Only ever mounted when
 * import.meta.env.DEV is true (see main.tsx) — Vite statically
 * eliminates that branch (and this whole module) from production
 * builds, so this cannot ship to real users regardless of query params.
 *
 * Lets you play/pause, scrub either the loading loop or the finish
 * sequence with an exact slider, change playback rate (0.25x/0.5x/1x),
 * and fire a simulated APP READY at any point in the loop to check the
 * hand-off to the finish sequence.
 */
export function SplashMotionPreview() {
  const timelineRef = useRef<SplashTimeline | null>(null)
  const [mode, setMode] = useState<'loop' | 'finish'>('loop')
  const [playing, setPlaying] = useState(false)
  const [rate, setRateState] = useState(1)
  const [scrub, setScrub] = useState(0)
  const [finishTotal, setFinishTotal] = useState(0)
  const [finishRequested, setFinishRequested] = useState(false)
  const [pathLengths, setPathLengths] = useState<Record<string, number> | null>(null)
  const [segmentProgress, setSegmentProgress] = useState<Record<string, number>>({})
  const [pathStyles, setPathStyles] = useState<{
    outerDDasharray: string
    outerDDashoffset: string
    roofDashoffset: string
  } | null>(null)
  const [swStatus, setSwStatus] = useState(() =>
    'serviceWorker' in navigator ? 'checking…' : 'unsupported',
  )
  const [cacheResetStatus, setCacheResetStatus] = useState<string | null>(null)
  const rafRef = useRef<number | null>(null)

  // Requirement #3/#12: a stale Service Worker from *any* prior
  // experiment on this exact origin (not necessarily this codebase —
  // SW registrations persist per-origin regardless of what the current
  // repo does) can keep serving an old cached bundle indefinitely.
  // This repo itself registers none (confirmed by grep), so any hit
  // here is left over from something else that ran on localhost:5173.
  // The "unsupported" case needs no effect at all — the lazy initial
  // state above already covers it synchronously.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistrations().then((regs) => {
      setSwStatus(regs.length === 0 ? 'none registered' : `${regs.length} registered ⚠`)
    })
  }, [])

  const resetCachesAndReload = async () => {
    setCacheResetStatus('clearing…')
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } finally {
      // Deliberately does not touch localStorage/sessionStorage/cookies
      // — only Cache Storage and Service Worker registrations, per the
      // "don't clear user data without need" constraint.
      location.reload()
    }
  }

  // Drag semantics: onPointerDown captures whether we were mid-playback
  // *before* the drag started; every 'input' event during the drag just
  // seeks (already paused); onPointerUp resumes only if that captured
  // state was true. Never inferred from `playing` mid-drag, since our
  // own pause-to-scrub already flipped it to false by then.
  const wasPlayingBeforeScrubRef = useRef(false)
  const isScrubbingRef = useRef(false)

  const handleRefsReady = (refs: SplashRefs) => {
    // Guards against StrictMode's mount->cleanup->mount double-invoke
    // calling this twice for the *same* live mount, not against ever
    // creating a second instance after a real cleanup — see the
    // cleanup effect below, which nulls this back out so a genuine
    // remount (StrictMode's simulated one included) gets a fresh,
    // working timeline instead of being permanently blocked by a
    // reference to an already-destroyed one.
    if (timelineRef.current) return
    const timeline = new SplashTimeline(refs, () => {
      setPlaying(false)
    })
    timelineRef.current = timeline
    setPathLengths(timeline.getPathLengths())
    timeline.start()
    setPlaying(true)
  }

  // Poll the timeline's own snapshot to drive the UI — the engine
  // itself is the source of truth, this is read-only display. Also
  // syncs `playing`/`finishRequested` (not just time/mode) so the
  // button label and indicator can never drift from what the engine
  // is actually doing.
  useEffect(() => {
    const poll = () => {
      const t = timelineRef.current
      if (t) {
        const snap = t.getSnapshot()
        setMode(snap.mode)
        setFinishTotal(snap.finishTotalDuration)
        // Ignore the poll's own time readback while a drag is in
        // progress — the pointer handlers are the source of truth for
        // `scrub` during a drag, not this rAF loop (requirement #4:
        // scrubbing must never be silently overwritten by a stray
        // frame tick).
        if (!isScrubbingRef.current) {
          setScrub(snap.mode === 'loop' ? snap.masterElapsed % BOUNCE_CYCLE_MS : snap.masterElapsed)
        }
        setPlaying(snap.playing)
        setFinishRequested(snap.finishRequested)
        setSegmentProgress(t.getSegmentProgress())
        setPathStyles(t.getComputedPathStyles())
      }
      rafRef.current = requestAnimationFrame(poll)
    }
    rafRef.current = requestAnimationFrame(poll)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      // Root cause of "nothing responds after the first render":
      // without resetting this to null, React StrictMode's dev-only
      // mount->cleanup->mount simulation destroys this timeline here,
      // then the *next* mount's handleRefsReady call hits the guard
      // above (timelineRef.current still non-null, just dead) and
      // returns early — every button ends up permanently wired to a
      // cancelled, `alive:false` instance whose tick() no-ops forever.
      timelineRef.current?.destroy()
      timelineRef.current = null
    }
  }, [])

  const setRate = (r: number) => {
    setRateState(r)
    timelineRef.current?.setRate(r)
  }

  const togglePlay = () => {
    const t = timelineRef.current
    if (!t) return
    if (playing) {
      t.pause()
      setPlaying(false)
    } else {
      t.play()
      setPlaying(true)
    }
  }

  const handlePointerDown = () => {
    wasPlayingBeforeScrubRef.current = playing
    isScrubbingRef.current = true
    timelineRef.current?.pause()
    setPlaying(false)
  }

  const handleScrubInput = (value: number) => {
    const t = timelineRef.current
    if (!t) return
    // Read the timeline's own current mode rather than the React
    // mirror of it — the poll loop can lag a frame or two behind a
    // just-triggered mode change (e.g. right after "jump to finish"),
    // and seeking against a stale mode would target the wrong
    // (possibly cancelled) set of animations.
    const liveMode = t.getSnapshot().mode
    setScrub(value)
    setMode(liveMode)
    t.seek(liveMode, value)
  }

  const handlePointerUp = () => {
    isScrubbingRef.current = false
    const t = timelineRef.current
    if (t && wasPlayingBeforeScrubRef.current) {
      t.play()
      setPlaying(true)
    }
    // else: stays exactly on the scrubbed frame, matching "was paused
    // before -> stays paused on the chosen frame" from the spec.
  }

  const appReady = (isError: boolean) => {
    timelineRef.current?.play()
    setPlaying(true)
    timelineRef.current?.requestFinish(isError)
  }

  const jumpToFinish = (isError: boolean) => {
    timelineRef.current?.jumpToFinish(isError)
    timelineRef.current?.play()
    setPlaying(true)
  }

  const restartLoop = () => {
    timelineRef.current?.restart()
    setPlaying(true)
  }

  const sliderMax = mode === 'loop' ? BOUNCE_CYCLE_MS : Math.max(finishTotal, 1)

  // Requirement #7: until the house is drawn at least ~75%, orm must
  // stay fully hidden. outerD is the longest-running/last-finishing
  // draw segment, so it's the most representative "house progress"
  // reference. Small tolerance for the intentional slight overlap
  // (orm is designed to start exactly at outerD's 75% mark).
  const houseProgress = segmentProgress.outerD ?? 0
  const ormProgress = segmentProgress.orm ?? 0
  const syncError = mode === 'finish' && ormProgress > 0.03 && houseProgress < 0.7

  return (
    <div style={{ minHeight: '100vh', background: '#111' }}>
      <SplashVisual onRefsReady={handleRefsReady} />

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '14px 16px',
          background: 'rgba(20,20,20,0.96)',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
          maxHeight: '55vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong>DormHub splash — motion preview</strong>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontFamily: 'ui-monospace, Menlo, monospace',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid #333',
            borderRadius: 6,
            padding: '6px 10px',
          }}
        >
          <Indicator label="STATE" value={mode.toUpperCase()} />
          <Indicator label="CURRENT TIME" value={`${scrub.toFixed(0)}ms / ${sliderMax.toFixed(0)}ms`} />
          <Indicator label="PLAYBACK SPEED" value={`${rate}x`} />
          <Indicator label="IS PLAYING" value={playing ? 'YES' : 'NO'} accent={playing} />
          <Indicator
            label="APP READY"
            value={finishRequested ? (mode === 'finish' ? 'FIRED' : 'PENDING…') : '—'}
            accent={finishRequested}
          />
        </div>

        {/* Requirement #1: real getTotalLength() values, measured once
            at construction (after SVG mount), never guessed. */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontFamily: 'ui-monospace, Menlo, monospace',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #262626',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}
        >
          <span style={{ opacity: 0.55 }}>getTotalLength():</span>
          {pathLengths ? (
            Object.entries(pathLengths).map(([k, v]) => (
              <span key={k}>
                {k}=<strong>{v.toFixed(2)}</strong>
              </span>
            ))
          ) : (
            <span style={{ opacity: 0.5 }}>not measured yet</span>
          )}
        </div>

        {/* Requirements #4/#12: proves both browsers are looking at the
            exact same bundle and the exact same live computed style —
            the actual cross-browser diagnostic surface, not a guess. */}
        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontFamily: 'ui-monospace, Menlo, monospace',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #262626',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
          }}
        >
          <span>
            build=<strong>{BUILD_ID}</strong>
          </span>
          <span>
            built=<strong>{BUILD_TIME}</strong>
          </span>
          <span>
            commit=<strong>{COMMIT_HASH}</strong>
          </span>
          <span>
            SW=<strong style={{ color: swStatus.includes('⚠') ? '#ff8080' : undefined }}>{swStatus}</strong>
          </span>
          <span>
            masterTime=<strong>{scrub.toFixed(1)}ms</strong>
          </span>
          <button onClick={resetCachesAndReload} style={{ ...btnStyle, background: '#7a3a3a' }}>
            🗑 RESET CACHES / RELOAD
          </button>
          {cacheResetStatus && <span>{cacheResetStatus}</span>}
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 11,
            opacity: 0.6,
            wordBreak: 'break-all',
          }}
        >
          UA: {navigator.userAgent}
        </div>
        {pathStyles && (
          <div
            style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 11,
              opacity: 0.75,
            }}
          >
            <span>outerD style.strokeDasharray={pathStyles.outerDDasharray}</span>
            <span>outerD style.strokeDashoffset={pathStyles.outerDDashoffset}</span>
            <span>roof style.strokeDashoffset={pathStyles.roofDashoffset}</span>
          </div>
        )}

        {/* Requirement #7/#8: per-segment draw/reveal progress read
            directly off each Animation's own currentTime — this is
            what's actually rendering, not an inferred value. */}
        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontFamily: 'ui-monospace, Menlo, monospace',
            background: syncError ? 'rgba(200,40,40,0.25)' : 'rgba(255,255,255,0.04)',
            border: syncError ? '1px solid #c22' : '1px solid #262626',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}
        >
          {['outerD', 'roof', 'leftWall', 'innerDetail', 'orm', 'hubPlate', 'hubText'].map((k) => (
            <span key={k}>
              {k}=<strong>{((segmentProgress[k] ?? 0) * 100).toFixed(0)}%</strong>
            </span>
          ))}
          {syncError && (
            <span style={{ color: '#ff8080', fontWeight: 700 }}>
              ⚠ SYNC ERROR: orm revealing before house ≥70% drawn
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={togglePlay} style={btnStyle}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={1}
            value={scrub}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onChange={(e) => handleScrubInput(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ opacity: 0.7 }}>speed:</span>
          {[0.25, 0.5, 1].map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              style={{ ...btnStyle, background: rate === r ? '#FF8A00' : btnStyle.background }}
            >
              {r}x
            </button>
          ))}
          <span style={{ width: 1, height: 20, background: '#444', margin: '0 6px' }} />
          <button onClick={restartLoop} style={btnStyle}>
            ↺ Restart loop
          </button>
          <button onClick={() => jumpToFinish(false)} style={btnStyle}>
            ⇥ Jump to finish
          </button>
          <button onClick={() => jumpToFinish(true)} style={btnStyle}>
            ⇥ Jump to error finish
          </button>
          <span style={{ width: 1, height: 20, background: '#444', margin: '0 6px' }} />
          <button onClick={() => appReady(false)} style={{ ...btnStyle, background: '#2a8f4f' }}>
            APP READY
          </button>
          <button onClick={() => appReady(true)} style={{ ...btnStyle, background: '#a33' }}>
            APP READY (error)
          </button>
        </div>
      </div>
    </div>
  )
}

const btnStyle: CSSProperties = {
  background: '#333',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 13,
}

function Indicator({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span>
      <span style={{ opacity: 0.55, fontSize: 11, marginRight: 6 }}>{label}</span>
      <span style={{ color: accent ? '#5ee08a' : '#fff', fontWeight: 600 }}>{value}</span>
    </span>
  )
}

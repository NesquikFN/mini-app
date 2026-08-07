/**
 * A single authoritative clock drives every visual element. There is no
 * Web Animations API anywhere in this file — every property, on every
 * element, on every frame, is computed as a plain number from master
 * progress and written directly (`element.style.x = ...` /
 * `element.setAttribute(...)`).
 *
 * This is deliberate, not a style preference: WAAPI's support for
 * animating SVG presentation attributes (stroke-dashoffset) and for
 * transforms on elements that only exist to be *referenced* by a
 * <clipPath> (never directly rendered) has real, documented
 * cross-engine inconsistency — a *paused* Animation's `currentTime`
 * does not reliably composite the same way in every browser for these
 * cases. A plain style/attribute write has no such ambiguity: it
 * renders identically everywhere, whether the clock is playing,
 * paused, or being scrubbed. Rather than keep two different rendering
 * mechanisms (one reliable, one not) and have to reason about which
 * property is on which, everything here goes through the same one.
 *
 * Two modes:
 *  - 'loop'   — the infinite bounce, position = masterElapsed % cycle.
 *  - 'finish' — a fixed-length one-shot sequence (hop -> impact -> draw
 *               -> settle -> orm -> hub -> settle -> hold -> fade).
 *
 * The transition from loop to finish only happens at a real cycle
 * boundary (never mid-arc) — see `tick()`. This is the one piece of
 * "wait for the right moment" logic in the whole engine; everything
 * else is pure function-of-elapsed-time.
 */

import {
  DOT_CANVAS_TOP_PADDING,
  HOUSE_CENTER_X,
  HOUSE_CENTER_Y,
  LOGO_H,
  LOGO_W,
  STROKE,
} from './geometry'

export const BOUNCE_CYCLE_MS = 760

// ---- Finish-sequence timing constants (all "local" offsets are
// relative to their own segment's natural anchor; GLOBAL_IMPACT is the
// moment the hop lands and the lines begin, i.e. local-draw-time 0). ----
const HOP_MS = 520
const DOT_ANIM_MS = 610 // hop (0-520) + impact pulse & fade (520-610)
const GLOBAL_IMPACT = HOP_MS

const OUTER_D = { start: 20, dur: 500 } // local, finishes last — the lead stroke
const ROOF = { start: 45, dur: 435 }
const WALL = { start: 70, dur: 410 }
const INNER = { start: 105, dur: 375 }
const HOUSE_SETTLE = { start: 520, dur: 200 }
const ORM = { start: 390, dur: 280 } // 75% through the draw, per spec
const HUB_PLATE = { start: 560, dur: 300 }
const HUB_TEXT = { start: 560 + 0.45 * 300, dur: 190 }
const COMPOSITE_SETTLE_DUR = 180
const HOLD_MS = 350
const FADE_MS = 300
const LOADER_CENTER_X = LOGO_W / 2
// Start close enough to center that the horizontal drift feels like
// momentum rather than the dot flying across the whole wordmark.
const LOADER_START_X = LOADER_CENTER_X - 44
// Two increasingly small bounces carry the dot into the center.
const DOT_TRAVEL_TO_CENTER_MS = BOUNCE_CYCLE_MS * 2

function toGlobal(local: { start: number; dur: number }) {
  return { start: GLOBAL_IMPACT + local.start, dur: local.dur }
}

export interface SplashRefs {
  dot: HTMLCanvasElement
  outerD: SVGPathElement
  roof: SVGPathElement
  leftWall: SVGPathElement
  innerDetail: SVGPathElement
  houseGroup: SVGGElement
  ormText: SVGTextElement
  hubPlateRect: SVGRectElement
  hubText: SVGTextElement
  composite: HTMLDivElement
  root: HTMLDivElement
}

// ---- numeric easing (evaluated in plain JS, never a CSS string, so
// the exact same curve applies whether we're ticking, paused, or
// scrubbing — see the module doc comment). ----
type EasingFn = (t: number) => number

const linear: EasingFn = (t) => t

/** Standard cubic-bezier(x1,y1,x2,y2), solved numerically (Newton-
 * Raphson with a bisection fallback) — the same algorithm browsers use
 * internally for CSS easing strings, evaluated by hand here. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const A = (a1: number, a2: number) => 1 - 3 * a2 + 3 * a1
  const B = (a1: number, a2: number) => 3 * a2 - 6 * a1
  const C = (a1: number) => 3 * a1
  const calc = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t
  const slope = (t: number, a1: number, a2: number) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1)

  return (x: number): number => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2)
      if (Math.abs(s) < 1e-6) break
      t -= (calc(t, x1, x2) - x) / s
    }
    let lo = 0
    let hi = 1
    for (let i = 0; i < 12 && Math.abs(calc(t, x1, x2) - x) > 1e-6; i++) {
      if (calc(t, x1, x2) < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return calc(t, y1, y2)
  }
}

/** Slight overshoot-then-settle (the orm/Hub reveal "pop") as a closed-
 * form curve — trivial to evaluate at any progress directly. */
function easeOutBack(overshoot: number): EasingFn {
  const c1 = overshoot
  const c3 = c1 + 1
  return (t: number): number => {
    const u = t - 1
    return 1 + c3 * u * u * u + c1 * u * u
  }
}

const RISE_EASE = cubicBezier(0.22, 0.75, 0.32, 1)
const FALL_EASE = cubicBezier(0.55, 0.05, 0.85, 0.45)
const DRAW_EASE = cubicBezier(0.35, 0, 0.15, 1)
const EASE_OUT = cubicBezier(0, 0, 0.58, 1)
const EASE_IN = cubicBezier(0.42, 0, 1, 1)
const EASE_STD = cubicBezier(0.25, 0.1, 0.25, 1)
const ORM_EASE = easeOutBack(0.85)
const HUB_PLATE_EASE = easeOutBack(0.8)

/** One numeric channel: a short list of (offset in [0,1], value,
 * easing-to-next) stops, hand-interpolated. Same semantics as a WAAPI
 * keyframe list for a single CSS property, minus WAAPI. */
interface Stop {
  offset: number
  value: number
  easing?: EasingFn
}

function sample(track: Stop[], t: number): number {
  const first = track[0]
  const last = track[track.length - 1]
  if (t <= first.offset) return first.value
  if (t >= last.offset) return last.value
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]
    const b = track[i + 1]
    if (t >= a.offset && t <= b.offset) {
      const span = b.offset - a.offset
      const localT = span > 0 ? (t - a.offset) / span : 1
      const eased = (a.easing ?? linear)(localT)
      return a.value + (b.value - a.value) * eased
    }
  }
  return last.value
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function progressOf(t: number, start: number, dur: number): number {
  if (dur <= 0) return t >= start ? 1 : 0
  return clamp01((t - start) / dur)
}

// ---- hand-authored numeric tracks (fraction-of-own-duration offsets),
// transcribed 1:1 from the choreography spec. ----

const LOOP_DOT_TY: Stop[] = [
  { offset: 0, value: 0, easing: EASE_OUT },
  { offset: 55 / BOUNCE_CYCLE_MS, value: -8, easing: RISE_EASE },
  { offset: 115 / BOUNCE_CYCLE_MS, value: -28, easing: RISE_EASE },
  { offset: 360 / BOUNCE_CYCLE_MS, value: -54, easing: FALL_EASE },
  { offset: 610 / BOUNCE_CYCLE_MS, value: -18, easing: FALL_EASE },
  { offset: 700 / BOUNCE_CYCLE_MS, value: 0, easing: EASE_OUT },
  { offset: 1, value: 0 },
]
const LOOP_DOT_SX: Stop[] = [
  { offset: 0, value: 1.1, easing: EASE_OUT },
  { offset: 55 / BOUNCE_CYCLE_MS, value: 0.96, easing: RISE_EASE },
  { offset: 115 / BOUNCE_CYCLE_MS, value: 1, easing: RISE_EASE },
  { offset: 360 / BOUNCE_CYCLE_MS, value: 1, easing: FALL_EASE },
  { offset: 610 / BOUNCE_CYCLE_MS, value: 1, easing: FALL_EASE },
  { offset: 700 / BOUNCE_CYCLE_MS, value: 1.1, easing: EASE_OUT },
  { offset: 1, value: 1.1 },
]
const LOOP_DOT_SY: Stop[] = [
  { offset: 0, value: 0.9, easing: EASE_OUT },
  { offset: 55 / BOUNCE_CYCLE_MS, value: 1.05, easing: RISE_EASE },
  { offset: 115 / BOUNCE_CYCLE_MS, value: 1, easing: RISE_EASE },
  { offset: 360 / BOUNCE_CYCLE_MS, value: 1, easing: FALL_EASE },
  { offset: 610 / BOUNCE_CYCLE_MS, value: 1, easing: FALL_EASE },
  { offset: 700 / BOUNCE_CYCLE_MS, value: 0.9, easing: EASE_OUT },
  { offset: 1, value: 0.9 },
]
const FIN_DOT_TY: Stop[] = [
  { offset: 0, value: 0, easing: EASE_OUT },
  { offset: 40 / DOT_ANIM_MS, value: -3, easing: RISE_EASE },
  { offset: 260 / DOT_ANIM_MS, value: -22, easing: FALL_EASE },
  { offset: HOP_MS / DOT_ANIM_MS, value: 0, easing: EASE_OUT },
  { offset: 560 / DOT_ANIM_MS, value: 0, easing: EASE_IN },
  { offset: 1, value: 0 },
]
const FIN_DOT_SX: Stop[] = [
  { offset: 0, value: 1.1, easing: EASE_OUT },
  { offset: 40 / DOT_ANIM_MS, value: 0.96, easing: RISE_EASE },
  { offset: 260 / DOT_ANIM_MS, value: 1, easing: FALL_EASE },
  { offset: HOP_MS / DOT_ANIM_MS, value: 1.14, easing: EASE_OUT },
  { offset: 560 / DOT_ANIM_MS, value: 1.16, easing: EASE_IN },
  { offset: 1, value: 0.92 },
]
const FIN_DOT_SY: Stop[] = [
  { offset: 0, value: 0.9, easing: EASE_OUT },
  { offset: 40 / DOT_ANIM_MS, value: 1.05, easing: RISE_EASE },
  { offset: 260 / DOT_ANIM_MS, value: 1, easing: FALL_EASE },
  { offset: HOP_MS / DOT_ANIM_MS, value: 0.86, easing: EASE_OUT },
  { offset: 560 / DOT_ANIM_MS, value: 1.16, easing: EASE_IN },
  { offset: 1, value: 0.92 },
]
const FIN_DOT_OPACITY: Stop[] = [
  { offset: 0, value: 1 },
  { offset: 560 / DOT_ANIM_MS, value: 1, easing: EASE_IN },
  { offset: 1, value: 0 },
]
const HOUSE_SETTLE_SCALE: Stop[] = [
  { offset: 0, value: 1, easing: EASE_IN },
  { offset: 0.15, value: 0.975, easing: EASE_OUT },
  { offset: 0.6, value: 1.015, easing: EASE_OUT },
  { offset: 1, value: 1 },
]
const COMPOSITE_SCALE: Stop[] = [
  { offset: 0, value: 1, easing: EASE_IN },
  { offset: 0.25, value: 0.985, easing: EASE_OUT },
  { offset: 0.7, value: 1.008, easing: EASE_OUT },
  { offset: 1, value: 1 },
]
const FADE_OPACITY: Stop[] = [
  { offset: 0, value: 1, easing: EASE_STD },
  { offset: 1, value: 0 },
]

const ERR_DOT_TY: Stop[] = [
  { offset: 0, value: 0, easing: EASE_OUT },
  { offset: 55 / HOP_MS, value: -8, easing: RISE_EASE },
  { offset: 360 / HOP_MS, value: -42, easing: FALL_EASE },
  { offset: 1, value: 0 },
]
const ERR_DOT_SX: Stop[] = [
  { offset: 0, value: 1.1, easing: EASE_OUT },
  { offset: 55 / HOP_MS, value: 0.96, easing: RISE_EASE },
  { offset: 360 / HOP_MS, value: 1, easing: FALL_EASE },
  { offset: 1, value: 1.1 },
]
const ERR_DOT_SY: Stop[] = [
  { offset: 0, value: 0.9, easing: EASE_OUT },
  { offset: 55 / HOP_MS, value: 1.05, easing: RISE_EASE },
  { offset: 360 / HOP_MS, value: 1, easing: FALL_EASE },
  { offset: 1, value: 0.9 },
]
type Mode = 'loop' | 'finish'

let instanceCounter = 0

// Module-level, not per-instance: the one number that answers "is there
// really only a single requestAnimationFrame loop driving the splash
// right now" from a phone screenshot, across every SplashTimeline
// instance that has ever existed (including ones a StrictMode
// double-invoke should have already stopped). Should read 0 or 1, never
// more, at any point in the splash lifecycle.
let activeRAFCount = 0

export function getActiveRAFCount() {
  return activeRAFCount
}

// Set true only via a DEV build; production silently skips all
// console diagnostics below (still applies the safety clamp itself).
const DEBUG = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

function log(id: string, ...args: unknown[]) {
  if (!DEBUG) return

  console.log(`[splashTimeline#${id}]`, ...args)
}

export class SplashTimeline {
  readonly instanceId: string
  private refs: SplashRefs
  private lengths: { outerD: number; roof: number; leftWall: number; innerDetail: number }

  private mode: Mode = 'loop'
  private masterElapsed = 0
  private lastCycleIndex = 0
  private lastTs: number | null = null
  private rate = 1
  private alive = true
  private ticking = false

  private finishRequested = false
  private finishIsError = false
  finishTotalDuration = 0

  private finishStartCalcs: {
    fadeStart: number
    holdStart: number
    compositeStart: number
    hubText: { start: number; dur: number }
    hubPlate: { start: number; dur: number }
    orm: { start: number; dur: number }
    houseSettle: { start: number; dur: number }
    outerD: { start: number; dur: number }
    roof: { start: number; dur: number }
    wall: { start: number; dur: number }
    inner: { start: number; dur: number }
  } | null = null

  private lastProgress: Record<string, number> = {}

  private onFinished?: () => void
  private finishedFired = false

  constructor(refs: SplashRefs, onFinished?: () => void, externalId?: string) {
    // Prefer the owning component's own instanceId (e.g. SplashScreen's)
    // when given, so logs correlate under one id per real splash
    // lifecycle instead of two ids that need cross-referencing.
    this.instanceId = externalId ?? `${++instanceCounter}-${Math.random().toString(36).slice(2, 6)}`
    this.refs = refs
    this.onFinished = onFinished
    log(this.instanceId, 'timeline created')
    this.lengths = {
      outerD: refs.outerD.getTotalLength(),
      roof: refs.roof.getTotalLength(),
      leftWall: refs.leftWall.getTotalLength(),
      innerDetail: refs.innerDetail.getTotalLength(),
    }
    log(this.instanceId, 'path lengths measured', this.lengths)
    this.resetDirectVisuals()
    this.rafDot(0)
  }

  // ---- public control (production uses start/requestFinish/destroy
  // only; the rest exists for the dev motion preview). ----

  start() {
    if (!this.alive) return
    this.mode = 'loop'
    this.masterElapsed = 0
    this.lastCycleIndex = 0
    this.lastTs = null
    this.resetDirectVisuals()
    log(this.instanceId, 'loading started')
    this.play()
  }

  requestFinish(isError = false) {
    log(this.instanceId, 'finish requested', { isError, alreadyRequested: this.finishRequested })
    this.finishRequested = true
    this.finishIsError = isError
  }

  play() {
    if (this.ticking) return
    this.lastTs = null
    this.setTicking(true)
    requestAnimationFrame(this.tick)
  }

  pause() {
    this.setTicking(false)
  }

  private setTicking(value: boolean) {
    if (this.ticking === value) return
    this.ticking = value
    activeRAFCount += value ? 1 : -1
  }

  setRate(rate: number) {
    this.rate = rate
  }

  /** Dev preview only: scrub directly, bypassing the boundary-wait. */
  seek(mode: Mode, elapsedMs: number) {
    this.mode = mode
    if (mode === 'loop') {
      this.masterElapsed = elapsedMs
      this.lastCycleIndex = Math.floor(elapsedMs / BOUNCE_CYCLE_MS)
      this.applyLoopFrame(elapsedMs % BOUNCE_CYCLE_MS, elapsedMs)
    } else {
      if (!this.finishStartCalcs) this.prepareFinish(false)
      this.masterElapsed = elapsedMs
      this.applyFinishFrame(elapsedMs)
    }
  }

  /** Dev preview only: jump straight into the finish sequence for
   * isolated scrubbing, without waiting for a loop boundary. */
  jumpToFinish(isError: boolean) {
    this.prepareFinish(isError)
    this.mode = 'finish'
    this.masterElapsed = 0
    this.finishedFired = false
  }

  /** Dev preview only: back to a fresh infinite loop. */
  restart() {
    this.finishStartCalcs = null
    this.finishRequested = false
    this.finishedFired = false
    this.start()
  }

  getSnapshot() {
    return {
      mode: this.mode,
      masterElapsed: this.masterElapsed,
      finishTotalDuration: this.finishTotalDuration,
      playing: this.ticking,
      rate: this.rate,
      finishRequested: this.finishRequested,
      alive: this.alive,
    }
  }

  destroy() {
    log(this.instanceId, 'timeline destroyed')
    this.alive = false
    this.setTicking(false)
  }

  // ---- internals ----

  private tick = (ts: number) => {
    if (!this.alive || !this.ticking) return
    if (this.lastTs === null) this.lastTs = ts
    const dt = (ts - this.lastTs) * this.rate
    this.lastTs = ts
    this.masterElapsed += dt

    if (this.mode === 'loop') {
      const cyclePos = this.masterElapsed % BOUNCE_CYCLE_MS
      this.applyLoopFrame(cyclePos, this.masterElapsed)
      const cycleIndex = Math.floor(this.masterElapsed / BOUNCE_CYCLE_MS)
      if (
        this.finishRequested &&
        this.masterElapsed >= DOT_TRAVEL_TO_CENTER_MS &&
        cycleIndex > this.lastCycleIndex
      ) {
        this.beginFinish()
      }
      this.lastCycleIndex = cycleIndex
    } else {
      this.applyFinishFrame(this.masterElapsed)
      if (this.masterElapsed >= this.finishTotalDuration) {
        this.setTicking(false)
        if (!this.finishedFired) {
          this.finishedFired = true
          log(this.instanceId, 'finish completed')
          this.onFinished?.()
        }
        return
      }
    }
    requestAnimationFrame(this.tick)
  }

  private beginFinish() {
    this.prepareFinish(this.finishIsError)
    this.mode = 'finish'
    this.masterElapsed = 0
    this.finishedFired = false
  }

  private applyLoopFrame(cyclePos: number, totalElapsed: number) {
    const t = cyclePos / BOUNCE_CYCLE_MS
    const travelProgress = EASE_STD(progressOf(totalElapsed, 0, DOT_TRAVEL_TO_CENTER_MS))
    // Lose vertical energy as the dot approaches center: the first
    // bounce is moderate, the second is visibly lower, then only a
    // subtle idle bounce remains while readiness is pending.
    const energy = 0.32 + 0.38 * (1 - travelProgress)
    this.rafDot(
      t,
      LOADER_START_X + (LOADER_CENTER_X - LOADER_START_X) * travelProgress,
      energy,
    )
  }

  private rafDot(t: number, x = LOADER_START_X, energy = 0.7) {
    const ty = sample(LOOP_DOT_TY, t) * energy
    const sx = sample(LOOP_DOT_SX, t)
    const sy = sample(LOOP_DOT_SY, t)
    setDotGeometry(this.refs.dot, x, ty, sx, sy, 1)
  }

  /** Precomputes every segment's global start/duration once per finish
   * run — called exactly once, either from beginFinish() (production,
   * loop-boundary-gated) or jumpToFinish()/seek() (dev preview only). */
  private prepareFinish(isError: boolean) {
    log(this.instanceId, 'finish started', { isError })
    if (isError) {
      const fadeStart = HOP_MS + 80
      this.finishTotalDuration = fadeStart + FADE_MS
      this.finishStartCalcs = {
        fadeStart,
        holdStart: 0,
        compositeStart: 0,
        hubText: { start: 0, dur: 0 },
        hubPlate: { start: 0, dur: 0 },
        orm: { start: 0, dur: 0 },
        houseSettle: { start: 0, dur: 0 },
        outerD: { start: 0, dur: 0 },
        roof: { start: 0, dur: 0 },
        wall: { start: 0, dur: 0 },
        inner: { start: 0, dur: 0 },
      }
      this.finishIsError = true
      return
    }
    this.finishIsError = false
    const outerD = toGlobal(OUTER_D)
    const roof = toGlobal(ROOF)
    const wall = toGlobal(WALL)
    const inner = toGlobal(INNER)
    const houseSettle = toGlobal(HOUSE_SETTLE)
    const orm = toGlobal(ORM)
    const hubPlate = toGlobal(HUB_PLATE)
    const hubText = toGlobal(HUB_TEXT)
    const compositeStart = Math.max(hubPlate.start + hubPlate.dur, hubText.start + hubText.dur)
    const holdStart = compositeStart + COMPOSITE_SETTLE_DUR
    const fadeStart = holdStart + HOLD_MS
    this.finishTotalDuration = fadeStart + FADE_MS
    this.finishStartCalcs = {
      fadeStart,
      holdStart,
      compositeStart,
      hubText,
      hubPlate,
      orm,
      houseSettle,
      outerD,
      roof,
      wall,
      inner,
    }
  }

  private applyFinishFrame(t: number) {
    const c = this.finishStartCalcs
    if (!c) return
    const r = this.refs

    if (this.finishIsError) {
      const dotT = progressOf(t, 0, HOP_MS)
      setDotGeometry(
        r.dot,
        LOADER_CENTER_X,
        sample(ERR_DOT_TY, dotT),
        sample(ERR_DOT_SX, dotT),
        sample(ERR_DOT_SY, dotT),
        1,
      )
      const fadeT = progressOf(t, c.fadeStart, FADE_MS)
      r.root.style.opacity = String(sample(FADE_OPACITY, fadeT))
      return
    }

    // dot (hop -> impact -> fade)
    const dotT = progressOf(t, 0, DOT_ANIM_MS)
    setDotGeometry(
      r.dot,
      LOADER_CENTER_X + (HOUSE_CENTER_X - LOADER_CENTER_X) * EASE_STD(progressOf(t, 0, HOP_MS)),
      sample(FIN_DOT_TY, dotT),
      sample(FIN_DOT_SX, dotT),
      sample(FIN_DOT_SY, dotT),
      sample(FIN_DOT_OPACITY, dotT),
    )

    // house paths — direct stroke-dashoffset from eased progress
    const outerDProgress = DRAW_EASE(progressOf(t, c.outerD.start, c.outerD.dur))
    const roofProgress = DRAW_EASE(progressOf(t, c.roof.start, c.roof.dur))
    const wallProgress = DRAW_EASE(progressOf(t, c.wall.start, c.wall.dur))
    const innerProgress = DRAW_EASE(progressOf(t, c.inner.start, c.inner.dur))
    r.outerD.style.strokeDashoffset = String(this.lengths.outerD * (1 - outerDProgress))
    r.roof.style.strokeDashoffset = String(this.lengths.roof * (1 - roofProgress))
    r.leftWall.style.strokeDashoffset = String(this.lengths.leftWall * (1 - wallProgress))
    r.innerDetail.style.strokeDashoffset = String(this.lengths.innerDetail * (1 - innerProgress))
    // With a round line cap, a fully offset (zero-length) dash can still
    // render as a stationary dot. Keep each path hidden until its draw
    // progress is genuinely above zero.
    r.outerD.style.opacity = outerDProgress > 0 ? '1' : '0'
    r.roof.style.opacity = roofProgress > 0 ? '1' : '0'
    r.leftWall.style.opacity = wallProgress > 0 ? '1' : '0'
    r.innerDetail.style.opacity = innerProgress > 0 ? '1' : '0'

    // house settle
    const settleT = progressOf(t, c.houseSettle.start, c.houseSettle.dur)
    const settleScale = sample(HOUSE_SETTLE_SCALE, settleT)
    r.houseGroup.style.transform = `scale(${settleScale})`

    // ---- orm / Hub reveal: real getTotalLength()-derived draw
    // progress on the longest-running path (outerD) is the ground
    // truth for "how drawn is the house", independent of the clock —
    // see the production safety clamp below (requirement #8). ----
    const houseProgressRaw = progressOf(t, c.outerD.start, c.outerD.dur)
    let ormEased = ORM_EASE(progressOf(t, c.orm.start, c.orm.dur))
    const hubPlateEased = HUB_PLATE_EASE(progressOf(t, c.hubPlate.start, c.hubPlate.dur))
    const hubTextEased = progressOf(t, c.hubText.start, c.hubText.dur) // linear, no overshoot

    if (ormEased > 0.05 && houseProgressRaw < 0.7) {
      if (DEBUG) {

        console.error(
          `[splashTimeline#${this.instanceId}] SYNC ERROR: orm revealing (${(ormEased * 100).toFixed(1)}%) before house is 70% drawn (house=${(houseProgressRaw * 100).toFixed(1)}%) at masterTime=${t.toFixed(1)}ms`,
        )
      }
      // Production-safe: never let orm show ahead of the house,
      // regardless of why the clock got here.
      ormEased = 0
    }

    setClipInset(r.ormText, ormEased)
    setClipInset(r.hubPlateRect, hubPlateEased)
    setClipInset(r.hubText, hubTextEased)

    this.lastProgress = {
      outerD: houseProgressRaw,
      roof: progressOf(t, c.roof.start, c.roof.dur),
      leftWall: progressOf(t, c.wall.start, c.wall.dur),
      innerDetail: progressOf(t, c.inner.start, c.inner.dur),
      orm: progressOf(t, c.orm.start, c.orm.dur),
      hubPlate: progressOf(t, c.hubPlate.start, c.hubPlate.dur),
      hubText: progressOf(t, c.hubText.start, c.hubText.dur),
    }

    // composite settle
    const compT = progressOf(t, c.compositeStart, COMPOSITE_SETTLE_DUR)
    r.composite.style.transform = `scale(${sample(COMPOSITE_SCALE, compT)})`

    // root fade
    const fadeT = progressOf(t, c.fadeStart, FADE_MS)
    r.root.style.opacity = String(sample(FADE_OPACITY, fadeT))

    if (t >= this.finishTotalDuration) this.snapToFinalFrame()
  }

  /** Belt-and-suspenders: forces every path/reveal to its exact final
   * value directly, rather than trusting a very large `t` through the
   * normal progress math — guarantees dashoffset=0, full reveal,
   * opacity=0 even if floating-point drift left something a fraction
   * short of complete. */
  private snapToFinalFrame() {
    const r = this.refs
    if (this.finishIsError) return
    r.outerD.style.strokeDashoffset = '0'
    r.roof.style.strokeDashoffset = '0'
    r.leftWall.style.strokeDashoffset = '0'
    r.innerDetail.style.strokeDashoffset = '0'
    r.outerD.style.opacity = '1'
    r.roof.style.opacity = '1'
    r.leftWall.style.opacity = '1'
    r.innerDetail.style.opacity = '1'
    r.houseGroup.style.transform = 'scale(1)'
    r.composite.style.transform = 'scale(1)'
    setClipInset(r.ormText, 1)
    setClipInset(r.hubPlateRect, 1)
    setClipInset(r.hubText, 1)
  }

  /** Dev-preview debug only. */
  getSegmentProgress(): Record<string, number> {
    return { ...this.lastProgress }
  }

  getPathLengths() {
    return { ...this.lengths }
  }

  getComputedPathStyles() {
    const r = this.refs
    return {
      outerDDasharray: r.outerD.style.strokeDasharray,
      outerDDashoffset: r.outerD.style.strokeDashoffset,
      roofDashoffset: r.roof.style.strokeDashoffset,
    }
  }

  /** Sets dasharray once and dashoffset to "fully hidden" via inline
   * style (never just the attribute), and every reveal rect to
   * zero-width — called synchronously at construction and whenever we
   * return to the loop, so a completed run followed by "restart"
   * doesn't leave the house/orm/Hub visible underneath the bouncing dot. */
  private resetDirectVisuals() {
    const r = this.refs
    const setPath = (el: SVGPathElement, length: number) => {
      el.style.strokeDasharray = String(length)
      el.style.strokeDashoffset = String(length)
      el.style.opacity = '0'
    }
    setPath(r.outerD, this.lengths.outerD)
    setPath(r.roof, this.lengths.roof)
    setPath(r.leftWall, this.lengths.leftWall)
    setPath(r.innerDetail, this.lengths.innerDetail)
    r.houseGroup.style.transform = 'scale(1)'
    r.composite.style.transform = 'scale(1)'
    r.root.style.opacity = '1'
    setClipInset(r.ormText, 0)
    setClipInset(r.hubPlateRect, 0)
    setClipInset(r.hubText, 0)
  }
}

// ---- reveal mechanism: a plain CSS `clip-path: inset()` written to
// `.style` on the *visible* element itself — the same "direct style
// write, no separately-referenced sub-DOM" rule already used for
// stroke-dashoffset above. This replaces an earlier approach that
// mutated the `width` attribute of a <rect> living inside a
// <clipPath>: that was empirically confirmed reliable in Chromium but
// NOT on WebKit (Safari / Telegram iOS WebView) — real-device
// screenshots showed the clip having no effect at all there (text
// fully visible while the engine's own progress readout still said
// 0%), consistent with WebKit's known failure to re-invalidate an
// SVG <clipPath> reference when only a referenced shape's geometry
// attribute changes via JS. `inset()` percentages are relative to the
// element's own bounding box, so no absolute width constants are
// needed — insetting from the right by `(1-progress)*100%` reveals
// left-to-right exactly like the old width-grows-from-a-fixed-left-
// edge approach.
function setClipInset(el: SVGGraphicsElement, progress: number) {
  const hiddenPercent = Math.max(0, 1 - clamp01(progress)) * 100
  el.style.clipPath = `inset(0 ${hiddenPercent}% 0 0)`
}

// The canvas stays fixed in place and is fully cleared before each draw.
// This prevents Safari/Telegram WebView from retaining a stale painted
// position of the dot while still preserving the same motion geometry.
function setDotGeometry(
  el: HTMLCanvasElement,
  x: number,
  ty: number,
  sx: number,
  sy: number,
  opacity: number,
) {
  const context = el.getContext('2d')
  if (!context) return
  const width = 13 * sx
  const height = 13 * sy
  const y = DOT_CANVAS_TOP_PADDING + HOUSE_CENTER_Y + ty
  context.clearRect(0, 0, LOGO_W, LOGO_H + DOT_CANVAS_TOP_PADDING)
  if (opacity <= 0) return
  context.save()
  context.globalAlpha = opacity
  context.fillStyle = STROKE
  context.beginPath()
  context.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

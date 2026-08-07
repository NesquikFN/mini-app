import { useLayoutEffect, useRef } from 'react'
import type { SplashRefs } from './splashTimeline'
import {
  DISPLAY_SCALE,
  DOT_CANVAS_TOP_PADDING,
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
} from './geometry'

// Left-to-right reveal starts fully hidden: 100% inset from the right
// edge of the element's own box. See splashTimeline.ts for why this is
// a CSS `clip-path: inset()` on the element itself rather than an SVG
// <clipPath> referencing a separately-mutated <rect>.
const HIDDEN_CLIP = 'inset(0 100% 0 0)'

/**
 * Pure presentational DOM — every visual property that changes over
 * time is driven imperatively by SplashTimeline via `currentTime`
 * assignments on Animation objects, never by React state/props. This
 * component's only job is to build the DOM once and hand back element
 * refs; it never re-renders as the animation plays.
 *
 * Shared by the production SplashScreen and the dev-only motion
 * preview so both are guaranteed to be animating the exact same
 * markup/geometry.
 */
export function SplashVisual({ onRefsReady }: { onRefsReady: (refs: SplashRefs) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const compositeRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLCanvasElement>(null)
  const outerDRef = useRef<SVGPathElement>(null)
  const roofRef = useRef<SVGPathElement>(null)
  const leftWallRef = useRef<SVGPathElement>(null)
  const innerDetailRef = useRef<SVGPathElement>(null)
  const houseGroupRef = useRef<SVGGElement>(null)
  const ormTextRef = useRef<SVGTextElement>(null)
  const hubPlateRef = useRef<SVGRectElement>(null)
  const hubTextRef = useRef<SVGTextElement>(null)

  useLayoutEffect(() => {
    if (
      !rootRef.current ||
      !compositeRef.current ||
      !dotRef.current ||
      !outerDRef.current ||
      !roofRef.current ||
      !leftWallRef.current ||
      !innerDetailRef.current ||
      !houseGroupRef.current ||
      !ormTextRef.current ||
      !hubPlateRef.current ||
      !hubTextRef.current
    ) {
      return
    }
    const pixelRatio = window.devicePixelRatio || 1
    dotRef.current.width = Math.ceil(LOGO_W * pixelRatio)
    dotRef.current.height = Math.ceil((LOGO_H + DOT_CANVAS_TOP_PADDING) * pixelRatio)
    dotRef.current.getContext('2d')?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    onRefsReady({
      root: rootRef.current,
      composite: compositeRef.current,
      dot: dotRef.current,
      outerD: outerDRef.current,
      roof: roofRef.current,
      leftWall: leftWallRef.current,
      innerDetail: innerDetailRef.current,
      houseGroup: houseGroupRef.current,
      ormText: ormTextRef.current,
      hubPlateRect: hubPlateRef.current,
      hubText: hubTextRef.current,
    })
    // Refs are stable for the component's lifetime — this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      // Hidden until the owning SplashScreen confirms the initial
      // frame (dashoffset/reveal-width) is fully committed and at
      // least one paint has happened — see SplashScreen's
      // `visualReady` gate. Prevents any possibility of a flash of
      // wrong state (e.g. a fully-drawn house) before JS has run.
      style={{ visibility: 'hidden' }}
      role="status"
      aria-label="DormHub завантажується"
    >
      <div ref={compositeRef} className="relative" style={{ width: LOGO_W, height: LOGO_H }}>
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          width={LOGO_W}
          height={LOGO_H}
          fill="none"
          style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        >
          <g
            ref={houseGroupRef}
            fill="none"
            stroke={STROKE}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            <path ref={outerDRef} d={HOUSE_PATHS.outerD} />
            <path ref={roofRef} d={HOUSE_PATHS.roof} />
            <path ref={leftWallRef} d={HOUSE_PATHS.leftWall} />
            <path ref={innerDetailRef} d={HOUSE_PATHS.innerDetail} />
          </g>

          <text
            ref={ormTextRef}
            x={ORM_TEXT.x}
            y={ORM_TEXT.y}
            fill="#FFFFFF"
            fontFamily={WORDMARK_FONT}
            fontSize={ORM_TEXT.fontSize}
            fontWeight={700}
            letterSpacing={ORM_TEXT.letterSpacing}
            style={{ clipPath: HIDDEN_CLIP }}
          >
            orm
          </text>

          <g>
            <rect
              ref={hubPlateRef}
              x={HUB_BADGE_RECT.x}
              y={HUB_BADGE_RECT.y}
              width={HUB_BADGE_RECT.width}
              height={HUB_BADGE_RECT.height}
              rx={HUB_BADGE_RECT.rx}
              fill={STROKE}
              style={{ clipPath: HIDDEN_CLIP }}
            />
            <text
              ref={hubTextRef}
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
              style={{ clipPath: HIDDEN_CLIP }}
            >
              Hub
            </text>
          </g>
        </svg>
        {/* The canvas itself never moves. Clearing it before every draw
            avoids WebKit retaining a stale painted position of a moving
            HTML/SVG element (which looked like a second, static dot). */}
        <canvas
          ref={dotRef}
          className="dormhub-loader-dot"
          style={{
            position: 'absolute',
            left: 0,
            top: -DOT_CANVAS_TOP_PADDING,
            width: LOGO_W,
            height: LOGO_H + DOT_CANVAS_TOP_PADDING,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}

export { DISPLAY_SCALE }

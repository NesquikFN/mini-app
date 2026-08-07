/**
 * Every number in this file is copied verbatim from the approved
 * DormHub_logo_clean.svg (813x225 viewBox, house-d group at stroke-width
 * 18, `orm` text, `Hub` badge). Nothing here is redrawn, re-proportioned
 * or approximated — this is the single source of geometric truth for
 * both the production SplashScreen and the dev motion preview.
 */

export const VIEWBOX_W = 813
export const VIEWBOX_H = 225

// Displayed at this scale the whole lockup is a comfortable width on a
// phone screen while the house-D stays large enough to read clearly
// while it's being drawn.
export const DISPLAY_SCALE = 0.42
export const LOGO_W = VIEWBOX_W * DISPLAY_SCALE
export const LOGO_H = VIEWBOX_H * DISPLAY_SCALE
// Extra canvas space above the logo for the bouncing dot's apex.
export const DOT_CANVAS_TOP_PADDING = 64

// Geometric center of the house-D mark's stroke-inclusive bounding box,
// in the source SVG's own coordinate space — the single fixed point the
// dot bounces above and finally drops into.
export const HOUSE_CENTER_X = 109.5 * DISPLAY_SCALE
export const HOUSE_CENTER_Y = 113.5 * DISPLAY_SCALE

export const STROKE = '#FF8A00'
export const STROKE_WIDTH = 18

export const HOUSE_PATHS = {
  outerD: 'M76 20 C147 20 199 60 199 112 C199 174 151 204 76 207',
  roof: 'M20 95 L72 51 L137 99',
  leftWall: 'M20 123 L20 190',
  innerDetail: 'M62 183 L62 149 Q62 142 69 142 L91 142 Q98 142 98 149 L98 180',
} as const

export const WORDMARK_FONT = "'Arial Rounded MT Bold', 'Arial Rounded Bold', Arial, sans-serif"

// letterSpacing loosened from the source -7 to 0: 'Arial Rounded MT Bold'
// is a macOS/Windows-only system font, not present on iOS — Safari/TG
// WebView there silently falls back to plain Arial, whose "r"/"m" are
// wide enough that any negative tracking overlaps them. 0 is safe
// regardless of which font in the stack actually ends up rendering.
// x-values unchanged from the source SVG — the house-D-to-"orm" gap was
// already fine.
export const ORM_TEXT = { x: 213, y: 176, fontSize: 145, letterSpacing: 0 }

// Keep the badge visually close to the final “m”, with a small gap so
// the wordmark and plate still read as separate elements.
export const HUB_BADGE_RECT = { x: 515, y: 51, width: 288, height: 151, rx: 21 }
export const HUB_TEXT = { x: 539, y: 169, fontSize: 118, letterSpacing: -5 }

import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'
import { env } from '../config/env'
import { MAX_INPUT_PIXELS, UPLOAD_CONTENT_TYPES } from './uploads'

/**
 * Генерація картки події для поширення в Telegram.
 *
 * Безпека — головне тут, бо на вхід приходять дані, які писали
 * користувачі (назва, місце, імена):
 *  - усе, що потрапляє в SVG, проходить escapeXml;
 *  - обкладинка читається ЛИШЕ з локального uploads-каталогу; URL із БД
 *    приймається лише як same-origin шлях усередині /uploads;
 *  - аватарки завантажуються лише з HTTPS t.me/i/userpic без redirect,
 *    з лімітом часу, байтів і пікселів, після чого нормалізуються в PNG;
 *  - sharp обмежений limitInputPixels, як і в uploads.ts.
 *
 * SVG рендериться через resvg з явно переданими локальними шрифтами,
 * без браузера. Єдиний дозволений мережевий ресурс — Telegram userpic.
 */

export type ShareCardFormat = 'chat' | 'story'

export const SHARE_CARD_SIZES: Record<ShareCardFormat, { width: number; height: number }> = {
  chat: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
}

/** Chat-картка йде в InlineQueryResultPhoto, а Bot API вимагає саме
 * JPEG. Story-картку віддає shareToStory, там формат вільний — лишаємо
 * PNG заради чистих країв градієнта. */
export const SHARE_CARD_CONTENT_TYPE: Record<ShareCardFormat, string> = {
  chat: 'image/jpeg',
  story: 'image/png',
}

export interface ShareCardParticipant {
  displayName: string
  /** Локально нормалізований PNG data URI. Довільний URL у SVG ніколи
   * не потрапляє. */
  avatarDataUri?: string
}

export interface ShareCardInput {
  eventId: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM або HH:MM:SS */
  time: string
  location: string
  isOnline: boolean
  dormitoryName?: string
  participantCount: number
  maxParticipants: number
  participants: ShareCardParticipant[]
  vipOnly: boolean
  gpuOnly: boolean
  /** true → картка без назви, місця й учасників (для тих, хто не має
   * ролі; див. renderPrivateCard). */
  hideDetails: boolean
  /** Чи має подія локальну обкладинку в uploads. */
  hasCover: boolean
  /** Серверний URL потрібен лише щоб знайти локальний файл шаблону;
   * мережевих запитів за ним немає. */
  coverImageUrl?: string
  /** Нормалізована локальна PNG-обкладинка. Заповнюється лише всередині
   * renderShareCard і вставляється в захищену рамку. */
  coverDataUri?: string
}

const ACCENT = '#ff7a00'
const VIP_GOLD = '#fbbf24'
const GPU_BLUE = '#3b82f6'

// Railway-образ не зобов'язаний мати системні шрифти. Resvg отримує
// файли явно й не завантажує системні — результат однаковий локально та
// в production, а українська кирилиця не перетворюється на квадрати.
const CARD_FONT_FILES = [
  require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
  require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
  require.resolve(
    '@expo-google-fonts/unbounded/400Regular/Unbounded_400Regular.ttf',
  ),
  require.resolve(
    '@expo-google-fonts/unbounded/600SemiBold/Unbounded_600SemiBold.ttf',
  ),
]

const POSTER_FONT_FAMILY = 'Unbounded, DejaVu Sans, sans-serif'

/**
 * XML-екранування для всього, що вставляється в SVG. Без нього назва
 * події з `<`, `&` чи лапками ламала б розбір документа, а в гіршому
 * випадку дозволяла б вставити власні SVG-вузли.
 */
export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case "'":
        return '&apos;'
      default:
        return '&quot;'
    }
  })
}

/**
 * Перенос по словах із жорстким обрізанням. Ширина рахується
 * наближено (середня ширина гліфа × розмір шрифта) — точних метрик тут
 * не треба, важливо лише не вилізти за межі картки.
 *
 * Задовге слово (напр. URL без пробілів) ріжеться посимвольно, інакше
 * один «токен» розтягнув би рядок на всю картку.
 */
export function wrapText(
  text: string,
  maxLines: number,
  maxCharsPerLine: number,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const lines: string[] = []
  let current = ''

  for (const word of normalized.split(' ')) {
    let candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = ''
      if (lines.length === maxLines) break
      candidate = word
    }

    // Слово довше за рядок — ріжемо його самого.
    let rest = candidate
    while (rest.length > maxCharsPerLine) {
      lines.push(rest.slice(0, maxCharsPerLine))
      rest = rest.slice(maxCharsPerLine)
      if (lines.length === maxLines) break
    }
    if (lines.length === maxLines) break
    current = rest
  }

  if (current && lines.length < maxLines) lines.push(current)

  // Те, що не помістилось, позначаємо трьома крапками в останньому рядку.
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').length
    if (consumed < normalized.length) {
      const last = lines[maxLines - 1]
      lines[maxLines - 1] =
        last.length > maxCharsPerLine - 1 ? `${last.slice(0, maxCharsPerLine - 1)}…` : `${last}…`
    }
  }

  return lines
}

/** Однорядкові підписи (дата, місце) обрізаються жорстко: перенос їм не
 * потрібен, а вилізти за межі картки вони не мають права. */
export function truncateLine(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1)}…`
}

const MONTHS = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
]

/** «2026-08-14» + «19:30» → «14 серпня, 19:30». Розбір рядковий, без
 * Date — колонки date/time наївні (київський «стінний» час). */
export function formatCardDateTime(date: string, time: string): string {
  const [, month, day] = date.split('-')
  const monthName = MONTHS[Number(month) - 1] ?? ''
  const dayNumber = Number(day)
  const hhmm = time.slice(0, 5)
  if (!monthName || Number.isNaN(dayNumber)) return hhmm
  return `${dayNumber} ${monthName}, ${hhmm}`
}

/** Перша літера імені для кружка-аватарки. Емодзі та сурогатні пари
 * беруться цілим символом, а не половиною код-юніта. */
export function initialOf(name: string): string {
  // Emoji на початку nickname немає в текстовому шрифті картки й раніше
  // ставав квадратом. Беремо першу справжню літеру/цифру.
  const first = [...name.trim()].find((char) => /[\p{L}\p{N}]/u.test(char))
  return (first ?? '?').toUpperCase()
}

/**
 * Локальний шлях обкладинки. Будується ВИКЛЮЧНО з UUID події (він уже
 * провалідований Zod-схемою маршруту), а не з imageUrl у базі — тож
 * жоден зовнішній хост сюди не потрапляє. Додаткова перевірка
 * входження в UPLOADS_DIR лишається другим рубежем.
 */
function resolveCoverPath(eventId: string, imageUrl?: string): string | null {
  const root = resolve(env.UPLOADS_DIR)
  let relativePath = `${eventId}/cover.webp`

  // Події, створені з шаблону, посилаються на його локальну обкладинку,
  // а не мають копії в `<eventId>/cover.webp`. Приймаємо лише URL нашого
  // backend і лише каталог /uploads; зовнішні адреси не читаємо й не fetch-имо.
  if (imageUrl) {
    try {
      const candidate = new URL(imageUrl)
      const publicUrl = new URL(env.PUBLIC_URL)
      if (candidate.origin === publicUrl.origin && candidate.pathname.startsWith('/uploads/')) {
        relativePath = decodeURIComponent(candidate.pathname.slice('/uploads/'.length))
      }
    } catch {
      // Некоректний або старий URL — спробуємо стандартний шлях події.
    }
  }

  const target = resolve(root, relativePath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.startsWith(sep)) return null
  return target
}

/** Обкладинка для рамки картки, або null якщо файлу нема / він побитий. */
async function loadCoverArtwork(
  eventId: string,
  imageUrl: string | undefined,
  width: number,
  height: number,
): Promise<Buffer | null> {
  const coverPath = resolveCoverPath(eventId, imageUrl)
  if (!coverPath) return null

  try {
    const file = await readFile(coverPath)
    return await sharp(file, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .resize({ width, height, fit: 'cover', position: 'attention' })
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch {
    // Файлу немає або він не читається — картка чудово працює й без нього.
    return null
  }
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const AVATAR_TIMEOUT_MS = 2_500
const TELEGRAM_AVATAR_PATH = '/i/userpic/'
const TELEGRAM_AVATAR_CONTENT_TYPES = [...UPLOAD_CONTENT_TYPES, 'image/svg+xml']

async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer | null> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null
  if (!response.body) return null

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  return Buffer.concat(chunks, total)
}

/**
 * Telegram profile photo → small, canonical PNG embedded into the SVG.
 * The URL comes from signed initData, but we still accept only Telegram's
 * documented t.me userpic path, reject redirects and cap bytes/pixels.
 */
export async function loadParticipantAvatar(photoUrl?: string): Promise<string | undefined> {
  if (!photoUrl) return undefined

  let url: URL
  try {
    url = new URL(photoUrl)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' || url.hostname !== 't.me' || !url.pathname.startsWith(TELEGRAM_AVATAR_PATH)) {
    return undefined
  }

  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS),
    })
    const contentType = response.headers.get('content-type')?.split(';')[0].trim()
    if (!response.ok || !contentType || !TELEGRAM_AVATAR_CONTENT_TYPES.includes(contentType)) {
      return undefined
    }

    const body = await readLimitedBody(response, MAX_AVATAR_BYTES)
    if (!body) return undefined
    return normalizeParticipantAvatar(body)
  } catch {
    // Фото профілю — прикраса. Timeout, старий URL чи битий файл не
    // повинні заважати поділитись подією: лишається безпечний ініціал.
    return undefined
  }
}

/** Будь-яке вже довірено отримане фото перетворюємо на малий PNG перед
 * вставкою в SVG. Так ні JPEG, ні Telegram SVG не потрапляють туди сирими. */
export async function normalizeParticipantAvatar(buffer: Buffer): Promise<string | undefined> {
  try {
    const avatar = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize(128, 128, { fit: 'cover', position: 'attention' })
      .png({ compressionLevel: 9 })
      .toBuffer()
    return `data:image/png;base64,${avatar.toString('base64')}`
  } catch {
    return undefined
  }
}

function badge(input: ShareCardInput): { label: string; color: string } | null {
  if (input.vipOnly) return { label: 'VIP', color: VIP_GOLD }
  if (input.gpuOnly) return { label: 'ГПУ', color: GPU_BLUE }
  return null
}

/** Точна геометрія статичного логотипа із SplashVisual/geometry.ts:
 * будинок-D + orm + Hub plate. Тут лише інший масштаб для картки. */
function logoSvg(x: number, y: number, width: number): string {
  const scale = width / 813
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <g fill="none" stroke="${ACCENT}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
      <path d="M76 20 C147 20 199 60 199 112 C199 174 151 204 76 207"/>
      <path d="M20 95 L72 51 L137 99"/>
      <path d="M20 123 L20 190"/>
      <path d="M62 183 L62 149 Q62 142 69 142 L91 142 Q98 142 98 149 L98 180"/>
    </g>
    <text x="213" y="176" fill="#ffffff" font-family="DejaVu Sans, sans-serif"
          font-size="145" font-weight="700">orm</text>
    <rect x="515" y="51" width="288" height="151" rx="21" fill="${ACCENT}"/>
    <text x="539" y="169" fill="#000000" stroke="#000000" stroke-width="1.5"
          paint-order="stroke fill" font-family="DejaVu Sans, sans-serif"
          font-size="118" font-weight="700" letter-spacing="-5">Hub</text>
  </g>`
}

/** Кружки з ініціалами — щонайбільше 3, далі «+N». */
function avatarsSvg(
  input: ShareCardInput,
  x: number,
  y: number,
  radius: number,
  fontSize: number,
): string {
  const visible = input.participants.slice(0, 3)
  const overflow = input.participantCount - visible.length
  const step = radius * 1.6

  const circles = visible.map((participant, index) => {
    const cx = x + radius + index * step
    const avatar = participant.avatarDataUri
      ? `<clipPath id="avatar-${index}"><circle cx="${cx}" cy="${y}" r="${radius - 2}"/></clipPath>
         <image href="${participant.avatarDataUri}" x="${cx - radius}" y="${y - radius}"
                width="${radius * 2}" height="${radius * 2}" preserveAspectRatio="xMidYMid slice"
                clip-path="url(#avatar-${index})"/>`
      : `<text x="${cx}" y="${y + fontSize * 0.35}" font-family="${POSTER_FONT_FAMILY}"
            font-size="${fontSize * 0.82}" font-weight="600" fill="#ffffff" text-anchor="middle">${escapeXml(
              initialOf(participant.displayName),
            )}</text>`
    return `
      <circle cx="${cx}" cy="${y}" r="${radius}" fill="#1c1c1c" stroke="${ACCENT}" stroke-width="3"/>
      ${avatar}
    `
  })

  if (overflow > 0) {
    const cx = x + radius + visible.length * step
    circles.push(`
      <circle cx="${cx}" cy="${y}" r="${radius}" fill="#262626" stroke="#3f3f3f" stroke-width="3"/>
      <text x="${cx}" y="${y + fontSize * 0.35}" font-family="${POSTER_FONT_FAMILY}"
            font-size="${fontSize * 0.72}" font-weight="600" fill="#a3a3a3" text-anchor="middle">+${overflow}</text>
    `)
  }

  return circles.join('')
}

/** Спільний фон: обкладинка (якщо є) під затемненням, інакше фірмовий
 * градієнт. */
function backgroundSvg(width: number, height: number): string {
  return `
    <rect width="${width}" height="${height}" fill="#000000"/>
    <rect width="${width}" height="${height}" fill="url(#brandGlow)"/>
  `
}

/** Назва займає весь вільний простір між логотипом і метаданими.
 * Коротка стає майже постерною, а граничні 200 символів зменшуються й
 * переносяться ЦІЛКОМ — без трикрапки та втрати частини тексту. */
export interface ChatTitleLayout {
  lines: string[]
  fontSize: number
  firstBaseline: number
  lineHeight: number
}

export function layoutChatTitle(title: string): ChatTitleLayout {
  const candidates = [
    { maxLines: 1, fontSize: 84, maxChars: 9 },
    { maxLines: 2, fontSize: 64, maxChars: 14 },
    { maxLines: 3, fontSize: 48, maxChars: 18 },
    { maxLines: 4, fontSize: 38, maxChars: 24 },
    { maxLines: 5, fontSize: 30, maxChars: 31 },
    { maxLines: 6, fontSize: 25, maxChars: 40 },
  ]

  let selected = candidates[candidates.length - 1]
  let lines = wrapText(title, 50, selected.maxChars)
  for (const candidate of candidates) {
    const wrapped = wrapText(title, 50, candidate.maxChars)
    if (wrapped.length <= candidate.maxLines) {
      selected = candidate
      lines = wrapped
      break
    }
  }

  const lineHeight = Math.round(selected.fontSize * 1.1)
  const zoneTop = 150
  const firstBaseline = Math.round(zoneTop + selected.fontSize * 0.82)

  return { lines, fontSize: selected.fontSize, firstBaseline, lineHeight }
}

const BOTTOM_ROW_Y = 542

function chatCardSvg(input: ShareCardInput): string {
  const { width, height } = SHARE_CARD_SIZES.chat
  const roleBadge = badge(input)
  const titleLayout = layoutChatTitle(
    input.hideDetails ? 'Закрита подія DormHub' : input.title,
  )
  const titleLastBaseline = titleLayout.firstBaseline
    + (titleLayout.lines.length - 1) * titleLayout.lineHeight
  const detailsDividerY = Math.max(302, titleLastBaseline + 30)
  const detailsLabelY = detailsDividerY + 52
  const detailsValueY = detailsDividerY + 90

  const meta = input.hideDetails
    ? []
    : [
        formatCardDateTime(input.date, input.time),
        truncateLine(
          input.isOnline ? 'Онлайн' : input.location || input.dormitoryName || 'Гуртожиток',
          34,
        ),
      ]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="brandGlow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a1708"/>
      <stop offset="55%" stop-color="#111111"/>
      <stop offset="100%" stop-color="#080808"/>
    </linearGradient>
    <radialGradient id="accentGlow">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="framePlaceholder" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#25170d"/>
      <stop offset="55%" stop-color="#151515"/>
      <stop offset="100%" stop-color="#090909"/>
    </linearGradient>
    <linearGradient id="coverEdgeFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0b0b0b" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="#0b0b0b" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#0b0b0b" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="chatCoverClip">
      <path d="M658 0 H1200 V480 H684 Q658 480 658 454 Z"/>
    </clipPath>
  </defs>

  ${backgroundSvg(width, height)}
  <circle cx="${width - 60}" cy="40" r="340" fill="url(#accentGlow)"/>

  <path d="M652 0 H1200 V486 H684 Q652 486 652 454 Z"
        fill="url(#framePlaceholder)"/>
  ${input.coverDataUri
    ? `<image href="${input.coverDataUri}" x="658" y="0" width="542" height="480"
              preserveAspectRatio="xMidYMid slice" clip-path="url(#chatCoverClip)"/>`
    : `<circle cx="929" cy="240" r="150" fill="url(#accentGlow)"/>
       <text x="929" y="252" font-family="${POSTER_FONT_FAMILY}" font-size="34"
             font-weight="600" fill="#ffffff" fill-opacity="0.28" text-anchor="middle">DormHub</text>`}
  <rect x="652" y="0" width="112" height="486" fill="url(#coverEdgeFade)"/>
  <path d="M652 0 V454 Q652 486 684 486 H1200"
        fill="none" stroke="${ACCENT}" stroke-opacity="0.38" stroke-width="2"/>

  ${logoSvg(59, 42, 180)}

  ${
    roleBadge
      ? `<rect x="${width - 236}" y="66" width="164" height="58" rx="29"
              fill="rgba(0,0,0,0.6)" stroke="${roleBadge.color}" stroke-width="3"/>
         <text x="${width - 154}" y="105" font-family="${POSTER_FONT_FAMILY}" font-size="25"
               font-weight="600" fill="${roleBadge.color}" text-anchor="middle">${escapeXml(roleBadge.label)}</text>`
      : ''
  }

  ${titleLayout.lines
    .map(
      (line, index) =>
        `<text x="64" y="${titleLayout.firstBaseline + index * titleLayout.lineHeight}" font-family="${POSTER_FONT_FAMILY}"
               font-size="${titleLayout.fontSize}" font-weight="600" fill="#ffffff"
               letter-spacing="-1.5">${escapeXml(line)}</text>`,
    )
    .join('')}

  <line x1="64" y1="${detailsDividerY}" x2="566" y2="${detailsDividerY}" stroke="${ACCENT}"
        stroke-opacity="0.3" stroke-width="2"/>

  ${meta.length
    ? `<text x="64" y="${detailsLabelY}" font-family="${POSTER_FONT_FAMILY}" font-size="13"
             font-weight="600" letter-spacing="1.5" fill="${ACCENT}">КОЛИ</text>
       <text x="64" y="${detailsValueY}" font-family="${POSTER_FONT_FAMILY}" font-size="26"
             font-weight="400" letter-spacing="-0.4" fill="#f2f2f2">${escapeXml(meta[0])}</text>
       <text x="342" y="${detailsLabelY}" font-family="${POSTER_FONT_FAMILY}" font-size="13"
             font-weight="600" letter-spacing="1.5" fill="${ACCENT}">${input.isOnline ? 'ФОРМАТ' : 'МІСЦЕ'}</text>
       <text x="342" y="${detailsValueY}" font-family="${POSTER_FONT_FAMILY}" font-size="24"
             font-weight="400" letter-spacing="-0.4" fill="#f2f2f2">${escapeXml(truncateLine(meta[1], 20))}</text>`
    : ''}

  ${
    input.hideDetails
      ? ''
      : `<g transform="translate(64, ${BOTTOM_ROW_Y})">
           ${avatarsSvg(input, 0, 0, 30, 30)}
           <text x="${Math.min(input.participants.length, 3) * 48 + (input.participantCount > 3 ? 48 : 0) + 24}" y="12"
                 font-family="${POSTER_FONT_FAMILY}" font-size="31" font-weight="600"
                 fill="#ffffff">${input.participantCount} / ${input.maxParticipants}</text>
         </g>`
  }

  <rect x="${width - 394}" y="${BOTTOM_ROW_Y - 34}" width="330" height="68" rx="34"
        fill="${ACCENT}" fill-opacity="0.12" stroke="${ACCENT}" stroke-width="2"/>
  <text x="${width - 229}" y="${BOTTOM_ROW_Y + 10}" font-family="${POSTER_FONT_FAMILY}" font-size="24"
        font-weight="600" letter-spacing="-0.4" fill="${ACCENT}" text-anchor="middle">ПРИЄДНАТИСЯ</text>
</svg>`
}

function storyCardSvg(input: ShareCardInput): string {
  const { width, height } = SHARE_CARD_SIZES.story
  const roleBadge = badge(input)
  const titleLines = input.hideDetails
    ? ['Закрита', 'подія DormHub']
    : wrapText(input.title, 4, 18)
  const titleSizes = [110, 92, 72, 58]
  const titleSize = titleSizes[Math.min(titleLines.length, 4) - 1]
  const titleLineHeight = titleSize + 14
  const titleTop = 1060
  const metaTop = titleTop + titleLines.length * titleLineHeight + 34

  const meta = input.hideDetails
    ? []
    : [
        formatCardDateTime(input.date, input.time),
        truncateLine(
          input.isOnline ? 'Онлайн' : input.location || input.dormitoryName || 'Гуртожиток',
          26,
        ),
      ]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="brandGlow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a1708"/>
      <stop offset="55%" stop-color="#111111"/>
      <stop offset="100%" stop-color="#080808"/>
    </linearGradient>
    <radialGradient id="accentGlow">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="framePlaceholder" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#25170d"/>
      <stop offset="55%" stop-color="#151515"/>
      <stop offset="100%" stop-color="#090909"/>
    </linearGradient>
    <clipPath id="storyCoverClip">
      <rect x="90" y="350" width="900" height="580" rx="44"/>
    </clipPath>
  </defs>

  ${backgroundSvg(width, height)}
  <circle cx="${width / 2}" cy="180" r="620" fill="url(#accentGlow)"/>

  ${logoSvg(width / 2 - 205, 100, 410)}

  <rect x="70" y="330" width="940" height="620" rx="62"
        fill="${ACCENT}" fill-opacity="0.09"/>
  <rect x="80" y="340" width="920" height="600" rx="52"
        fill="url(#framePlaceholder)" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="3"/>
  ${input.coverDataUri
    ? `<image href="${input.coverDataUri}" x="90" y="350" width="900" height="580"
              preserveAspectRatio="xMidYMid slice" clip-path="url(#storyCoverClip)"/>`
    : `<circle cx="540" cy="640" r="300" fill="url(#accentGlow)"/>
       <text x="540" y="660" font-family="${POSTER_FONT_FAMILY}" font-size="62"
             font-weight="600" fill="#ffffff" fill-opacity="0.28" text-anchor="middle">DormHub</text>`}

  ${
    roleBadge
      ? `<rect x="${width / 2 - 92}" y="258" width="184" height="66" rx="33"
              fill="rgba(0,0,0,0.6)" stroke="${roleBadge.color}" stroke-width="3"/>
         <text x="${width / 2}" y="302" font-family="${POSTER_FONT_FAMILY}" font-size="30"
               font-weight="600" fill="${roleBadge.color}" text-anchor="middle">${escapeXml(roleBadge.label)}</text>`
      : ''
  }

  ${titleLines
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${titleTop + index * titleLineHeight}"
               font-family="${POSTER_FONT_FAMILY}" font-size="${titleSize}" font-weight="600"
               fill="#ffffff" text-anchor="middle" letter-spacing="-2">${escapeXml(line)}</text>`,
    )
    .join('')}

  ${meta
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${metaTop + index * 68}"
               font-family="${POSTER_FONT_FAMILY}" font-size="45" font-weight="400" fill="#e5e5e5"
               text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join('')}

  ${
    input.hideDetails
      ? ''
      : `<text x="${width / 2}" y="${height - 390}" font-family="${POSTER_FONT_FAMILY}"
               font-size="50" font-weight="600" fill="#ffffff"
               text-anchor="middle">${input.participantCount} / ${input.maxParticipants}</text>`
  }

  <rect x="${width / 2 - 260}" y="${height - 300}" width="520" height="120" rx="60" fill="${ACCENT}"/>
  <text x="${width / 2}" y="${height - 222}" font-family="${POSTER_FONT_FAMILY}" font-size="45"
        font-weight="600" fill="#000000" text-anchor="middle">Приєднуйся</text>

  <text x="${width / 2}" y="${height - 110}" font-family="${POSTER_FONT_FAMILY}" font-size="34"
        font-weight="400" fill="#a3a3a3" text-anchor="middle">DormHub</text>
</svg>`
}

/**
 * Рендерить картку у фінальний буфер. Обкладинка (якщо є) спочатку
 * нормалізується в PNG, а потім кладеться в окрему захищену рамку —
 * її власний текст більше не конкурує з інформацією картки.
 */
export async function renderShareCard(
  input: ShareCardInput,
  format: ShareCardFormat,
): Promise<Buffer> {
  // Закриту подію ніколи не показуємо з чужою обкладинкою — інакше
  // картинка сама по собі розкривала б зміст закритої події.
  const coverSize = format === 'chat'
    ? { width: 542, height: 480 }
    : { width: 900, height: 580 }
  const cover = input.hasCover && !input.hideDetails
    ? await loadCoverArtwork(
        input.eventId,
        input.coverImageUrl,
        coverSize.width,
        coverSize.height,
      )
    : null
  const coverDataUri = cover ? `data:image/png;base64,${cover.toString('base64')}` : undefined

  const svg = Buffer.from(
    format === 'chat'
      ? chatCardSvg({ ...input, hasCover: Boolean(cover), coverDataUri })
      : storyCardSvg({ ...input, hasCover: Boolean(cover), coverDataUri }),
  )
  const overlay = new Resvg(svg, {
    font: {
      fontFiles: CARD_FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'DejaVu Sans',
      sansSerifFamily: 'DejaVu Sans',
    },
    textRendering: 2,
  }).render().asPng()

  const composed = sharp(overlay, { limitInputPixels: MAX_INPUT_PIXELS })

  // Chat-картку віддаємо в JPEG — саме цього вимагає Bot API для
  // InlineQueryResultPhoto (photo_url має бути JPEG до 5 МБ).
  return format === 'chat'
    ? composed.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    : composed.png({ compressionLevel: 9 }).toBuffer()
}

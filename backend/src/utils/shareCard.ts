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
]

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

/** Обкладинка як фон картки, або null якщо файлу нема / він побитий. */
async function loadCoverBackground(
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
    const avatar = await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize(128, 128, { fit: 'cover', position: 'attention' })
      .png({ compressionLevel: 9 })
      .toBuffer()
    return `data:image/png;base64,${avatar.toString('base64')}`
  } catch {
    // Фото профілю — прикраса. Timeout, старий URL чи битий файл не
    // повинні заважати поділитись подією: лишається безпечний ініціал.
    return undefined
  }
}

function badge(input: ShareCardInput): { label: string; color: string } | null {
  if (input.vipOnly) return { label: 'VIP', color: VIP_GOLD }
  if (input.gpuOnly) return { label: 'ГПУ', color: GPU_BLUE }
  return null
}

/** Логотип DormHub — той самий вигляд, що й на головній: «dorm» плюс
 * «hub» у помаранчевому прямокутнику. Малюється вручну, щоб не тягнути
 * зовнішній файл шрифта чи картинки. */
function logoSvg(x: number, y: number, scale = 1): string {
  const fontSize = 34 * scale
  const boxWidth = 78 * scale
  const boxHeight = 48 * scale
  const radius = 12 * scale
  const boxX = x + 102 * scale
  const boxY = y - 36 * scale
  return `
    <text x="${x}" y="${y}" font-family="DejaVu Sans, sans-serif" font-size="${fontSize}"
          font-weight="800" fill="#ffffff" letter-spacing="-1">dorm</text>
    <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}"
          rx="${radius}" fill="${ACCENT}"/>
    <text x="${boxX + boxWidth / 2}" y="${y}" font-family="DejaVu Sans, sans-serif" font-size="${fontSize}"
          font-weight="800" fill="#000000" letter-spacing="-1" text-anchor="middle">hub</text>
  `
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
      : `<text x="${cx}" y="${y + fontSize * 0.35}" font-family="DejaVu Sans, sans-serif"
            font-size="${fontSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(
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
      <text x="${cx}" y="${y + fontSize * 0.35}" font-family="DejaVu Sans, sans-serif"
            font-size="${fontSize}" font-weight="700" fill="#a3a3a3" text-anchor="middle">+${overflow}</text>
    `)
  }

  return circles.join('')
}

/** Спільний фон: обкладинка (якщо є) під затемненням, інакше фірмовий
 * градієнт. */
function backgroundSvg(width: number, height: number, hasCover: boolean): string {
  const brandGradient = `
    <rect width="${width}" height="${height}" fill="#000000"/>
    <rect width="${width}" height="${height}" fill="url(#brandGlow)"/>
  `
  return hasCover ? '' : brandGradient
}

/**
 * Фіксована вертикальна сітка chat-картки. Позиції задані явними
 * константами, а не «від попереднього блока»: інакше зайвий рядок назви
 * зсував би все нижче й наїжджав на ряд з аватарками (саме це й ловив
 * візуальний прогін). Тепер довжина назви на решту макета не впливає.
 */
const TITLE_TOP = 210
const META_TOP = 420
const BOTTOM_ROW_Y = 556

function chatCardSvg(input: ShareCardInput): string {
  const { width, height } = SHARE_CARD_SIZES.chat
  const roleBadge = badge(input)
  // Максимум 2 рядки назви: нижче йдуть дата, місце й рядок учасників,
  // і третій рядок заголовка наїжджав би на них.
  const titleLines = input.hideDetails
    ? ['Закрита подія DormHub']
    : wrapText(input.title, 2, 24)
  const titleSize = titleLines.length >= 2 ? 68 : 78

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
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.72)"/>
      <stop offset="45%" stop-color="rgba(0,0,0,0.55)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.95)"/>
    </linearGradient>
  </defs>

  ${backgroundSvg(width, height, input.hasCover)}
  <rect width="${width}" height="${height}" fill="url(#scrim)"/>
  <circle cx="${width - 60}" cy="40" r="340" fill="url(#accentGlow)"/>

  ${logoSvg(72, 108)}

  ${
    roleBadge
      ? `<rect x="${width - 236}" y="66" width="164" height="58" rx="29"
              fill="rgba(0,0,0,0.6)" stroke="${roleBadge.color}" stroke-width="3"/>
         <text x="${width - 154}" y="105" font-family="DejaVu Sans, sans-serif" font-size="30"
               font-weight="800" fill="${roleBadge.color}" text-anchor="middle">${escapeXml(roleBadge.label)}</text>`
      : ''
  }

  ${titleLines
    .map(
      (line, index) =>
        `<text x="${width - 72}" y="${TITLE_TOP + index * (titleSize + 12)}" font-family="DejaVu Sans, sans-serif"
               font-size="${titleSize}" font-weight="800" fill="#ffffff" letter-spacing="-2"
               text-anchor="end">${escapeXml(line)}</text>`,
    )
    .join('')}

  ${meta
    .map(
      (line, index) =>
        `<text x="72" y="${META_TOP + index * 52}" font-family="DejaVu Sans, sans-serif"
               font-size="40" fill="#e5e5e5">${escapeXml(line)}</text>`,
    )
    .join('')}

  ${
    input.hideDetails
      ? ''
      : `<g transform="translate(72, ${BOTTOM_ROW_Y})">
           ${avatarsSvg(input, 0, 0, 30, 30)}
           <text x="${Math.min(input.participants.length, 3) * 48 + (input.participantCount > 3 ? 48 : 0) + 24}" y="12"
                 font-family="DejaVu Sans, sans-serif" font-size="38" font-weight="700"
                 fill="#ffffff">${input.participantCount} / ${input.maxParticipants}</text>
         </g>`
  }

  <text x="${width - 72}" y="${BOTTOM_ROW_Y + 12}" font-family="DejaVu Sans, sans-serif" font-size="34"
        font-weight="700" fill="${ACCENT}" text-anchor="end">Приєднуйся в DormHub</text>
</svg>`
}

function storyCardSvg(input: ShareCardInput): string {
  const { width, height } = SHARE_CARD_SIZES.story
  const roleBadge = badge(input)
  const titleLines = input.hideDetails
    ? ['Закрита', 'подія DormHub']
    : wrapText(input.title, 4, 18)
  const titleSize = titleLines.length >= 4 ? 92 : 104
  const titleTop = 560

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
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.55)"/>
      <stop offset="40%" stop-color="rgba(0,0,0,0.35)"/>
      <stop offset="72%" stop-color="rgba(0,0,0,0.88)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.97)"/>
    </linearGradient>
  </defs>

  ${backgroundSvg(width, height, input.hasCover)}
  <rect width="${width}" height="${height}" fill="url(#scrim)"/>
  <circle cx="${width / 2}" cy="180" r="620" fill="url(#accentGlow)"/>

  ${logoSvg(width / 2 - 86, 220, 1.05)}

  ${
    roleBadge
      ? `<rect x="${width / 2 - 92}" y="286" width="184" height="66" rx="33"
              fill="rgba(0,0,0,0.6)" stroke="${roleBadge.color}" stroke-width="3"/>
         <text x="${width / 2}" y="330" font-family="DejaVu Sans, sans-serif" font-size="34"
               font-weight="800" fill="${roleBadge.color}" text-anchor="middle">${escapeXml(roleBadge.label)}</text>`
      : ''
  }

  ${titleLines
    .map(
      (line, index) =>
        `<text x="${width - 72}" y="${titleTop + index * (titleSize + 16)}"
               font-family="DejaVu Sans, sans-serif" font-size="${titleSize}" font-weight="800"
               fill="#ffffff" text-anchor="end" letter-spacing="-2">${escapeXml(line)}</text>`,
    )
    .join('')}

  ${meta
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${
          titleTop + 70 + titleLines.length * (titleSize + 16) + index * 68
        }" font-family="DejaVu Sans, sans-serif" font-size="52" fill="#e5e5e5"
               text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join('')}

  ${
    input.hideDetails
      ? ''
      : `<text x="${width / 2}" y="${height - 420}" font-family="DejaVu Sans, sans-serif"
               font-size="56" font-weight="700" fill="#ffffff"
               text-anchor="middle">${input.participantCount} / ${input.maxParticipants}</text>`
  }

  <rect x="${width / 2 - 260}" y="${height - 330}" width="520" height="120" rx="60" fill="${ACCENT}"/>
  <text x="${width / 2}" y="${height - 252}" font-family="DejaVu Sans, sans-serif" font-size="52"
        font-weight="800" fill="#000000" text-anchor="middle">Приєднуйся</text>

  <text x="${width / 2}" y="${height - 150}" font-family="DejaVu Sans, sans-serif" font-size="38"
        fill="#a3a3a3" text-anchor="middle">DormHub</text>
</svg>`
}

/**
 * Рендерить картку у фінальний буфер. Обкладинка (якщо є) кладеться
 * знизу як растр, зверху — SVG-шар із затемненням і текстом.
 */
export async function renderShareCard(
  input: ShareCardInput,
  format: ShareCardFormat,
): Promise<Buffer> {
  const { width, height } = SHARE_CARD_SIZES[format]
  // Закриту подію ніколи не показуємо з чужою обкладинкою — інакше
  // картинка сама по собі розкривала б зміст закритої події.
  const cover = input.hasCover && !input.hideDetails
    ? await loadCoverBackground(input.eventId, input.coverImageUrl, width, height)
    : null

  const svg = Buffer.from(
    format === 'chat'
      ? chatCardSvg({ ...input, hasCover: Boolean(cover) })
      : storyCardSvg({ ...input, hasCover: Boolean(cover) }),
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

  const composed = cover
    ? sharp(cover, { limitInputPixels: MAX_INPUT_PIXELS }).composite([
        { input: overlay, top: 0, left: 0 },
      ])
    : sharp(overlay, { limitInputPixels: MAX_INPUT_PIXELS })

  // Chat-картку віддаємо в JPEG — саме цього вимагає Bot API для
  // InlineQueryResultPhoto (photo_url має бути JPEG до 5 МБ).
  return format === 'chat'
    ? composed.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    : composed.png({ compressionLevel: 9 }).toBuffer()
}

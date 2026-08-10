import { mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, relative, resolve, sep } from 'node:path'
import sharp from 'sharp'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'

/** Content-Type, які взагалі приймає express.raw на маршрутах завантаження. */
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Ліміт тіла запиту (express.raw). Перевищення → 413 від самого Express. */
export const MAX_IMAGE_UPLOAD_BYTES = '5mb'

/** Довша сторона результату. Обкладинка показується максимум на всю
 * ширину екрана телефона — 2000px із запасом вистачає і для 3x DPR. */
export const MAX_IMAGE_DIMENSION = 2000

/**
 * Стеля для декодера. Захищає від «декомпресійних бомб»: файл на кілька
 * сотень кілобайт може розпакуватись у 30000×30000 (900 Мпікс) і з'їсти
 * усю пам'ять процесу. 50 Мпікс — це вже більше за будь-яку камеру
 * телефона, тож нормальні фото не зачіпає.
 */
export const MAX_INPUT_PIXELS = 50_000_000

/** Канонічне ім'я файлу після обробки. */
const CANONICAL_BASENAME = 'cover'
const CANONICAL_EXTENSION = 'webp'
/** Розширення, під якими могли зберігатись обкладинки раніше. */
const LEGACY_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

type ImageFormat = 'jpeg' | 'png' | 'webp'

const CONTENT_TYPE_TO_FORMAT: Record<string, ImageFormat> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function unsupported(): AppError {
  // Однакове повідомлення для «не той тип», «підроблений заголовок» і
  // «побитий файл» — користувачу корисна лише дія, а деталі того, що
  // саме не збіглося, назовні не потрібні.
  return new AppError(
    415,
    'IMAGE_TYPE_UNSUPPORTED',
    'Підтримуються лише справжні зображення JPG, PNG або WebP',
  )
}

/**
 * Формат за сигнатурою вмісту, а не за заголовком запиту. Саме це
 * відрізняє реальний JPEG від HTML/SVG/чого завгодно, надісланого з
 * `Content-Type: image/jpeg`.
 */
export function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png'
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

/** Не дає піти вище UPLOADS_DIR, навіть якщо колись у relativeDir
 * потрапить щось несподіване. Викликачі передають лише UUID, тож це
 * другий рубіж, а не єдиний. */
function resolveInsideUploads(relativePath: string): string {
  const root = resolve(env.UPLOADS_DIR)
  const target = resolve(root, relativePath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.startsWith(sep) || resolve(root, rel) !== target) {
    throw new AppError(400, 'INVALID_UPLOAD_PATH', 'Некоректний шлях завантаження')
  }
  return target
}

/**
 * Повний шлях зображення: перевірка → нормалізація → атомарний запис.
 *
 * Вихід завжди один канонічний файл `<relativeDir>/cover.webp`:
 *  - EXIF (разом із GPS-координатами) не переноситься — sharp не копіює
 *    метадані, якщо явно не попросити .withMetadata();
 *  - .rotate() без аргументів застосовує EXIF-орієнтацію до пікселів,
 *    тож фото з телефона не лягає боком після втрати метаданих;
 *  - розмір обмежується без збільшення маленьких картинок.
 *
 * Ім'я файлу цілком серверне: клієнт не впливає ні на розширення, ні на
 * назву. Повертається URL із версією (?v=), бо /uploads кешується, а
 * шлях між завантаженнями не змінюється.
 */
export async function processAndStoreImage(
  relativeDir: string,
  buffer: Buffer,
  declaredContentType: string,
): Promise<string> {
  const declaredFormat = CONTENT_TYPE_TO_FORMAT[declaredContentType.split(';')[0].trim()]
  if (!declaredFormat) throw unsupported()

  const actualFormat = detectImageFormat(buffer)
  if (!actualFormat || actualFormat !== declaredFormat) throw unsupported()

  let processed: Buffer
  try {
    processed = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    // Побите зображення, «бомба» понад limitInputPixels, або валідна
    // сигнатура з обрізаним тілом.
    throw unsupported()
  }

  const relativePath = `${relativeDir}/${CANONICAL_BASENAME}.${CANONICAL_EXTENSION}`
  const fullPath = resolveInsideUploads(relativePath)
  await mkdir(dirname(fullPath), { recursive: true })

  // Пишемо в тимчасовий файл поруч і перейменовуємо: читач ніколи не
  // побачить напівзаписану обкладинку, а невдача не лишає сміття.
  const tempPath = `${fullPath}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, processed)
    await rename(tempPath, fullPath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {})
    throw error
  }

  await removeLegacyCovers(relativeDir, relativePath)

  return `${env.PUBLIC_URL}/uploads/${relativePath}?v=${Date.now()}`
}

/** Прибирає обкладинки в старих форматах, щоб заміна фото не лишала
 * попередню версію лежати на диску назавжди. */
async function removeLegacyCovers(relativeDir: string, keepRelativePath: string): Promise<void> {
  await Promise.all(
    LEGACY_EXTENSIONS.map(async (extension) => {
      const candidate = `${relativeDir}/${CANONICAL_BASENAME}.${extension}`
      if (candidate === keepRelativePath) return
      try {
        await unlink(resolveInsideUploads(candidate))
      } catch {
        // Файлу такого формату просто не було — це нормальний випадок.
      }
    }),
  )
}


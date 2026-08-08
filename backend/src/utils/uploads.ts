import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { env } from '../config/env'

export const IMAGE_EXTENSIONS_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Записує файл на диск (Railway Volume у продакшні, звичайна папка
 * локально) і повертає публічний URL, під яким express.static його
 * роздає — див. app.use('/uploads', ...) в app.ts. */
export async function saveUpload(relativePath: string, buffer: Buffer): Promise<string> {
  const fullPath = join(env.UPLOADS_DIR, relativePath)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, buffer)
  return `${env.PUBLIC_URL}/uploads/${relativePath}`
}

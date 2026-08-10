import { TEST_UPLOADS_DIR } from './testEnv'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  MAX_IMAGE_DIMENSION,
  detectImageFormat,
  processAndStoreImage,
} from '../utils/uploads'
import { AppError } from '../utils/AppError'

/**
 * VULN-004. Перевіряється справжній конвеєр processAndStoreImage —
 * реальні зображення, реальний запис на диск у тимчасову теку
 * (TEST_UPLOADS_DIR), реальний sharp.
 */

async function makeImage(
  format: 'jpeg' | 'png' | 'webp',
  width = 64,
  height = 48,
): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 130, b: 210 } },
  })
  if (format === 'jpeg') return base.jpeg().toBuffer()
  if (format === 'png') return base.png().toBuffer()
  return base.webp().toBuffer()
}

async function expectUnsupported(promise: Promise<unknown>, label: string): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => {
      assert.ok(error instanceof AppError, `${label}: expected AppError`)
      assert.equal(error.status, 415, `${label}: expected 415`)
      assert.equal(error.code, 'IMAGE_TYPE_UNSUPPORTED')
      return true
    },
    label,
  )
}

describe('image signature detection', () => {
  it('recognises real JPEG, PNG and WebP payloads', async () => {
    assert.equal(detectImageFormat(await makeImage('jpeg')), 'jpeg')
    assert.equal(detectImageFormat(await makeImage('png')), 'png')
    assert.equal(detectImageFormat(await makeImage('webp')), 'webp')
  })

  it('rejects text, HTML and SVG regardless of what the header claims', () => {
    assert.equal(detectImageFormat(Buffer.from('just text')), null)
    assert.equal(detectImageFormat(Buffer.from('<html><script>alert(1)</script></html>')), null)
    assert.equal(
      detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
      null,
    )
  })
})

describe('processAndStoreImage', () => {
  it('accepts a real JPEG and stores a canonical cover.webp', async () => {
    const dir = 'evt-jpeg'
    const url = await processAndStoreImage(dir, await makeImage('jpeg'), 'image/jpeg')

    assert.match(url, /\/uploads\/evt-jpeg\/cover\.webp\?v=\d+$/)
    const stored = await readFile(join(TEST_UPLOADS_DIR, dir, 'cover.webp'))
    assert.equal((await sharp(stored).metadata()).format, 'webp')
  })

  it('accepts a real PNG', async () => {
    const url = await processAndStoreImage('evt-png', await makeImage('png'), 'image/png')
    assert.match(url, /cover\.webp/)
  })

  it('accepts a real WebP', async () => {
    const url = await processAndStoreImage('evt-webp', await makeImage('webp'), 'image/webp')
    assert.match(url, /cover\.webp/)
  })

  it('rejects text sent with Content-Type: image/jpeg', async () => {
    await expectUnsupported(
      processAndStoreImage('evt-text', Buffer.from('definitely not a jpeg'), 'image/jpeg'),
      'plain text',
    )
  })

  it('rejects an SVG sent as an image', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    )
    await expectUnsupported(processAndStoreImage('evt-svg', svg, 'image/png'), 'svg as png')
  })

  it('rejects HTML disguised behind an image Content-Type', async () => {
    const html = Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>')
    await expectUnsupported(processAndStoreImage('evt-html', html, 'image/webp'), 'html as webp')
  })

  it('rejects a real PNG declared as JPEG (header/content mismatch)', async () => {
    await expectUnsupported(
      processAndStoreImage('evt-mismatch', await makeImage('png'), 'image/jpeg'),
      'png declared as jpeg',
    )
  })

  it('rejects a corrupted image with a valid signature', async () => {
    const jpeg = await makeImage('jpeg')
    // Правильна сигнатура, обрізане й зіпсоване тіло.
    const corrupted = Buffer.concat([jpeg.subarray(0, 16), Buffer.alloc(200, 0xab)])
    await expectUnsupported(
      processAndStoreImage('evt-corrupt', corrupted, 'image/jpeg'),
      'corrupted jpeg',
    )
  })

  it('rejects an unknown Content-Type outright', async () => {
    await expectUnsupported(
      processAndStoreImage('evt-svgtype', await makeImage('png'), 'image/svg+xml'),
      'svg content type',
    )
  })

  it('strips EXIF (including GPS) from the stored image', async () => {
    const withExif = await sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .withExif({
        IFD0: { Software: 'DormHubExifProbe' },
        IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
      })
      .toBuffer()

    // Переконуємось, що вхід справді ніс EXIF — інакше тест був би
    // порожнім і завжди «зеленим».
    const inputMeta = await sharp(withExif).metadata()
    assert.ok(inputMeta.exif, 'fixture must carry EXIF')
    assert.ok(inputMeta.exif.toString('latin1').includes('DormHubExifProbe'))

    await processAndStoreImage('evt-exif', withExif, 'image/jpeg')

    const stored = await readFile(join(TEST_UPLOADS_DIR, 'evt-exif', 'cover.webp'))
    const outputMeta = await sharp(stored).metadata()
    assert.equal(outputMeta.exif, undefined, 'stored image must not carry EXIF')
    assert.equal(stored.toString('latin1').includes('DormHubExifProbe'), false)
  })

  it('caps oversized images and never enlarges small ones', async () => {
    const huge = await makeImage('jpeg', 3200, 2400)
    await processAndStoreImage('evt-big', huge, 'image/jpeg')
    const bigMeta = await sharp(
      await readFile(join(TEST_UPLOADS_DIR, 'evt-big', 'cover.webp')),
    ).metadata()
    assert.equal(bigMeta.width, MAX_IMAGE_DIMENSION)
    assert.ok((bigMeta.height ?? 0) <= MAX_IMAGE_DIMENSION)

    await processAndStoreImage('evt-small', await makeImage('png', 32, 24), 'image/png')
    const smallMeta = await sharp(
      await readFile(join(TEST_UPLOADS_DIR, 'evt-small', 'cover.webp')),
    ).metadata()
    assert.equal(smallMeta.width, 32)
    assert.equal(smallMeta.height, 24)
  })

  it('removes a previous cover in a legacy format when the photo is replaced', async () => {
    const dir = 'evt-legacy'
    await mkdir(join(TEST_UPLOADS_DIR, dir), { recursive: true })
    const legacyPath = join(TEST_UPLOADS_DIR, dir, 'cover.jpg')
    await writeFile(legacyPath, await makeImage('jpeg'))
    assert.ok(existsSync(legacyPath))

    await processAndStoreImage(dir, await makeImage('png'), 'image/png')

    assert.equal(existsSync(legacyPath), false, 'legacy cover.jpg must be deleted')
    assert.ok(existsSync(join(TEST_UPLOADS_DIR, dir, 'cover.webp')))
  })

  it('leaves no temporary files behind, on success or on rejection', async () => {
    const dir = 'evt-temp'
    await processAndStoreImage(dir, await makeImage('jpeg'), 'image/jpeg')
    await expectUnsupported(
      processAndStoreImage(dir, Buffer.from('garbage'), 'image/jpeg'),
      'rejected replacement',
    )

    const entries = await readdir(join(TEST_UPLOADS_DIR, dir))
    assert.deepEqual(entries, ['cover.webp'])
  })

  it('refuses a path that would escape the uploads directory', async () => {
    await assert.rejects(
      processAndStoreImage('../../escape', await makeImage('png'), 'image/png'),
      (error: unknown) => error instanceof AppError && error.code === 'INVALID_UPLOAD_PATH',
    )
  })
})

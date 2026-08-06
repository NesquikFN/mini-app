import { createHmac } from 'node:crypto'

/**
 * Signs fields exactly as a real Telegram client would, so tests exercise
 * the same data-check-string / HMAC algorithm the service implements —
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function buildValidInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  const params = new URLSearchParams({ ...fields, hash })
  return params.toString()
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function telegramUserField(id: number, firstName: string, username?: string): string {
  return JSON.stringify({ id, first_name: firstName, username })
}

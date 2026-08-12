import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/** RTL прибирає за собою автоматично лише з globals: true — тут це
 * робиться явно, щоб DOM не протікав між тестами. */
afterEach(() => {
  cleanup()
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildMiniAppDeepLink } from './telegram-notifications.service'

describe('buildMiniAppDeepLink', () => {
  it('includes the short name for a named Direct Mini App', () => {
    assert.equal(
      buildMiniAppDeepLink('DormHubBot', 'event_123', 'dormhub'),
      'https://t.me/DormHubBot/dormhub?startapp=event_123',
    )
  })

  it('uses the Main Mini App link when no short name is configured', () => {
    assert.equal(
      buildMiniAppDeepLink('DormHubBot', 'event_123', ''),
      'https://t.me/DormHubBot?startapp=event_123',
    )
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { updateNotificationSettingsSchema } from './notification-settings.schemas'

describe('updateNotificationSettingsSchema', () => {
  it('accepts a single field', () => {
    assert.equal(updateNotificationSettingsSchema.safeParse({ newEventsEnabled: false }).success, true)
  })

  it('accepts all three fields at once', () => {
    const result = updateNotificationSettingsSchema.safeParse({
      newEventsEnabled: true,
      joinConfirmationEnabled: false,
      organizerJoinEnabled: true,
    })
    assert.equal(result.success, true)
  })

  it('rejects an empty body', () => {
    assert.equal(updateNotificationSettingsSchema.safeParse({}).success, false)
  })

  it('rejects a non-boolean value', () => {
    assert.equal(updateNotificationSettingsSchema.safeParse({ newEventsEnabled: 'yes' }).success, false)
  })
})

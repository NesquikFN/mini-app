import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canRemoveAdmin } from './admin.service'

describe('canRemoveAdmin', () => {
  it('blocks removal when only one admin remains', () => {
    assert.equal(canRemoveAdmin(1), false)
  })

  it('blocks removal when there are somehow zero admins', () => {
    assert.equal(canRemoveAdmin(0), false)
  })

  it('allows removal when more than one admin remains', () => {
    assert.equal(canRemoveAdmin(2), true)
    assert.equal(canRemoveAdmin(5), true)
  })
})

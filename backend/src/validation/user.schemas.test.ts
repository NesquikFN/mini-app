import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { updateMeSchema } from './user.schemas'

describe('updateMeSchema profile fields', () => {
  it('normalizes an Instagram profile URL to a username', () => {
    const result = updateMeSchema.parse({
      nickname: '  Лис  ',
      instagram: 'https://instagram.com/dorm.hub/',
      bio: '  Люблю настільні ігри  ',
      age: 19,
    })

    assert.equal(result.nickname, 'Лис')
    assert.equal(result.instagram, 'dorm.hub')
    assert.equal(result.bio, 'Люблю настільні ігри')
    assert.equal(result.age, 19)
  })

  it('allows profile fields to be cleared', () => {
    const result = updateMeSchema.parse({ nickname: '', instagram: '', bio: '', age: null })
    assert.deepEqual(
      { nickname: result.nickname, instagram: result.instagram, bio: result.bio, age: result.age },
      { nickname: null, instagram: null, bio: null, age: null },
    )
  })

  it('rejects invalid profile values', () => {
    assert.throws(() => updateMeSchema.parse({ instagram: 'not an @handle!' }))
    assert.throws(() => updateMeSchema.parse({ age: 12 }))
  })
})

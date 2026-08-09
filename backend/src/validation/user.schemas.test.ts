import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { submitRegistrationSchema, updateMeSchema } from './user.schemas'

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

describe('submitRegistrationSchema', () => {
  const valid = { age: 19, faculty: 'Факультет інформатики' }

  it('accepts a minimal valid submission (instagram/bio optional)', () => {
    const result = submitRegistrationSchema.parse(valid)
    assert.equal(result.age, 19)
    assert.equal(result.faculty, 'Факультет інформатики')
  })

  it('rejects age under 13', () => {
    assert.throws(() => submitRegistrationSchema.parse({ ...valid, age: 12 }))
  })

  it('rejects age over 120', () => {
    assert.throws(() => submitRegistrationSchema.parse({ ...valid, age: 121 }))
  })

  it('accepts the age boundaries 13 and 120', () => {
    assert.equal(submitRegistrationSchema.parse({ ...valid, age: 13 }).age, 13)
    assert.equal(submitRegistrationSchema.parse({ ...valid, age: 120 }).age, 120)
  })

  it('requires age to be present', () => {
    assert.throws(() => submitRegistrationSchema.parse({ faculty: 'Факультет' }))
  })

  it('requires faculty to be present and non-trivial', () => {
    assert.throws(() => submitRegistrationSchema.parse({ age: 19 }))
    assert.throws(() => submitRegistrationSchema.parse({ age: 19, faculty: 'A' }))
    assert.throws(() => submitRegistrationSchema.parse({ age: 19, faculty: '  ' }))
  })

  it('rejects a faculty name longer than 100 characters', () => {
    assert.throws(() =>
      submitRegistrationSchema.parse({ age: 19, faculty: 'A'.repeat(101) }))
  })

  it('trims faculty whitespace', () => {
    const result = submitRegistrationSchema.parse({ ...valid, faculty: '  Факультет  ' })
    assert.equal(result.faculty, 'Факультет')
  })

  it('normalizes an Instagram URL or @handle to a bare username', () => {
    assert.equal(
      submitRegistrationSchema.parse({ ...valid, instagram: '@dorm.hub' }).instagram,
      'dorm.hub',
    )
    assert.equal(
      submitRegistrationSchema.parse({ ...valid, instagram: 'https://instagram.com/dorm.hub/' }).instagram,
      'dorm.hub',
    )
  })

  it('rejects an invalid Instagram value', () => {
    assert.throws(() => submitRegistrationSchema.parse({ ...valid, instagram: 'not an handle!' }))
  })

  it('leaves instagram/bio undefined when omitted (not forced null)', () => {
    const result = submitRegistrationSchema.parse(valid)
    assert.equal(result.instagram, undefined)
    assert.equal(result.bio, undefined)
  })

  it('rejects a bio longer than 500 characters', () => {
    assert.throws(() => submitRegistrationSchema.parse({ ...valid, bio: 'A'.repeat(501) }))
  })

  it('ignores a client-supplied registrationStatus instead of trusting it', () => {
    // Це і є "захист від самостійного виставлення статусу": zod відкидає
    // невідомі поля за замовчуванням, тож навіть спроба надіслати
    // registrationStatus: 'approved' в тілі запиту ніяк не впливає на
    // результат — у розібраному об'єкті цього поля просто нема.
    const result = submitRegistrationSchema.parse({
      ...valid,
      registrationStatus: 'approved',
    }) as Record<string, unknown>
    assert.equal('registrationStatus' in result, false)
  })
})

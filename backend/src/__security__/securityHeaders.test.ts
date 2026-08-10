import './testEnv'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { app } from '../app'

/** VULN-007. */
describe('backend security headers', () => {
  it('sets the baseline headers on API responses', async () => {
    const res = await request(app).get('/api/health')

    assert.equal(res.status, 200)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['referrer-policy'], 'no-referrer')
    assert.equal(res.headers['x-frame-options'], 'DENY')
    assert.match(res.headers['permissions-policy'], /geolocation=\(\)/)
  })

  it('marks private API responses as non-cacheable', async () => {
    const res = await request(app).get('/api/me')
    // 401 без токена — заголовок кешування має стояти незалежно від коду.
    assert.equal(res.headers['cache-control'], 'no-store')
  })

  it('does not leak the server banner', async () => {
    const res = await request(app).get('/api/health')
    assert.equal(res.headers['x-powered-by'], undefined)
  })

  it('keeps CORS restricted to the configured frontend origin', async () => {
    const res = await request(app)
      .options('/api/events')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET')

    assert.notEqual(res.headers['access-control-allow-origin'], 'https://evil.example')
    assert.notEqual(res.headers['access-control-allow-origin'], '*')
    assert.equal(res.headers['access-control-allow-origin'], 'https://frontend.test')
  })

  it('omits HSTS outside production so local http development is unaffected', async () => {
    // NODE_ENV=test у цих тестах; у production гілка вмикає заголовок.
    const res = await request(app).get('/api/health')
    assert.equal(res.headers['strict-transport-security'], undefined)
  })
})

describe('uploads are still embeddable from the frontend origin', () => {
  it('serves /uploads as a cross-origin resource and keeps it cacheable', async () => {
    // Файлу немає — 404, але заголовки виставляє middleware перед
    // express.static, тож перевірка коректна й не залежить від вмісту
    // тому Volume.
    const res = await request(app).get('/uploads/does-not-exist/cover.webp')

    assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin')
    assert.equal(res.headers['cache-control'], 'public, max-age=3600')
    assert.notEqual(res.headers['cache-control'], 'no-store')
  })
})

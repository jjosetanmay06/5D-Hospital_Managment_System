import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Self-contained cleanup so these tests work regardless of the project's global test setup.
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

export const API = 'http://localhost:5000/api'

export function ok(body = {}) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob(['file-content'])),
  }
}

export function fail(status = 500, body = {}) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob([])),
  }
}

// A response whose body is not valid JSON (covers the `.catch(() => ({}))` branches).
export function failNoJson(status = 500) {
  return {
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    blob: () => Promise.resolve(new Blob([])),
  }
}

/**
 * Replace global fetch with a router.
 * routes: { 'GET /doctors': ok({...}), 'POST /appointments': (options) => ok({...}) }
 * A route matches when the method is equal and the path (without the API base)
 * equals the key path, or starts with "<path>?".
 * Unknown routes return 404.  A route may also be an Error instance (network failure).
 */
export function mockFetch(routes = {}) {
  const fn = vi.fn(async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    const full = String(url)
    const path = full.startsWith(API) ? full.slice(API.length) : full
    for (const [key, value] of Object.entries(routes)) {
      const [m, p] = key.split(' ')
      if (m === method && (path === p || path.startsWith(`${p}?`))) {
        const result = typeof value === 'function' ? value(options, path) : value
        if (result instanceof Error) throw result
        return result
      }
    }
    return fail(404, { message: `No mock route for ${method} ${path}` })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export function callsTo(fetchMock, method, path) {
  return fetchMock.mock.calls.filter(([url, options = {}]) => {
    const m = (options.method || 'GET').toUpperCase()
    const full = String(url)
    const p = full.startsWith(API) ? full.slice(API.length) : full
    return m === method && (p === path || p.startsWith(`${path}?`))
  })
}

// jsdom has no URL.createObjectURL; stub it and silence anchor clicks.
export function mockDownloads() {
  const created = vi.fn(() => 'blob:mock-url')
  const revoked = vi.fn()
  URL.createObjectURL = created
  URL.revokeObjectURL = revoked
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return { created, revoked, click }
}

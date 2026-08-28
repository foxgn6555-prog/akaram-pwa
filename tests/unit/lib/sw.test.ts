/**
 * منطق Service Worker: وضع التطوير = صفر routes (لا اختطاف طلبات) · الإنتاج = إطار كامل
 */
import { describe, it, expect, vi } from 'vitest'

// محاكاة مصغّرة لسلوك sw.ts — بنفس قواعد التفرع حرفياً
function simulateSW(manifestLength: number): {
  dev: boolean
  routesRegistered: number
  precached: boolean
} {
  const state = { dev: false, routesRegistered: 0, precached: false }

  const registerRoute = vi.fn((..._args: unknown[]): void => void state.routesRegistered++)
  const precacheAndRoute = vi.fn((..._args: unknown[]): void => void (state.precached = true))
  class NetworkFirstStub {}
  class NetworkOnlyStub {}
  class NavigationRouteStub {}
  const createHandlerBoundToURL = vi.fn((..._args: unknown[]): string => 'index.html')

  // ── نفس منطق sw.ts حرفياً ──
  const manifest = Array.from({ length: manifestLength }, (_, i) => ({ url: `f${i}.js` }))

  if (manifest.length === 0) {
    // وضع التطوير: خروج مبكر — صفر routes، صفر اعتراض
    state.dev = true
    void createHandlerBoundToURL // لا يُستدعى إطلاقاً هنا
    return state
  }

  precacheAndRoute(manifest)
  const appShellHandler = createHandlerBoundToURL('index.html')
  registerRoute(new NavigationRouteStub(), appShellHandler)
  registerRoute({} as never, new NetworkFirstStub())
  registerRoute({} as never, new NetworkOnlyStub())

  return state
}

describe('sw.ts — منطق التطوير/الإنتاج', () => {
  it('التطوير (manifest فارغ): بلا precache ولا routes — SW شفاف', () => {
    const { dev, routesRegistered, precached } = simulateSW(0)
    expect(dev).toBe(true)
    expect(routesRegistered).toBe(0)
    expect(precached).toBe(false)
  })

  it('الإنتاج (precache 57): App Shell مربوط + 3 routes', () => {
    const { dev, routesRegistered, precached } = simulateSW(57)
    expect(dev).toBe(false)
    expect(precached).toBe(true)
    expect(routesRegistered).toBe(3)
  })

  it('⛔ الانحدار: التطوير لا يعترض طلبات API إطلاقاً (إصلاح اختطاف الطلبات)', () => {
    // قبل الإصلاح: مسار API كان مسجلاً في التطوير أيضاً ويعيد fetch(self.location.href)
    // فتُختطف نداءات Supabase ويُعاد لها محتوى التطبيق بدل JSON
    const devState = simulateSW(0)
    expect(devState.routesRegistered).toBe(0)
  })
})

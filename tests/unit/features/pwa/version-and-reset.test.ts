/**
 * الجولة ٣-هـ — فحص الإصدار عبر الشبكة + الإصلاح الكامل.
 * الأول يكشف النشر على iPhone بلا انتظار عامل الخدمة، والثاني مخرج من أي كاش ملتصق.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isUpdatePublished, watchPublishedVersion } from '@features/pwa/version-watch'
import { BOOT_RECOVERY_KEY, hardResetApp } from '@features/pwa/hard-reset'
import { PWA_PENDING_KEY } from '@features/pwa/update-policy'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

describe('isUpdatePublished — الحكم على الإصدار المنشور', () => {
  it('نسخة مختلفة ⇒ يوجد تحديث', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ version: '4.0.1+abc1234' }))
    await expect(isUpdatePublished({ currentVersion: '4.0.0+fff0000', fetchImpl: fetchImpl as never })).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
  })

  it('نفس النسخة ⇒ لا تحديث', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ version: '4.0.0+fff0000' }))
    await expect(isUpdatePublished({ currentVersion: '4.0.0+fff0000', fetchImpl: fetchImpl as never })).resolves.toBe(false)
  })

  it('فشل الشبكة أو JSON سيئ ⇒ لا حكم (false) بلا استثناء', async () => {
    const boom = vi.fn(async () => { throw new Error('offline') })
    await expect(isUpdatePublished({ currentVersion: 'a', fetchImpl: boom as never })).resolves.toBe(false)
    const notOk = vi.fn(async () => jsonResponse({ version: 'x' }, false))
    await expect(isUpdatePublished({ currentVersion: 'a', fetchImpl: notOk as never })).resolves.toBe(false)
    const garbage = vi.fn(async () => jsonResponse({ version: 42 }))
    await expect(isUpdatePublished({ currentVersion: 'a', fetchImpl: garbage as never })).resolves.toBe(false)
  })
})

describe('watchPublishedVersion — الفحص عند العودة للتطبيق', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('ينادي onOutdated عند وجود إصدار أحدث، وينظّف مستمعاته', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ version: 'new' }))
    const onOutdated = vi.fn()
    const listeners = new Set<string>()
    const win = {
      addEventListener: (t: string) => { listeners.add(t) },
      removeEventListener: (t: string) => { listeners.delete(t) },
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
      clearInterval: (id: number) => clearInterval(id),
    }
    const doc = {
      addEventListener: (t: string) => { listeners.add(t) },
      removeEventListener: (t: string) => { listeners.delete(t) },
      visibilityState: 'visible' as DocumentVisibilityState,
    }
    const stop = watchPublishedVersion({
      currentVersion: 'old',
      fetchImpl: fetchImpl as never,
      onOutdated,
      win: win as never,
      doc: doc as never,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(onOutdated).toHaveBeenCalledTimes(1)

    stop()
    expect(listeners.size).toBe(0)
  })

  it('لا ينادي onOutdated إذا كانت النسخة نفسها', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ version: 'same' }))
    const onOutdated = vi.fn()
    const stop = watchPublishedVersion({
      currentVersion: 'same',
      fetchImpl: fetchImpl as never,
      onOutdated,
      win: { addEventListener: vi.fn(), removeEventListener: vi.fn(), setInterval: (() => 1) as never, clearInterval: vi.fn() } as never,
      doc: { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' } as never,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(onOutdated).not.toHaveBeenCalled()
    stop()
  })
})

describe('hardResetApp — الإصلاح الكامل', () => {
  it('يمسح كل الكاشات ويُلغي التسجيل ويُعيد التحميل مرة واحدة', async () => {
    const deleted: string[] = []
    const unregistered = vi.fn(async () => true)
    const reload = vi.fn()
    localStorage.setItem(PWA_PENDING_KEY, JSON.stringify({ firstSeenAt: 1, dismissals: 1 }))
    sessionStorage.setItem(BOOT_RECOVERY_KEY, '1')

    await hardResetApp({
      cachesApi: {
        keys: async () => ['app-shell-r1', 'images', 'heavy-export'],
        delete: async (key: string) => { deleted.push(key); return true },
      } as unknown as CacheStorage,
      registrations: async () => [{ unregister: unregistered } as unknown as ServiceWorkerRegistration],
      reload,
    })

    expect(deleted.sort()).toEqual(['app-shell-r1', 'heavy-export', 'images'])
    expect(unregistered).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(PWA_PENDING_KEY)).toBeNull()
    expect(sessionStorage.getItem(BOOT_RECOVERY_KEY)).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('لا يفشل إذا كان الكاش/التسجيل محجوباً', async () => {
    const reload = vi.fn()
    await hardResetApp({
      cachesApi: null,
      registrations: async () => { throw new Error('blocked') },
      reload,
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

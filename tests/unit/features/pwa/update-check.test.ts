/** تغطية فحص تحديث PWA عند الإقلاع والعودة من الخلفية والشبكة. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PWA_UPDATE_CHECK_INTERVAL_MS, watchForPwaUpdates } from '@features/pwa/update-check'

describe('watchForPwaUpdates', () => {
  let visibility: DocumentVisibilityState = 'visible'
  const docEvents = new EventTarget()
  const documentTarget = Object.assign(docEvents, {}) as EventTarget & { visibilityState: DocumentVisibilityState }
  Object.defineProperty(documentTarget, 'visibilityState', { get: () => visibility })

  const windowEvents = new EventTarget()
  const intervalId = 29
  const setInterval = vi.fn(() => intervalId)
  const clearInterval = vi.fn()
  const windowTarget = Object.assign(windowEvents, { setInterval, clearInterval }) as unknown as Window

  afterEach(() => {
    visibility = 'visible'
    vi.clearAllMocks()
  })

  it('يفحص فور التسجيل ثم ينظف المؤقّت والمستمعات عند الإيقاف', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const cleanup = watchForPwaUpdates({ update, waiting: null }, {
      windowTarget,
      documentTarget,
      isOnline: () => true,
    })

    expect(update).toHaveBeenCalledTimes(1)
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), PWA_UPDATE_CHECK_INTERVAL_MS)

    cleanup()
    expect(clearInterval).toHaveBeenCalledWith(intervalId)
    windowEvents.dispatchEvent(new Event('focus'))
    windowEvents.dispatchEvent(new Event('pageshow'))
    windowEvents.dispatchEvent(new Event('online'))
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('يعيد الفحص عند العودة للواجهة أو عودة الاتصال، ولا يفحص في الخلفية أو دون اتصال', () => {
    let online = false
    const update = vi.fn().mockResolvedValue(undefined)
    const cleanup = watchForPwaUpdates({ update, waiting: null }, {
      windowTarget,
      documentTarget,
      isOnline: () => online,
    })

    expect(update).not.toHaveBeenCalled()
    visibility = 'hidden'
    online = true
    windowEvents.dispatchEvent(new Event('online'))
    windowEvents.dispatchEvent(new Event('focus'))
    expect(update).not.toHaveBeenCalled()

    visibility = 'visible'
    docEvents.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('يعيد إظهار خيار التحديث إذا ظل إصدار جديد بانتظار موافقة المستخدم', () => {
    const onUpdateReady = vi.fn()
    const update = vi.fn().mockResolvedValue(undefined)
    const registration = { update, waiting: {} as ServiceWorker }
    const cleanup = watchForPwaUpdates(registration, {
      windowTarget,
      documentTarget,
      isOnline: () => true,
      onUpdateReady,
    })

    expect(onUpdateReady).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    windowEvents.dispatchEvent(new Event('focus'))
    expect(onUpdateReady).toHaveBeenCalledTimes(2)
    cleanup()
  })

  it('يتجاهل الطلب المكرر أثناء فحص جارٍ ويلتقط الرفض من دون تعطيل المحاولات التالية', async () => {
    let resolveUpdate!: () => void
    const update = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveUpdate = resolve }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const cleanup = watchForPwaUpdates({ update, waiting: null }, {
      windowTarget,
      documentTarget,
      isOnline: () => true,
    })

    windowEvents.dispatchEvent(new Event('focus'))
    expect(update).toHaveBeenCalledTimes(1)
    resolveUpdate()
    await Promise.resolve()
    await Promise.resolve()

    windowEvents.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    await Promise.resolve()
    windowEvents.dispatchEvent(new Event('focus'))
    expect(update).toHaveBeenCalledTimes(3)
    cleanup()
  })
})

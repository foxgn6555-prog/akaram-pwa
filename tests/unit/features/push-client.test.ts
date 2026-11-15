/** عقد عميل Web Push: المفتاح العام شرط، والاشتراك القديم بمفتاح مختلف يُستبدل، وفشل التسجيل لا يُبتلع. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  registerPush: vi.fn(),
  dispatchPush: vi.fn(),
  unregisterPush: vi.fn(),
  detectPlatform: vi.fn(() => 'other'),
  isStandalone: vi.fn(() => false),
}))

vi.mock('@sdk/notifications.sdk', () => ({
  notifications: {
    registerPush: h.registerPush,
    dispatchPush: h.dispatchPush,
    unregisterPush: h.unregisterPush,
  },
}))
vi.mock('@features/pwa/pwa.store', () => ({
  detectPlatform: h.detectPlatform,
  isStandalone: h.isStandalone,
}))

const KEY_BYTES = Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : i))
const VALID_KEY = Buffer.from(KEY_BYTES).toString('base64url')

function makeSubscription(applicationServerKey: ArrayBuffer | null) {
  return {
    endpoint: 'https://push.example.test/subscription/1',
    expirationTime: null,
    options: { applicationServerKey },
    toJSON: () => ({
      endpoint: 'https://push.example.test/subscription/1',
      expirationTime: null,
      keys: { p256dh: 'p256dh-value-long-enough-for-contract', auth: 'auth-value' },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

function stubBrowser(subscription: ReturnType<typeof makeSubscription> | null) {
  const subscribe = vi.fn().mockResolvedValue(makeSubscription(KEY_BYTES.buffer as ArrayBuffer))
  const getSubscription = vi.fn().mockResolvedValue(subscription)
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
  })
  return { subscribe, getSubscription }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', VALID_KEY)
  h.detectPlatform.mockReturnValue('other')
  h.isStandalone.mockReturnValue(false)
  h.registerPush.mockResolvedValue('subscription-id')
  h.dispatchPush.mockResolvedValue(undefined)
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('push.client — تفعيل إشعارات الهاتف', () => {
  it('يرفض نسخة بلا مفتاح عام قبل طلب إذن المتصفح', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    const requestPermission = vi.fn()
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default', requestPermission } })
    const { enablePush } = await import('@features/notifications/push.client')
    await expect(enablePush()).rejects.toThrow('PUSH_PUBLIC_KEY_MISSING')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('يرفض مفتاحاً ليس منحنى P-256 عاماً حتى لو كان بصيغة base64url صحيحة', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', Buffer.from('not-a-p256-key').toString('base64url'))
    const { enablePush } = await import('@features/notifications/push.client')
    await expect(enablePush()).rejects.toThrow('PUSH_PUBLIC_KEY_MISSING')
  })

  it('يشترك بالمفتاح العام ويسجل الجهاز في الخادم ثم يطلق الإرسال', async () => {
    const { subscribe } = stubBrowser(null)
    const { enablePush } = await import('@features/notifications/push.client')
    await enablePush()
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: KEY_BYTES })
    expect(h.registerPush).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://push.example.test/subscription/1',
        p256dh: 'p256dh-value-long-enough-for-contract',
        auth: 'auth-value',
      }),
    )
    expect(h.dispatchPush).toHaveBeenCalledOnce()
  })

  it('يستبدل اشتراكاً قديماً بمفتاح VAPID مختلف بدلاً من إبقائه يفشل بصمت', async () => {
    const old = makeSubscription(Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : 99)).buffer as ArrayBuffer)
    const { subscribe } = stubBrowser(old)
    const { enablePush } = await import('@features/notifications/push.client')
    await enablePush()
    expect(old.unsubscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(h.registerPush).toHaveBeenCalledOnce()
  })

  it('لا يعيد الاشتراك إذا كان المفتاح مطابقاً', async () => {
    const current = makeSubscription(KEY_BYTES.buffer as ArrayBuffer)
    const { subscribe } = stubBrowser(current)
    const { enablePush } = await import('@features/notifications/push.client')
    await enablePush()
    expect(current.unsubscribe).not.toHaveBeenCalled()
    expect(subscribe).not.toHaveBeenCalled()
    expect(h.registerPush).toHaveBeenCalledOnce()
  })

  it('يحوّل فشل تسجيل الخادم إلى خطأ Push مفهوم ولا يدّعي النجاح', async () => {
    stubBrowser(null)
    h.registerPush.mockRejectedValueOnce(new Error('database unavailable'))
    const { enablePush } = await import('@features/notifications/push.client')
    await expect(enablePush()).rejects.toThrow('PUSH_REGISTRATION_FAILED')
    expect(h.dispatchPush).not.toHaveBeenCalled()
  })

  it('على iPhone خارج التطبيق المثبت يطلب التثبيت أولاً', async () => {
    h.detectPlatform.mockReturnValue('ios')
    h.isStandalone.mockReturnValue(false)
    stubBrowser(null)
    const { enablePush } = await import('@features/notifications/push.client')
    await expect(enablePush()).rejects.toThrow('PUSH_IOS_INSTALL_REQUIRED')
    expect(h.registerPush).not.toHaveBeenCalled()
  })
})

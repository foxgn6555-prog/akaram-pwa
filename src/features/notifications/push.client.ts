import { notifications } from '@sdk/notifications.sdk'
import { detectPlatform, isStandalone } from '@features/pwa/pwa.store'
import { pushErrorCode } from './push.errors'

const VAPID_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{86,88}$/

const base64UrlToBytes = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4),
    raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

function configuredPublicKey(): string {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
  if (!key || !VAPID_PUBLIC_KEY_PATTERN.test(key)) throw new Error('PUSH_PUBLIC_KEY_MISSING')
  try {
    const bytes = base64UrlToBytes(key)
    // مفتاح P-256 العام غير المضغوط = 65 بايت ويبدأ بـ 0x04.
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('invalid')
  } catch {
    throw new Error('PUSH_PUBLIC_KEY_MISSING')
  }
  return key
}

function sameApplicationServerKey(subscription: PushSubscription, key: string): boolean {
  const current = subscription.options.applicationServerKey
  if (!current) return false
  const expected = base64UrlToBytes(key)
  const actual = new Uint8Array(current)
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
}

const platform = (): 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown' => {
  const ua = navigator.userAgent.toLowerCase()
  if (detectPlatform() === 'ios') return 'ios'
  if (/android/.test(ua)) return 'android'
  if (/windows/.test(ua)) return 'windows'
  if (/macintosh|mac os/.test(ua)) return 'macos'
  if (/linux/.test(ua)) return 'linux'
  return 'unknown'
}
const deviceName = () => {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'متصفح'
  return `${browser} · ${platform()}`
}
export const pushSupport = () => ({
  supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  permission: 'Notification' in window ? Notification.permission : 'denied',
  isIos: detectPlatform() === 'ios',
  standalone: isStandalone(),
})
export const pushReadiness = () => {
  const support = pushSupport()
  let keyReady = false
  try {
    configuredPublicKey()
    keyReady = true
  } catch {
    keyReady = false
  }
  return [
    { key: 'vapid', label: 'مفتاح الإشعارات مضبوط في هذه النسخة', ready: keyReady },
    { key: 'secure', label: 'اتصال آمن HTTPS', ready: window.isSecureContext },
    { key: 'worker', label: 'دعم Service Worker', ready: 'serviceWorker' in navigator },
    { key: 'push', label: 'دعم Web Push', ready: support.supported },
    { key: 'permission', label: 'إذن الإشعارات غير محظور', ready: support.permission !== 'denied' },
    { key: 'ios-install', label: 'تثبيت PWA على iPhone/iPad', ready: !support.isIos || support.standalone },
  ]
}
/**
 * 00407: `serviceWorker.ready` لا يُحلّ أبدًا إن لم يكن الـSW مسجّلًا بعد (أول زيارة/وضع التطوير)،
 * فكانت لافتة «إشعارات الهاتف غير مفعّلة» لا تظهر إطلاقًا ⇒ لا يعرف أحد أن الزر موجود.
 * مهلة قصيرة + اعتبار «غير مشترك» عند انعدام التسجيل.
 */
const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])

export async function currentDevicePushEnabled() {
  if (!pushSupport().supported) return false
  const registration = await withTimeout(
    navigator.serviceWorker.ready.catch(() => null),
    2500,
    null,
  )
  if (!registration) return false
  return Boolean(await registration.pushManager.getSubscription())
}
export async function enablePush() {
  const key = configuredPublicKey()
  if (!window.isSecureContext) throw new Error('PUSH_INSECURE_CONTEXT')
  const support = pushSupport()
  if (!support.supported) throw new Error('PUSH_NOT_SUPPORTED')
  if (support.isIos && !support.standalone) throw new Error('PUSH_IOS_INSTALL_REQUIRED')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('PUSH_PERMISSION_DENIED')
  const registration = await withTimeout(
    navigator.serviceWorker.ready.catch(() => null),
    8000,
    null,
  )
  if (!registration) throw new Error('PUSH_WORKER_NOT_READY')
  let subscription = await registration.pushManager.getSubscription()
  // اشتراك قديم بمفتاح VAPID مختلف يفشل الإرسال إليه بصمت؛ نستبدله بالمفتاح الحالي.
  if (subscription && !sameApplicationServerKey(subscription, key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(key),
  })
  const json = subscription.toJSON(),
    p256dh = json.keys?.p256dh,
    auth = json.keys?.auth
  if (!p256dh || !auth) throw new Error('PUSH_KEYS_MISSING')
  try {
    await notifications.registerPush({
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      expiration: subscription.expirationTime,
      userAgent: navigator.userAgent,
      platform: platform(),
      deviceName: deviceName(),
    })
  } catch (error) {
    const code = pushErrorCode(error)
    throw new Error(code === 'UNKNOWN' ? 'PUSH_REGISTRATION_FAILED' : code, { cause: error })
  }
  // الإرسال الفوري اختياري: الجدولة كل دقيقة تضمن التسليم حتى لو فشل هذا الاستدعاء.
  void notifications.dispatchPush().catch(() => undefined)
  return subscription
}
export async function disablePush() {
  if (!pushSupport().supported) return
  const registration = await navigator.serviceWorker.ready,
    subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await notifications.unregisterPush(subscription.endpoint)
  await subscription.unsubscribe()
}
export async function recordPushInteractionFromLocation() {
  const url = new URL(window.location.href),
    deliveryId = url.searchParams.get('_push')
  if (
    !deliveryId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryId)
  )
    return false
  const recorded = await notifications.recordPushInteraction(deliveryId)
  url.searchParams.delete('_push')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  return recorded
}
export function claimNotificationTone(notificationId?: string) {
  if (!notificationId) return true
  try {
    const key = `notification-tone:${notificationId}`,
      previous = Number(localStorage.getItem(key) ?? 0),
      now = Date.now()
    if (now - previous < 10_000) return false
    localStorage.setItem(key, String(now))
    return true
  } catch {
    return true
  }
}
export function playNotificationTone(critical = false) {
  try {
    const AudioContextClass = window.AudioContext
    const context = new AudioContextClass(),
      gain = context.createGain(),
      osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(critical ? 880 : 660, context.currentTime)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28)
    osc.connect(gain).connect(context.destination)
    osc.start()
    osc.stop(context.currentTime + 0.3)
    osc.onended = () => void context.close()
  } catch {
    return
  }
}

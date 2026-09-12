import { notifications } from '@sdk/notifications.sdk'
const base64UrlToBytes = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4),
    raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}
const platform = (): 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown' => {
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
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
  isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
  standalone: matchMedia('(display-mode: standalone)').matches,
})
export const pushReadiness = () => {
  const support = pushSupport()
  return [
    { key: 'secure', label: 'اتصال آمن HTTPS', ready: window.isSecureContext },
    { key: 'worker', label: 'دعم Service Worker', ready: 'serviceWorker' in navigator },
    { key: 'push', label: 'دعم Web Push', ready: support.supported },
    { key: 'permission', label: 'إذن الإشعارات غير محظور', ready: support.permission !== 'denied' },
    { key: 'ios-install', label: 'تثبيت PWA على iPhone/iPad', ready: !support.isIos || support.standalone },
  ]
}
export async function currentDevicePushEnabled() {
  if (!pushSupport().supported) return false
  const registration = await navigator.serviceWorker.ready
  return Boolean(await registration.pushManager.getSubscription())
}
export async function enablePush() {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
  if (!key) throw new Error('PUSH_PUBLIC_KEY_MISSING')
  if (!pushSupport().supported) throw new Error('PUSH_NOT_SUPPORTED')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('PUSH_PERMISSION_DENIED')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(key),
  })
  const json = subscription.toJSON(),
    p256dh = json.keys?.p256dh,
    auth = json.keys?.auth
  if (!p256dh || !auth) throw new Error('PUSH_KEYS_MISSING')
  await notifications.registerPush({
    endpoint: subscription.endpoint,
    p256dh,
    auth,
    expiration: subscription.expirationTime,
    userAgent: navigator.userAgent,
    platform: platform(),
    deviceName: deviceName(),
  })
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

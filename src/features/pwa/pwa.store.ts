/**
 * 00349 (الجولة B) — حالة التثبيت والتحديث للتطبيق (PWA)، مصدر واحد بلا اعتماديات:
 *  · التقاط beforeinstallprompt (Android/Chrome/Edge) وحفظه لزر «ثبّت التطبيق»
 *  · كشف iOS (لا يوجد حدث تثبيت — دليل «مشاركة ← إضافة إلى الشاشة الرئيسية»)
 *  · كشف وضع standalone (التطبيق مثبّت ويعمل من الشاشة الرئيسية)
 *  · حالة «يتوفر تحديث» التي يرفعها مسجّل الـ SW (registerType = prompt) — المستخدم يختار وقت التحديث
 * يُستهلك عبر useSyncExternalStore من المكوّنات، ويُغذّى من main.tsx ومن حدث المتصفح.
 */
import { useSyncExternalStore } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallPlatform = 'android' | 'ios' | 'other'

export interface PwaState {
  /** حدث التثبيت المحفوظ (Chrome/Edge/Samsung) — null = غير متاح الآن */
  deferredPrompt: BeforeInstallPromptEvent | null
  /** التطبيق يعمل مثبّتاً (standalone) أو ثُبّت للتو في هذه الجلسة */
  installed: boolean
  /** يوجد إصدار جديد بانتظار موافقة المستخدم */
  needRefresh: boolean
  /** تنفيذ التحديث (يرسل SKIP_WAITING ثم يعاد التحميل) */
  updateSW: ((reload?: boolean) => Promise<void>) | null
}

export const PWA_INSTALL_DISMISS_KEY = 'akaram.pwa.install.dismissedAt'
export const PWA_INSTALL_DISMISS_DAYS = 7

let state: PwaState = { deferredPrompt: null, installed: false, needRefresh: false, updateSW: null }
const listeners = new Set<() => void>()

function emit(): void { for (const l of listeners) l() }
function set(patch: Partial<PwaState>): void { state = { ...state, ...patch }; emit() }

export const pwaStore = {
  getState: (): PwaState => state,
  subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l) } },
  setDeferredPrompt(e: BeforeInstallPromptEvent | null): void { set({ deferredPrompt: e }) },
  markInstalled(): void { set({ installed: true, deferredPrompt: null }) },
  setNeedRefresh(updateSW: (reload?: boolean) => Promise<void>): void { set({ needRefresh: true, updateSW }) },
  clearNeedRefresh(): void { set({ needRefresh: false }) },
  /** للاختبارات فقط */
  reset(): void { state = { deferredPrompt: null, installed: isStandalone(), needRefresh: false, updateSW: null }; emit() },
}

export function usePwaState(): PwaState { return useSyncExternalStore(pwaStore.subscribe, pwaStore.getState, pwaStore.getState) }

/** يعمل التطبيق من الشاشة الرئيسية؟ (standalone على Android/Desktop، navigator.standalone على iOS) */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || nav.standalone === true
}

export function detectPlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): InstallPlatform {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { maxTouchPoints?: number; platform?: string })
  const iPadOs = nav?.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOs) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

/** هل أغلق المستخدم شريط التثبيت خلال آخر 7 أيام؟ */
export function installBannerDismissed(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(PWA_INSTALL_DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    return Number.isFinite(at) && now - at < PWA_INSTALL_DISMISS_DAYS * 86_400_000
  } catch { return false }
}

export function dismissInstallBanner(now: number = Date.now()): void {
  try { localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(now)) } catch { /* تخزين معطّل — نتجاهل */ }
}

/** يُستدعى مرة واحدة من main.tsx: يلتقط حدث التثبيت ويرصد اكتماله */
export function installPwaListeners(target: Window = window): () => void {
  const onPrompt = (e: Event): void => {
    e.preventDefault() // نمنع الشريط التلقائي للمتصفح — الزر داخل التطبيق هو الذي يعرضه
    pwaStore.setDeferredPrompt(e as BeforeInstallPromptEvent)
  }
  const onInstalled = (): void => pwaStore.markInstalled()
  if (isStandalone()) pwaStore.markInstalled()
  target.addEventListener('beforeinstallprompt', onPrompt)
  target.addEventListener('appinstalled', onInstalled)
  return () => {
    target.removeEventListener('beforeinstallprompt', onPrompt)
    target.removeEventListener('appinstalled', onInstalled)
  }
}

/** يعرض نافذة التثبيت الأصلية؛ يعيد النتيجة. 'unavailable' = لا حدث محفوظ (iOS/متصفح آخر) */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = pwaStore.getState().deferredPrompt
  if (!e) return 'unavailable'
  await e.prompt()
  const { outcome } = await e.userChoice
  // الحدث يُستهلك مرة واحدة — Chrome يرسل واحداً جديداً لاحقاً إن رُفض
  pwaStore.setDeferredPrompt(null)
  if (outcome === 'accepted') pwaStore.markInstalled()
  return outcome
}

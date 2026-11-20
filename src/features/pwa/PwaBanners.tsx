/**
 * 00349 (الجولة B) — شريطا PWA:
 *  · InstallBanner: داخل البوابات لمن لم يثبّت بعد — قابل للإغلاق (يُخفى 7 أيام)
 *  · UpdateBanner: «يتوفر تحديث جديد — حدّث الآن / لاحقاً» — التحديث لا يُفرض كي لا يفقد المستخدم نموذجاً يملؤه
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, Smartphone, X } from 'lucide-react'
import { APP_VERSION } from '@config/build-info'
import { clearPendingUpdate } from './update-policy'
import { hardResetApp } from './hard-reset'
import { InstallAppButton } from './InstallAppButton'
import { dismissInstallBanner, installBannerDismissed, pwaStore, usePwaState } from './pwa.store'

export function InstallBanner() {
  const { installed } = usePwaState()
  const [hidden, setHidden] = useState(() => installBannerDismissed())
  if (installed || hidden) return null
  const close = (): void => { dismissInstallBanner(); setHidden(true) }
  return (
    <div role="region" aria-label="تثبيت التطبيق" data-testid="pwa-install-banner"
      className="flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
      <Smartphone size={16} className="shrink-0 text-sky-700" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-bold">ثبّت التطبيق على جهازك ليعمل بشاشة كاملة وأسرع، مع دعم الإشعارات حسب المتصفح.</span>
      <InstallAppButton className="!h-8 !px-3 !text-xs" onInstalled={close} />
      <button type="button" onClick={close} aria-label="إخفاء" data-testid="pwa-install-dismiss" className="rounded-lg p-1 text-sky-700 hover:bg-sky-100"><X size={16} /></button>
    </div>
  )
}

export function UpdateBanner() {
  const { needRefresh, updateSW, updateForced } = usePwaState()
  const [busy, setBusy] = useState(false)
  if (!needRefresh) return null
  const apply = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    // نُصفّر سياسة التأجيل فقط؛ لا نطوي الشريط — إعادة التحميل هي التي تُنهيه
    clearPendingUpdate()
    try { await updateSW?.(true) } finally { setBusy(false) }
  }
  return (
    <div role="status" data-testid="pwa-update-banner" data-forced={updateForced ? 'true' : undefined}
      className={`flex items-center gap-3 px-3 py-2 text-xs text-white ${updateForced ? 'bg-amber-700' : 'bg-emerald-700'}`}>
      <RefreshCw size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 font-bold">
        {updateForced ? 'تحديث مطلوب — تم تأجيل هذا الإصدار طويلاً.' : 'يتوفر إصدار جديد من التطبيق.'}
        {/* بصمة النسخة العاملة الآن — تجعل تقرير المستخدم دقيقاً («نسختي 4.0.0+a1b2c3d») */}
        <span dir="ltr" className="ms-1 font-mono text-[10px] font-normal opacity-80" data-testid="pwa-current-version">
          {APP_VERSION}
        </span>
      </span>
      <button type="button" disabled={busy} onClick={() => void apply()} data-testid="pwa-update-now"
        className="h-8 rounded-lg bg-white px-3 font-black text-emerald-800 disabled:opacity-60">{busy ? 'جارٍ التحديث…' : 'حدّث الآن'}</button>
      {!updateForced && (
        <button type="button" onClick={() => pwaStore.dismissUpdate()} aria-label="لاحقاً" data-testid="pwa-update-later"
          className="rounded-lg p-1 text-white/80 hover:bg-white/10"><X size={16} /></button>
      )}
      {/* ٣-هـ: مخرج يدوي من أي التصاق كاش (شائع على iPhone) — لا يمسّ بيانات الجلسة */}
      <button type="button" onClick={() => { clearPendingUpdate(); void hardResetApp() }}
        data-testid="pwa-update-repair"
        className="shrink-0 rounded-lg px-1.5 py-1 text-[10px] font-bold underline decoration-dotted text-white/90 hover:bg-white/10">
        لم يعمل؟
      </button>
    </div>
  )
}


/**
 * 00349 ج: «التطبيق جاهز للعمل دون اتصال» — يظهر مرة عند أول تثبيت ناجح، ويُخفى تلقائياً.
 * الغرض: أن يعرف المستخدم أن التطبيق سيفتح بلا شبكة، بدل أن يكتشف ذلك صدفة.
 */
export function OfflineReadyBanner() {
  const { offlineReady } = usePwaState()
  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => pwaStore.dismissOfflineReady(), 6000)
    return () => clearTimeout(timer)
  }, [offlineReady])
  if (!offlineReady) return null
  return (
    <div role="status" data-testid="pwa-offline-ready"
      className="flex items-center gap-3 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
      <CheckCircle2 size={16} className="shrink-0 text-emerald-700" aria-hidden />
      <span className="min-w-0 flex-1 font-bold">التطبيق جاهز للعمل دون اتصال.</span>
      <button type="button" onClick={() => pwaStore.dismissOfflineReady()} aria-label="إخفاء" data-testid="pwa-offline-ready-dismiss"
        className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"><X size={16} /></button>
    </div>
  )
}

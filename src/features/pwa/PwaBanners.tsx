/**
 * 00349 (الجولة B) — شريطا PWA:
 *  · InstallBanner: داخل البوابات لمن لم يثبّت بعد — قابل للإغلاق (يُخفى 7 أيام)
 *  · UpdateBanner: «يتوفر تحديث جديد — حدّث الآن / لاحقاً» — التحديث لا يُفرض كي لا يفقد المستخدم نموذجاً يملؤه
 */
import { useState } from 'react'
import { RefreshCw, Smartphone, X } from 'lucide-react'
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
      <span className="min-w-0 flex-1 truncate font-bold">ثبّت التطبيق على هاتفك ليعمل بشاشة كاملة وأسرع وتصلك الإشعارات.</span>
      <InstallAppButton className="!h-8 !px-3 !text-xs" onInstalled={close} />
      <button type="button" onClick={close} aria-label="إخفاء" data-testid="pwa-install-dismiss" className="rounded-lg p-1 text-sky-700 hover:bg-sky-100"><X size={16} /></button>
    </div>
  )
}

export function UpdateBanner() {
  const { needRefresh, updateSW } = usePwaState()
  const [busy, setBusy] = useState(false)
  if (!needRefresh) return null
  const apply = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { await updateSW?.(true) } finally { setBusy(false) }
  }
  return (
    <div role="status" data-testid="pwa-update-banner"
      className="flex items-center gap-3 bg-emerald-700 px-3 py-2 text-xs text-white">
      <RefreshCw size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 font-bold">يتوفر إصدار جديد من التطبيق.</span>
      <button type="button" disabled={busy} onClick={() => void apply()} data-testid="pwa-update-now"
        className="h-8 rounded-lg bg-white px-3 font-black text-emerald-800 disabled:opacity-60">{busy ? 'جارٍ التحديث…' : 'حدّث الآن'}</button>
      <button type="button" onClick={() => pwaStore.clearNeedRefresh()} aria-label="لاحقاً" data-testid="pwa-update-later"
        className="rounded-lg p-1 text-white/80 hover:bg-white/10"><X size={16} /></button>
    </div>
  )
}

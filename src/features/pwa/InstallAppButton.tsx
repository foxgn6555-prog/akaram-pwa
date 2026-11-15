/**
 * 00349 (الجولة B) — زر «ثبّت التطبيق» مع دليل صادق حسب المتصفح:
 *  · Chrome/Edge/Samsung/Opera: يفتح نافذة التثبيت الأصلية متى التقط المتصفح الحدث.
 *  · iPhone/iPad: لا حدث تثبيت — دليل «مشاركة ← إضافة إلى الشاشة الرئيسية» (يفضّل Safari).
 *  · Firefox/Safari desktop/داخل التطبيقات: لا نفترض قدرة غير موجودة؛ نعرض خطوات اليدوي وحدود المتصفح.
 *  · يختفي تلقائياً عندما يعمل التطبيق مثبّتاً أو بعد اكتمال التثبيت.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { detectBrowser, detectPlatform, promptInstall, usePwaState, type InstallBrowser, type InstallPlatform } from './pwa.store'

export interface InstallAppButtonProps {
  className?: string
  /** مظهر فاتح للخلفيات الداكنة (صفحة الدخول) */
  tone?: 'light' | 'dark'
  /** يُستدعى بعد قبول التثبيت الأصلي */
  onInstalled?: () => void
}

export function InstallAppButton({ className, tone = 'dark', onInstalled }: InstallAppButtonProps) {
  const { deferredPrompt, installed } = usePwaState()
  const [guide, setGuide] = useState(false)
  const [busy, setBusy] = useState(false)
  if (installed) return null
  const platform = detectPlatform()
  const browser = detectBrowser()

  const onClick = async (): Promise<void> => {
    if (busy) return
    if (!deferredPrompt) { setGuide(true); return }
    setBusy(true)
    try {
      const r = await promptInstall()
      if (r === 'accepted') onInstalled?.()
      else if (r === 'unavailable') setGuide(true)
    } finally { setBusy(false) }
  }

  return (
    <>
      <button
        type="button"
        data-testid="pwa-install-button"
        data-mode={deferredPrompt ? 'native' : platform}
        data-browser={browser}
        disabled={busy}
        onClick={() => void onClick()}
        className={clsx(
          'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition disabled:opacity-60',
          tone === 'light'
            ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
            : 'border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100',
          className,
        )}
      >
        <Download size={16} aria-hidden />
        ثبّت التطبيق على جهازك
      </button>
      {guide && <InstallGuide platform={platform} browser={browser} onClose={() => setGuide(false)} />}
    </>
  )
}

/** دليل التثبيت اليدوي حسب المنصة والمتصفح — لا يعرض وعوداً غير مدعومة */
export function InstallGuide({ platform, browser = detectBrowser(), onClose }: { platform: InstallPlatform; browser?: InstallBrowser; onClose: () => void }) {
  const ios = platform === 'ios'
  const inApp = browser === 'in-app'
  const title = inApp ? 'افتح النظام في متصفح أولاً' : ios ? 'التثبيت على iPhone / iPad' : 'تثبيت التطبيق على جهازك'
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title" data-testid="pwa-install-guide" data-platform={platform} data-browser={browser}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" onClick={onClose}>
      <div dir="rtl" className="w-full max-w-md rounded-2xl bg-white p-5 text-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="pwa-guide-title" className="text-base font-black">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {inApp ? (
          <ol className="space-y-3 text-sm leading-7">
            <li className="flex items-start gap-3"><Step n={1} /><span>أنت داخل متصفح تطبيق (مثل واتساب/فيسبوك). هذا المتصفح لا يعرض تثبيت التطبيق عادةً.</span></li>
            <li className="flex items-start gap-3"><Step n={2} /><span>افتح الرابط في <b>Safari</b> على iPhone، أو <b>Chrome</b> على Android/الحاسوب.</span></li>
            <li className="flex items-start gap-3"><Step n={3} /><span>ثم اضغط «ثبّت التطبيق» واتبع خطوات المتصفح.</span></li>
          </ol>
        ) : ios ? (
          <ol className="space-y-3 text-sm leading-7">
            <li className="flex items-start gap-3"><Step n={1} /><span>افتح هذه الصفحة في <b>Safari</b> (التثبيت لا يعمل من داخل تطبيقات أخرى مثل واتساب).</span></li>
            <li className="flex items-start gap-3"><Step n={2} /><span>اضغط زر <b>المشاركة</b> <Share size={16} className="inline align-middle text-sky-700" aria-label="أيقونة المشاركة" /> أسفل الشاشة (أو أعلى يمين iPad).</span></li>
            <li className="flex items-start gap-3"><Step n={3} /><span>مرّر القائمة واختر <b>«إضافة إلى الشاشة الرئيسية»</b> <SquarePlus size={16} className="inline align-middle text-sky-700" aria-hidden />.</span></li>
            <li className="flex items-start gap-3"><Step n={4} /><span>اضغط <b>«إضافة»</b> أعلى اليمين — ستجد أيقونة «الأكارم» على شاشتك الرئيسية.</span></li>
          </ol>
        ) : (
          <ManualSteps platform={platform} browser={browser} />
        )}
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">
          {ios
            ? 'بعد التثبيت يفتح التطبيق بشاشة كاملة من أيقونته، ويعمل أسرع، وتصلك الإشعارات (على iOS 16.4 فأحدث).'
            : inApp
              ? 'التثبيت والإشعارات يعتمدان على المتصفح الذي تفتح به النظام؛ متصفحات داخل التطبيقات محدودة.'
              : browser === 'firefox'
                ? 'Firefox لا يدعم نافذة التثبيت التلقائية مثل Chrome. استخدم قائمة المتصفح إن ظهر خيار التثبيت/الإضافة، أو افتح النظام في Chrome/Edge للتثبيت الكامل.'
                : browser === 'safari' && platform === 'other'
                  ? 'على Safari للـ Mac: استخدم «إضافة إلى Dock» من قائمة المشاركة/ملف إن كان متاحاً في إصدارك. الإشعارات-push تتطلب Safari حديثاً وإذن الموقع.'
                  : 'بعد التثبيت يفتح التطبيق بشاشة كاملة من أيقونته، ويعمل أسرع، وتصلك الإشعارات متى سمح المتصفح والنظام.'}
        </p>
        <button type="button" onClick={onClose} className="mt-4 h-10 w-full rounded-xl bg-slate-900 text-sm font-black text-white">فهمت</button>
      </div>
    </div>
  )
}

function ManualSteps({ platform, browser }: { platform: InstallPlatform; browser: InstallBrowser }) {
  if (platform === 'android' && browser === 'firefox') {
    return (
      <ol className="space-y-3 text-sm leading-7">
        <li className="flex items-start gap-3"><Step n={1} /><span>افتح <b>قائمة Firefox</b> (الثلاث نقاط ⋮).</span></li>
        <li className="flex items-start gap-3"><Step n={2} /><span>اختر <b>«إضافة إلى الشاشة الرئيسية»</b> أو <b>«تثبيت»</b> إن ظهر الخيار في إصدارك.</span></li>
        <li className="flex items-start gap-3"><Step n={3} /><span>إن لم يظهر، افتح النظام في <b>Chrome</b> وثبّته من قائمة المتصفح.</span></li>
      </ol>
    )
  }
  if (platform === 'android' && browser === 'samsung') {
    return (
      <ol className="space-y-3 text-sm leading-7">
        <li className="flex items-start gap-3"><Step n={1} /><span>افتح <b>قائمة Samsung Internet</b> (☰ أو ⋮).</span></li>
        <li className="flex items-start gap-3"><Step n={2} /><span>اختر <b>«إضافة الصفحة إلى» ← «الشاشة الرئيسية»</b>.</span></li>
        <li className="flex items-start gap-3"><Step n={3} /><span>أكّد الإضافة — ستجد أيقونة «الأكارم» على شاشتك.</span></li>
      </ol>
    )
  }
  if (platform === 'other' && browser === 'safari') {
    return (
      <ol className="space-y-3 text-sm leading-7">
        <li className="flex items-start gap-3"><Step n={1} /><span>افتح النظام في <b>Safari</b> على الماك.</span></li>
        <li className="flex items-start gap-3"><Step n={2} /><span>من قائمة <b>مشاركة</b> أو <b>ملف</b> اختر <b>«إضافة إلى Dock»</b> إن كان الخيار متاحاً.</span></li>
        <li className="flex items-start gap-3"><Step n={3} /><span>إن لم يتوفر، استخدم Chrome/Edge لتثبيت التطبيق من شريط العنوان.</span></li>
      </ol>
    )
  }
  if (platform === 'other' && browser === 'firefox') {
    return (
      <ol className="space-y-3 text-sm leading-7">
        <li className="flex items-start gap-3"><Step n={1} /><span>افتح <b>قائمة Firefox</b> (☰).</span></li>
        <li className="flex items-start gap-3"><Step n={2} /><span>ابحث عن <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b> — الدعم يختلف حسب الإصدار.</span></li>
        <li className="flex items-start gap-3"><Step n={3} /><span>للحصول على تثبيت كامل، افتح النظام في <b>Chrome</b> أو <b>Edge</b> واضغط أيقونة التثبيت في شريط العنوان.</span></li>
      </ol>
    )
  }
  return (
    <ol className="space-y-3 text-sm leading-7">
      <li className="flex items-start gap-3"><Step n={1} /><span>افتح <b>قائمة المتصفح</b> (الثلاث نقاط ⋮ في Chrome/Edge، أو شريط العنوان على الحاسوب).</span></li>
      <li className="flex items-start gap-3"><Step n={2} /><span>اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.</span></li>
      <li className="flex items-start gap-3"><Step n={3} /><span>أكّد بالضغط على <b>«تثبيت»</b>.</span></li>
    </ol>
  )
}

function Step({ n }: { n: number }) {
  return <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-700 text-xs font-black text-white">{n}</span>
}

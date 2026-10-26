/**
 * 00349 (الجولة B) — زر «ثبّت التطبيق»:
 *  · Android/Chrome/Edge: يفتح نافذة التثبيت الأصلية (الحدث المحفوظ في pwa.store)
 *  · iPhone/iPad: لا حدث تثبيت في Safari — نعرض دليلاً مصوّراً (مشاركة ← إضافة إلى الشاشة الرئيسية ← إضافة)
 *  · متصفحات أخرى بلا حدث: دليل عام (قائمة المتصفح ← تثبيت التطبيق)
 *  · يختفي تلقائياً عندما يعمل التطبيق مثبّتاً أو بعد اكتمال التثبيت
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { detectPlatform, promptInstall, usePwaState } from './pwa.store'

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
      {guide && <InstallGuide platform={platform} onClose={() => setGuide(false)} />}
    </>
  )
}

/** دليل التثبيت اليدوي (iOS أو متصفح بلا حدث تثبيت) */
export function InstallGuide({ platform, onClose }: { platform: ReturnType<typeof detectPlatform>; onClose: () => void }) {
  const ios = platform === 'ios'
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title" data-testid="pwa-install-guide" data-platform={platform}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center" onClick={onClose}>
      <div dir="rtl" className="w-full max-w-md rounded-2xl bg-white p-5 text-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="pwa-guide-title" className="text-base font-black">{ios ? 'التثبيت على iPhone / iPad' : 'تثبيت التطبيق على جهازك'}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {ios ? (
          <ol className="space-y-3 text-sm leading-7">
            <li className="flex items-start gap-3"><Step n={1} /><span>افتح هذه الصفحة في <b>Safari</b> (التثبيت لا يعمل من داخل تطبيقات أخرى مثل واتساب).</span></li>
            <li className="flex items-start gap-3"><Step n={2} /><span>اضغط زر <b>المشاركة</b> <Share size={16} className="inline align-middle text-sky-700" aria-label="أيقونة المشاركة" /> أسفل الشاشة (أو أعلى يمين iPad).</span></li>
            <li className="flex items-start gap-3"><Step n={3} /><span>مرّر القائمة واختر <b>«إضافة إلى الشاشة الرئيسية»</b> <SquarePlus size={16} className="inline align-middle text-sky-700" aria-hidden />.</span></li>
            <li className="flex items-start gap-3"><Step n={4} /><span>اضغط <b>«إضافة»</b> أعلى اليمين — ستجد أيقونة «الأكارم» على شاشتك الرئيسية.</span></li>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm leading-7">
            <li className="flex items-start gap-3"><Step n={1} /><span>افتح <b>قائمة المتصفح</b> (الثلاث نقاط ⋮ في Chrome، أو شريط العنوان على الحاسوب).</span></li>
            <li className="flex items-start gap-3"><Step n={2} /><span>اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.</span></li>
            <li className="flex items-start gap-3"><Step n={3} /><span>أكّد بالضغط على <b>«تثبيت»</b>.</span></li>
          </ol>
        )}
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">
          بعد التثبيت يفتح التطبيق بشاشة كاملة من أيقونته، ويعمل أسرع، وتصلك الإشعارات{ios ? ' (على iOS 16.4 فأحدث)' : ''}.
        </p>
        <button type="button" onClick={onClose} className="mt-4 h-10 w-full rounded-xl bg-slate-900 text-sm font-black text-white">فهمت</button>
      </div>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-700 text-xs font-black text-white">{n}</span>
}

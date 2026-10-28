import { useState } from 'react'
import { AlertTriangle, Camera, Eraser, History, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { formatFileSize } from '@lib/utils/file.utils'
import { formatDateTime } from '@lib/utils/date.utils'
import { DEV_CLEANUP_BUCKET_LABEL, DEV_CLEANUP_ROW_LABEL } from '@sdk/dev-cleanup.sdk'
import { useDevCleanupGps, useDevCleanupPhotos, useDevCleanupPreview } from '@features/dev-cleanup/hooks'

/**
 * 🧹 تنظيف البيانات التجريبية (00368) — بوابة التطوير المركزية، IT فقط.
 *  زرّان مباشران: صور البوابات الميدانية (ملفات + سجلات) ونقاط توقف GPS (أحداث + حالة سحب + سجل المزامنة).
 *  لا تُمسّ: وثائق الموظفين، صور الآليات، الصور الشخصية، الرواتب، مكتبة الأغلفة الإعلامية.
 */
const num = (n: number) => n.toLocaleString('en-US')

export default function DevCleanupPage() {
  const q = useDevCleanupPreview()
  const gps = useDevCleanupGps()
  const photos = useDevCleanupPhotos()
  const [confirm, setConfirm] = useState<null | 'photos' | 'gps'>(null)
  const d = q.data
  const totalObjects = d?.buckets.reduce((a, b) => a + b.objects, 0) ?? 0
  const totalBytes = d?.buckets.reduce((a, b) => a + b.bytes, 0) ?? 0
  const totalRows = d ? Object.values(d.photo_rows).reduce((a, b) => a + b, 0) : 0
  const busy = photos.isPending || gps.isPending
  const run = () => {
    if (confirm === 'photos') photos.mutate()
    if (confirm === 'gps') gps.mutate()
    setConfirm(null)
  }
  return (
    <section className="space-y-5" dir="rtl" data-testid="dev-cleanup-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-rose-950 to-red-800 p-5 text-white shadow-xl sm:p-6">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-rose-200"><ShieldCheck size={16} /> إجراء محمي · IT فقط · حذف مباشر لا رجعة فيه</span>
        <h1 className="mt-2 text-2xl font-black">تنظيف البيانات التجريبية</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-rose-100">
          للقاعدة التجريبية: يحذف <b>صور البوابات الميدانية</b> (الملفات من التخزين ثم سجلاتها) و<b>نقاط توقف GPS</b> (الأحداث وحالة السحب وسجل المزامنة بما فيه أي مزامنة عالقة) فوراً بعد تأكيد واحد.
          لا يمسّ وثائق الموظفين ولا صور الآليات ولا الرواتب ولا مكتبة الأغلفة الإعلامية ولا أي بيانات نصية.
        </p>
      </header>
      {q.isLoading && <LoadingSpinner label="جارٍ حصر البيانات…" />}
      {q.isError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">تعذر حصر البيانات — <button type="button" onClick={() => q.refetch()} className="font-bold underline">إعادة المحاولة</button></div>}
      {d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="dev-cleanup-photos">
            <div className="flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-base font-black text-slate-900"><Camera size={18} className="text-rose-700" /> بيانات الصور</h2>
              <span className="text-xs font-bold text-slate-500">{num(totalObjects)} ملف · {formatFileSize(totalBytes)} · {num(totalRows)} سجل</span>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {d.buckets.map((b) => (
                <li key={b.bucket} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{DEV_CLEANUP_BUCKET_LABEL[b.bucket] ?? b.bucket}</span>
                  <span className="font-bold text-slate-900" dir="ltr">{num(b.objects)} · {formatFileSize(b.bytes)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-slate-500">
              {Object.entries(d.photo_rows).map(([k, v]) => <span key={k} className="rounded-lg bg-slate-50 px-2 py-0.5">{DEV_CLEANUP_ROW_LABEL[k] ?? k}: <b>{num(v)}</b></span>)}
            </div>
            {d.photos_run && !photos.isPending && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">تشغيل سابق لم يكتمل ({num(d.photos_run.removed_objects)}/{num(d.photos_run.planned_objects)} ملف) — الضغط على الزر يستأنفه.</p>
            )}
            {photos.progress && (
              <div className="mt-3" data-testid="dev-cleanup-photos-progress">
                <div className="flex justify-between text-xs font-bold text-slate-600"><span>جارٍ حذف الملفات…</span><span dir="ltr">{num(photos.progress.removed)} / {num(photos.progress.planned)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-rose-600 transition-all" style={{ width: `${photos.progress.planned ? Math.min(100, Math.round((photos.progress.removed / photos.progress.planned) * 100)) : 100}%` }} /></div>
              </div>
            )}
            <button type="button" disabled={busy || (totalObjects === 0 && totalRows === 0)} onClick={() => setConfirm('photos')} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 text-sm font-black text-white disabled:opacity-50" data-testid="dev-cleanup-photos-btn">
              {photos.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Eraser size={16} />} تنظيف بيانات الصور مباشرة
            </button>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="dev-cleanup-gps">
            <div className="flex items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-base font-black text-slate-900"><MapPin size={18} className="text-cyan-700" /> نقاط توقف GPS</h2>
              {d.gps.gps_sync_running > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">مزامنة عالقة: {num(d.gps.gps_sync_running)}</span>}
            </div>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              <li className="flex justify-between py-1.5"><span className="text-slate-700">أحداث التوقف</span><b>{num(d.gps.gps_stop_events)}</b></li>
              <li className="flex justify-between py-1.5"><span className="text-slate-700">حالة سحب الأجهزة من LVN</span><b>{num(d.gps.gps_stop_scan_state)}</b></li>
              <li className="flex justify-between py-1.5"><span className="text-slate-700">سجل المزامنة</span><b>{num(d.gps.gps_sync_runs)}</b></li>
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">بعد التنظيف تبدأ بقع التوقف من الصفر ويعيد المجدول الخادمي سحب آخر 6 ساعات لكل جهاز ثم يتعمّق تلقائياً. مواقع الأجهزة الحية ومسارات الانطلاقيات لا تُمسّ.</p>
            <button type="button" disabled={busy} onClick={() => setConfirm('gps')} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 text-sm font-black text-white disabled:opacity-50" data-testid="dev-cleanup-gps-btn">
              {gps.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Eraser size={16} />} تنظيف نقاط توقف GPS مباشرة
            </button>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-black text-slate-700"><History size={16} /> آخر عمليات التنظيف</h2>
            {d.history.length === 0 ? <p className="py-3 text-center text-xs text-slate-500">لم يُنفَّذ تنظيف بعد</p> : (
              <ul className="mt-2 divide-y divide-slate-100 text-xs" data-testid="dev-cleanup-history">
                {d.history.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="font-bold text-slate-800">{r.kind === 'photos' ? 'الصور' : 'نقاط توقف GPS'} · {r.status === 'done' ? 'مكتمل' : r.status === 'running' ? 'جارٍ' : 'ملغى'}</span>
                    <span className="text-slate-500">{r.started_by_name ?? '—'} · {formatDateTime(r.started_at)}</span>
                    <span className="text-slate-600">{r.kind === 'photos' ? `${num(r.removed_objects)} ملف · ` : ''}{Object.entries(r.deleted_rows ?? {}).map(([k, v]) => `${DEV_CLEANUP_ROW_LABEL[k] ?? k} ${num(v)}`).join(' · ') || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-[3000] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="تأكيد التنظيف" data-testid="dev-cleanup-confirm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="inline-flex items-center gap-2 text-base font-black text-red-800"><AlertTriangle size={18} /> {confirm === 'photos' ? 'حذف كل صور البوابات الميدانية؟' : 'حذف كل نقاط توقف GPS؟'}</h3>
              <button type="button" onClick={() => setConfirm(null)} className="rounded-lg bg-slate-100 p-1"><X size={14} /></button>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {confirm === 'photos'
                ? `سيُحذف ${num(totalObjects)} ملف (${formatFileSize(totalBytes)}) من التخزين و${num(totalRows)} سجل صورة نهائياً. البيانات النصية للتذاكر والشكاوى تبقى.`
                : `سيُحذف ${num(d?.gps.gps_stop_events ?? 0)} حدث توقف و${num(d?.gps.gps_sync_runs ?? 0)} سجل مزامنة نهائياً، وتُحرَّر أي مزامنة عالقة.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold">لا</button>
              <button type="button" onClick={run} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white" data-testid="dev-cleanup-confirm-yes">نعم، احذف الآن</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

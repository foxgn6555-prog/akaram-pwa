import { useState, useEffect } from 'react'
import { AlertTriangle, Activity, Clock, Database, HardDrive, Layers, Settings2, Sparkles, Warehouse, Zap } from 'lucide-react'
import { formatDateTime } from '@lib/utils/date.utils'
import { SPACE_BUCKET_LABEL, SPACE_RECLAIM_NOTE, SPACE_RECLAIM_STATUS, type SpaceOverview, type SpacePlan } from '@sdk/space.sdk'
import { useSetSpacePlan, useSpaceOverview, useSpaceReclaimNow } from '@features/space/hooks'
import { supabase } from '@sdk/client'

/**
 * 📦 لوحة المساحة (00370) — رئيسية بوابة التطوير المركزية
 *  قاعدة البيانات النصية (المستخدم/الحد/المتبقي/القابل للاسترداد) + التخزين للصور والملفات بتفصيل الحاويات + أكبر الجداول ونسبة الشطب
 *  + حدود الخطة (مجانية/Pro/مخصص) + الضغط الليلي وزر «ضغط الآن».
 */
const num = (n: number) => n.toLocaleString('en-US')
const MB = 1024 * 1024
const GB = 1024 * MB
/** «364 م.ب» / «1.5 ج.ب» / «820 ك.ب» */
export const formatFileSize = (bytes: number) => {
  const b = Math.max(0, bytes)
  if (b >= GB) return `${(b / GB).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.ب`
  if (b >= MB) return `${(b / MB).toLocaleString('en-US', { maximumFractionDigits: 1 })} م.ب`
  if (b >= 1024) return `${(b / 1024).toLocaleString('en-US', { maximumFractionDigits: 0 })} ك.ب`
  return `${num(b)} بايت`
}
const pctColor = (p: number) => (p >= 90 ? '#dc2626' : p >= 80 ? '#f59e0b' : '#0f766e')

function Gauge({ label, used, limit, pct, free, extra, icon, testId }: { label: string; used: number; limit: number; pct: number; free: number; extra?: string; icon: React.ReactNode; testId: string }) {
  const color = pctColor(pct)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-black text-slate-800">{icon} {label}</h3>
        <span className="text-xs font-black" style={{ color }} dir="ltr">{pct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-lg bg-slate-50 p-1.5"><div className="text-slate-500">المستخدم</div><div className="font-black text-slate-900" dir="ltr">{formatFileSize(used)}</div></div>
        <div className="rounded-lg bg-slate-50 p-1.5"><div className="text-slate-500">الحد</div><div className="font-black text-slate-900" dir="ltr">{formatFileSize(limit)}</div></div>
        <div className="rounded-lg bg-emerald-50 p-1.5"><div className="text-emerald-700">المتبقي</div><div className="font-black text-emerald-900" dir="ltr">{formatFileSize(free)}</div></div>
      </div>
      {extra && <p className="mt-2 text-[11px] font-bold text-amber-800">{extra}</p>}
    </div>
  )
}

export default function SpacePanel() {
  const q = useSpaceOverview()
  const setPlan = useSetSpacePlan()
  const reclaim = useSpaceReclaimNow()
  const [editing, setEditing] = useState(false)
  const [dbGb, setDbGb] = useState('')
  const [stGb, setStGb] = useState('')
  const [confirmReclaim, setConfirmReclaim] = useState(false)
  // عداد بناء الزيارات
  const [buildStats, setBuildStats] = useState<{ pending: number; processing: number; done: number }>({ pending: 0, processing: 0, done: 0 })
  const [buildLoading, setBuildLoading] = useState(false)

  // عداد معالجة الزيارات من السحب اليدوي من المزود
  const [manualPullStats, setManualPullStats] = useState<{ pending: number; processing: number; done: number; failed: number }>({ pending: 0, processing: 0, done: 0, failed: 0 })
  const [manualPullLoading, setManualPullLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setBuildLoading(true)
      setManualPullLoading(true)
      try {
        const [pendingRes, processingRes, doneRes] = await Promise.all([
          supabase.from('visit_build_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('visit_build_queue').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
          supabase.from('visit_build_queue').select('*', { count: 'exact', head: true }).eq('status', 'done'),
        ])
        if (!cancelled) {
          setBuildStats({
            pending: pendingRes.count ?? 0,
            processing: processingRes.count ?? 0,
            done: doneRes.count ?? 0,
          })
        }
      } catch {
        // تجاهل الأخطاء صامتاً — العداد غير معطل للواجهة
      } finally {
        if (!cancelled) setBuildLoading(false)
      }
    }

    async function loadManualPull() {
      try {
        const [pendingRes, processingRes, doneRes, failedRes] = await Promise.all([
          supabase.from('manual_pull_visit_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('manual_pull_visit_queue').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
          supabase.from('manual_pull_visit_queue').select('*', { count: 'exact', head: true }).eq('status', 'done'),
          supabase.from('manual_pull_visit_queue').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
        ])
        if (!cancelled) {
          setManualPullStats({
            pending: pendingRes.count ?? 0,
            processing: processingRes.count ?? 0,
            done: doneRes.count ?? 0,
            failed: failedRes.count ?? 0,
          })
        }
      } catch {
        // تجاهل الأخطاء صامتاً
      } finally {
        if (!cancelled) setManualPullLoading(false)
      }
    }

    load()
    loadManualPull()
    return () => { cancelled = true }
  }, [])

  const d: SpaceOverview | undefined = q.data
  if (q.isLoading) return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">جارٍ قياس المساحة…</div>
  if (!d) return null
  const planLabel: Record<SpacePlan, string> = { free: 'الخطة المجانية', pro: 'خطة Pro', custom: 'حدود مخصصة' }
  const applyCustom = () => {
    const db = Number(dbGb), st = Number(stGb)
    if (!(db > 0) || !(st > 0)) return
    setPlan.mutate({ plan: 'custom', dbLimit: Math.round(db * GB), storageLimit: Math.round(st * GB) }, { onSuccess: () => setEditing(false) })
  }
  return (
    <section className="space-y-3" data-testid="space-panel" dir="rtl">
      {d.alerts.map((a, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${a.level === 'danger' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`} data-testid="space-alert"><AlertTriangle size={14} /> {a.message}</div>
      ))}
      <div className="grid gap-3 lg:grid-cols-2">
        <Gauge label="قاعدة البيانات (البيانات النصية)" icon={<Database size={16} className="text-sky-700" />} used={d.db_bytes} limit={d.db_limit_bytes} pct={d.db_pct} free={d.db_free_bytes} testId="space-db"
          extra={d.db_reclaimable_bytes >= MB ? `قابل للاسترداد بالضغط: ${formatFileSize(d.db_reclaimable_bytes)} (يُنفَّذ تلقائياً ${d.reclaim.nightly_at})` : undefined} />
        <Gauge label="التخزين (الصور والملفات)" icon={<HardDrive size={16} className="text-violet-700" />} used={d.storage_bytes} limit={d.storage_limit_bytes} pct={d.storage_pct} free={d.storage_free_bytes} testId="space-storage" />
      </div>
      {d.warehouse.configured && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-3" data-testid="space-warehouse">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 text-xs font-black text-teal-900"><Warehouse size={14} /> مستودع GPS التحليلي (المشروع الثاني)</h3>
            <span className="text-[10px] text-teal-800" data-testid="space-warehouse-meta">
              {d.warehouse.as_of ? `آخر قياس ${formatDateTime(d.warehouse.as_of)}` : 'لم يُقَس بعد'}
              {d.warehouse.vehicles !== null ? ` · ${num(d.warehouse.vehicles)} آلية` : ''}{d.warehouse.stops !== null ? ` · ${num(d.warehouse.stops)} توقف` : ''}{d.warehouse.raw_points !== null ? ` · ${num(d.warehouse.raw_points)} نقطة خام مؤقتة` : ''}
              {d.warehouse.ok === false && <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 font-black text-red-800">آخر فحص فشل{d.warehouse.error_code ? ` (${d.warehouse.error_code})` : ''}</span>}
            </span>
          </div>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <Gauge label="قاعدة المستودع" icon={<Database size={16} className="text-teal-700" />} used={d.warehouse.db_bytes ?? 0} limit={d.warehouse.db_limit_bytes} pct={d.warehouse.db_pct} free={d.warehouse.db_free_bytes} testId="space-warehouse-db" />
            <Gauge label="تخزين المستودع (أرشيف مضغوط)" icon={<HardDrive size={16} className="text-teal-700" />} used={d.warehouse.storage_bytes} limit={d.warehouse.storage_limit_bytes} pct={d.warehouse.storage_pct} free={d.warehouse.storage_free_bytes} testId="space-warehouse-storage"
              extra={d.warehouse.storage_objects !== null ? `${num(d.warehouse.storage_objects)} ملف` : undefined} />
          </div>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="space-plan">
          <div className="flex items-center justify-between">
            <h3 className="inline-flex items-center gap-2 text-xs font-black text-slate-700"><Settings2 size={14} /> حدود الخطة: {planLabel[d.plan]}</h3>
            <button type="button" onClick={() => setEditing((v) => !v)} className="text-[11px] font-bold text-sky-700 underline">تعديل</button>
          </div>
          {editing && (
            <div className="mt-2 space-y-2 text-[11px]">
              <div className="flex gap-1">
                <button type="button" disabled={setPlan.isPending} onClick={() => setPlan.mutate({ plan: 'free' }, { onSuccess: () => setEditing(false) })} className={`flex-1 rounded-lg border px-2 py-1 font-black ${d.plan === 'free' ? 'border-slate-900 bg-slate-50' : ''}`} data-testid="space-plan-free">مجانية<br /><span className="font-normal text-slate-500">500 MB / 1 GB</span></button>
                <button type="button" disabled={setPlan.isPending} onClick={() => setPlan.mutate({ plan: 'pro' }, { onSuccess: () => setEditing(false) })} className={`flex-1 rounded-lg border px-2 py-1 font-black ${d.plan === 'pro' ? 'border-slate-900 bg-slate-50' : ''}`} data-testid="space-plan-pro">Pro<br /><span className="font-normal text-slate-500">8 GB / 100 GB</span></button>
              </div>
              <div className="flex items-end gap-1">
                <label className="flex-1">قاعدة (GB)<input value={dbGb} onChange={(e) => setDbGb(e.target.value)} dir="ltr" type="number" min={0.1} step={0.1} className="mt-0.5 w-full rounded-lg border px-2 py-1" data-testid="space-custom-db" /></label>
                <label className="flex-1">تخزين (GB)<input value={stGb} onChange={(e) => setStGb(e.target.value)} dir="ltr" type="number" min={0.1} step={0.1} className="mt-0.5 w-full rounded-lg border px-2 py-1" data-testid="space-custom-storage" /></label>
                <button type="button" disabled={setPlan.isPending} onClick={applyCustom} className="rounded-lg bg-slate-900 px-3 py-1.5 font-black text-white" data-testid="space-custom-save">حفظ</button>
              </div>
            </div>
          )}
          <p className="mt-2 text-[10px] text-slate-500">الحدود لا تُقرأ من Supabase آلياً — تُضبط هنا بحسب الاشتراك وتسري على المشروعين. تنبيه عند 80% و90%.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:col-span-2" data-testid="space-reclaim">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 text-xs font-black text-slate-700"><Sparkles size={14} /> استرداد المساحة (ضغط الجداول) — تلقائياً كل ليلة {d.reclaim.nightly_at}</h3>
            <div className="flex items-center gap-2">
              {!d.reclaim.cron_available && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">المجدول غير مفعّل</span>}
              {confirmReclaim ? (
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <span className="font-bold text-red-700">يبطئ الكتابة في الجداول المضغوطة دقيقة تقريباً — متابعة؟</span>
                  <button type="button" disabled={reclaim.isPending} onClick={() => { reclaim.mutate(undefined); setConfirmReclaim(false) }} className="rounded-lg bg-red-700 px-2 py-1 font-black text-white disabled:opacity-50" data-testid="space-reclaim-yes">نعم</button>
                  <button type="button" onClick={() => setConfirmReclaim(false)} className="rounded-lg bg-slate-100 px-2 py-1 font-bold">لا</button>
                </span>
              ) : (
                <button type="button" disabled={reclaim.isPending} onClick={() => setConfirmReclaim(true)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1 text-[11px] font-black text-white disabled:opacity-50" data-testid="space-reclaim-now"><Zap size={12} /> ضغط الآن</button>
              )}
            </div>
          </div>
          {d.reclaim.log.length === 0 ? <p className="mt-2 text-[11px] text-slate-500">لا عمليات ضغط بعد — تُختار الجداول تلقائياً عندما تتجاوز نسبة الشطب {d.bloat_threshold_pct}%.</p> : (
            <ul className="mt-2 max-h-40 divide-y divide-slate-100 overflow-auto text-[11px]" data-testid="space-reclaim-log">
              {d.reclaim.log.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span className="font-bold text-slate-800" dir="ltr">{r.table}</span>
                  <span className={`rounded-full px-2 py-0.5 font-black ${r.status === 'done' ? 'bg-emerald-50 text-emerald-800' : r.status === 'skipped' || r.status === 'failed' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{SPACE_RECLAIM_STATUS[r.status]}</span>
                  <span className="text-slate-500">
                    {r.status === 'done' && r.before_bytes !== null && r.after_bytes !== null ? `${formatFileSize(r.before_bytes)} ← ${formatFileSize(r.after_bytes)} (وفّر ${formatFileSize(Math.max(0, r.before_bytes - r.after_bytes))})` : r.note ? SPACE_RECLAIM_NOTE[r.note] ?? r.note : r.scheduled_for ? `موعده ${formatDateTime(r.scheduled_for)}` : formatDateTime(r.requested_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {/* عداد بناء الزيارات — بوابة تقنية المعلومات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="visit-build-counter">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
            <Activity size={14} className="text-sky-700" /> بناء الزيارات — حالة الطابور
          </div>
          {buildLoading ? (
            <span className="text-[10px] text-slate-500">جارٍ التحميل…</span>
          ) : (
            <div className="flex gap-3 text-xs font-black">
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
                <Clock size={11} /> في الانتظار: <b dir="ltr">{buildStats.pending}</b>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-blue-800">
                <Layers size={11} /> جارٍ البناء: <b dir="ltr">{buildStats.processing}</b>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">
                <Activity size={11} /> مكتمل: <b dir="ltr">{buildStats.done}</b>
              </span>
            </div>
          )}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">يُحدّث تلقائياً — كل منطقة تبنى على دفعات صغيرة دون ضغط على قاعدة البيانات.</p>
      </div>

      {/* عداد معالجة الزيارات من السحب اليدوي من المزود */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 shadow-sm" data-testid="manual-pull-visit-counter">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-black text-blue-900">
            <Activity size={14} className="text-blue-700" /> معالجة الزيارات من السحب اليدوي
          </div>
          {manualPullLoading ? (
            <span className="text-[10px] text-slate-500">جارٍ التحميل…</span>
          ) : (
            <div className="flex gap-3 text-xs font-black">
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
                <Clock size={11} /> في الانتظار: <b dir="ltr">{manualPullStats.pending}</b>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-blue-800">
                <Layers size={11} /> جارٍ المعالجة: <b dir="ltr">{manualPullStats.processing}</b>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">
                <Activity size={11} /> مكتمل: <b dir="ltr">{manualPullStats.done}</b>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-rose-800">
                <AlertTriangle size={11} /> فاشل: <b dir="ltr">{manualPullStats.failed}</b>
              </span>
            </div>
          )}
        </div>
        <p className="mt-1 text-[10px] text-slate-500">يُحدّث تلقائياً — visitas الأيام القديمة المسحوبة يدوياً تُحذف بعد 3 أيام.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="space-tables">
          <h3 className="text-xs font-black text-slate-700">أكبر الجداول (الحجم · الصفوف · نسبة الشطب)</h3>
          <ul className="mt-1 divide-y divide-slate-100 text-[11px]">
            {d.tables.map((t) => (
              <li key={t.table} className="flex items-center justify-between gap-2 py-1">
                <span className="truncate font-bold text-slate-800" dir="ltr">{t.table}</span>
                <span className="shrink-0 text-slate-600" dir="ltr">{formatFileSize(t.bytes)} · {num(t.rows)}</span>
                <span className={`shrink-0 rounded-full px-1.5 font-black ${t.reclaimable_pct >= d.bloat_threshold_pct ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-500'}`} dir="ltr">{t.reclaimable_pct}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="space-buckets">
          <h3 className="text-xs font-black text-slate-700">حاويات التخزين</h3>
          {d.buckets.length === 0 ? <p className="mt-1 text-[11px] text-slate-500">لا ملفات في التخزين</p> : (
            <ul className="mt-1 divide-y divide-slate-100 text-[11px]">
              {d.buckets.map((b) => (
                <li key={b.bucket} className="flex items-center justify-between gap-2 py-1">
                  <span className="font-bold text-slate-800">{SPACE_BUCKET_LABEL[b.bucket] ?? b.bucket}</span>
                  <span className="text-slate-600" dir="ltr">{num(b.objects)} ملف · {formatFileSize(b.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

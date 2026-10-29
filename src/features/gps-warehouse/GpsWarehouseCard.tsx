/**
 * 00380 — بطاقة «مستودع GPS التحليلي» في بوابة IT (سلامة تكامل GPS):
 * حالة الربط بالمشروع الثاني، فحص الاتصال، إرسال سجل الآليات، وجدولة شهر للسحب (المحرّك يأتي في 00381).
 * لا مفاتيح هنا: الأسرار تُضبط من لوحة Supabase فقط.
 */
import { useState } from 'react'
import { Database, RefreshCw } from 'lucide-react'
import { useGpsWarehouseAction, useGpsWarehouseLink } from '@features/gps-warehouse/hooks'
import { explainLvnError } from '@features/gps-lvn/lvn-errors'

const fmt = (v: string | null | undefined) => (v ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(v)) : '—')
const mb = (bytes: number | null | undefined) => `${((bytes ?? 0) / 1048576).toFixed(1)} م.ب`
const monthNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)

export default function GpsWarehouseCard() {
  const linkQ = useGpsWarehouseLink()
  const act = useGpsWarehouseAction()
  const [month, setMonth] = useState(monthNow())
  const link = linkQ.data
  const ping = link?.ping ?? null
  const state: 'unknown' | 'ok' | 'error' = link?.last_ping_at == null ? 'unknown' : link.last_ping_ok ? 'ok' : 'error'
  const tone = state === 'ok' ? 'bg-emerald-100 text-emerald-800' : state === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
  const err = link?.last_error_code ? explainLvnError(link.last_error_code) : null
  const busy = act.isPending
  const run = (action: 'ping' | 'sync_registry' | 'enqueue_month') => act.mutate(action === 'enqueue_month' ? { action, month } : { action })
  return (
    <article className="rounded-[1.75rem] border bg-white shadow-sm" data-testid="gps-warehouse-card" data-state={state}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-900 text-cyan-300"><Database size={17} /></span>
          <div>
            <h2 className="text-sm font-black">مستودع GPS التحليلي (المشروع الثاني)</h2>
            <p className="text-[10px] text-slate-500">السحب الشهري والتوقفات والبقع تُعالَج هناك؛ المتصفح لا يتصل به مباشرة</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tone}`} data-testid="gps-warehouse-state">{state === 'ok' ? 'متصل' : state === 'error' ? 'خطأ' : 'لم يُفحص بعد'}</span>
      </div>
      <div className="grid gap-2 px-4 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="المضيف" value={link?.warehouse_host ?? '—'} />
        <Stat label="آخر فحص" value={fmt(link?.last_ping_at)} />
        <Stat label="إصدار المخطط" value={link?.schema_version != null ? String(link.schema_version) : '—'} />
        <Stat label="آخر إرسال لسجل الآليات" value={`${fmt(link?.last_registry_sync_at)}${link?.registry_active != null ? ` · ${link.registry_active} آلية` : ''}`} />
      </div>
      {ping && (
        <div className="mx-4 mt-3 grid gap-2 rounded-2xl bg-slate-50 p-3 text-[11px] sm:grid-cols-3 lg:grid-cols-6" data-testid="gps-warehouse-ping">
          <Stat label="آليات في المستودع" value={String(ping.vehicles)} />
          <Stat label="مهام السحب" value={`${ping.jobs.queued} بانتظار · ${ping.jobs.running} تعمل · ${ping.jobs.done} تمّت · ${ping.jobs.failed} فشلت`} />
          <Stat label="نقاط خام مؤقتة" value={ping.raw_points.toLocaleString('en')} />
          <Stat label="توقفات" value={ping.stops.toLocaleString('en')} />
          <Stat label="ملفات الأرشيف" value={String(ping.archive_files)} />
          <Stat label="حجم القاعدة" value={mb(ping.db_bytes)} />
          <p className="col-span-full text-[10px] text-slate-500">الحدود: توقف من {ping.settings.min_stop_minutes} إلى {ping.settings.max_stop_minutes} دقيقة · عطل مشتبه بعد {ping.settings.fault_stop_hours} ساعة · نصف قطر التجميع {ping.settings.cluster_radius_m} م · الخام يُحفظ {ping.settings.raw_retention_days} أيام · الأرشيف {ping.settings.archive_retention_months} أشهر</p>
        </div>
      )}
      {err && (
        <div className="mx-4 mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px]" data-testid="gps-warehouse-error">
          <b className="text-rose-900">{err.title}</b> <span className="text-rose-700">({link?.last_error_code})</span>
          <p className="mt-1 text-slate-700">{err.cause}</p>
          <p className="mt-1 font-bold text-slate-800">{err.action}</p>
        </div>
      )}
      {state === 'unknown' && !err && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900" data-testid="gps-warehouse-setup">
          <b>خطوات الربط (مرة واحدة، من لوحة Supabase بالماوس):</b>
          <ol className="mr-4 mt-1 list-decimal space-y-0.5">
            <li>في المشروع الثاني: طبّق ملف <code dir="ltr">gps-warehouse/supabase/migrations/0001_warehouse_schema.sql</code> (SQL Editor ← لصق ← Run).</li>
            <li>في المشروع الأول: Edge Functions ← Secrets ← أضف <code dir="ltr">GPS_WAREHOUSE_URL</code> و<code dir="ltr">GPS_WAREHOUSE_SERVICE_KEY</code> (من المشروع الثاني).</li>
            <li>اضغط «فحص الاتصال» ثم «إرسال سجل الآليات».</li>
          </ol>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 p-4 text-xs font-black">
        <button type="button" onClick={() => run('ping')} disabled={busy} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-white disabled:opacity-50" data-testid="gps-warehouse-ping-btn"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />فحص الاتصال</button>
        <button type="button" onClick={() => run('sync_registry')} disabled={busy || state !== 'ok'} className="rounded-xl border px-3 py-2 text-slate-800 disabled:opacity-50" data-testid="gps-warehouse-registry-btn">إرسال سجل الآليات</button>
        <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">شهر السحب<input type="month" value={month} max={monthNow()} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border px-2 py-1.5 text-xs" data-testid="gps-warehouse-month" /></label>
        <button type="button" onClick={() => run('enqueue_month')} disabled={busy || state !== 'ok' || !link?.last_registry_sync_at || !month} className="rounded-xl border px-3 py-2 text-slate-800 disabled:opacity-50" data-testid="gps-warehouse-enqueue-btn">جدولة سحب الشهر</button>
        <span className="text-[10px] font-normal text-slate-400">الجدولة تُنشئ المهام فقط؛ السحب الفعلي يبدأ مع محرّك 00381.</span>
      </div>
    </article>
  )
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-white px-2 py-1.5"><span className="block text-[10px] text-slate-500">{label}</span><b className="text-slate-900" dir="auto">{value}</b></div>
}

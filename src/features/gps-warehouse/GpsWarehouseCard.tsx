/**
 * 00380 — بطاقة «مستودع GPS التحليلي» في بوابة IT (سلامة تكامل GPS):
 * حالة الربط بالمشروع الثاني، فحص الاتصال، إرسال سجل الآليات، جدولة شهر للسحب، و(00381) تقدّم السحب الشهري،
 * حالة المجدول، سحب دفعة يدوياً، إيقاف/استئناف.
 * لا مفاتيح هنا: الأسرار تُضبط من لوحة Supabase فقط.
 */
import { useState } from 'react'
import { Database, Pause, Play, RefreshCw } from 'lucide-react'
import { useGpsWarehouseAction, useGpsWarehouseLink } from '@features/gps-warehouse/hooks'
import { explainLvnError } from '@features/gps-lvn/lvn-errors'
import type { GpsWarehouseMonthProgress } from '@sdk/gps-warehouse.sdk'

const GPS_WAREHOUSE_MONTH_ROLE: Record<NonNullable<GpsWarehouseMonthProgress['role']>, string> = { displayed: 'المعروض', collecting: 'قيد التجميع', kept: 'محفوظ', expired: 'خارج النافذة — يُمسح' }

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
  const run = (action: 'ping' | 'sync_registry' | 'enqueue_month' | 'pull' | 'pause' | 'resume') => act.mutate(action === 'enqueue_month' ? { action, month } : action === 'pull' ? { action, limit: 3 } : { action })
  const progress = ping?.progress ?? null
  const paused = Boolean(progress?.paused ?? ping?.settings.paused)
  const cron = link?.cron ?? null
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
          <p className="col-span-full text-[10px] text-slate-500">الحدود: توقف من {ping.settings.min_stop_minutes} إلى {ping.settings.max_stop_minutes} دقيقة · عطل مشتبه بعد {ping.settings.fault_stop_hours} ساعة · نصف قطر التجميع {ping.settings.cluster_radius_m} م · {ping.settings.raw_retention_days === 0 ? 'الخام يُحذف فور حساب توقفات اليوم' : `الخام يُحفظ ${ping.settings.raw_retention_days} أيام`} · {ping.settings.archive_enabled === false ? 'بلا أرشيف مضغوط' : `الأرشيف ${ping.settings.archive_retention_months} أشهر`}</p>
        </div>
      )}
      {progress && (
        <div className="mx-4 mt-3 rounded-2xl border bg-white p-3 text-[11px]" data-testid="gps-warehouse-progress">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <b className="text-slate-900">تقدّم السحب الشهري</b>
            <span className="flex flex-wrap items-center gap-1">
              <span className={`rounded-full px-2 py-0.5 font-black ${cron?.scheduled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`} data-testid="gps-warehouse-cron">{cron?.scheduled ? `المجدول يعمل كل دقيقة${cron.last_run_at ? ` · آخر تشغيل ${fmt(cron.last_run_at)}` : ''}` : 'المجدول غير مفعّل — السحب يدوي فقط (راجع إعداد Vault/pg_cron)'}</span>
              {paused && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-black text-rose-800" data-testid="gps-warehouse-paused">متوقف مؤقتاً</span>}
              {progress.locked && !paused && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-black text-sky-800">دورة تعمل الآن</span>}
            </span>
          </div>
          {progress.window && (
            <p className="mb-2 rounded-xl bg-slate-50 p-2 text-[10px] text-slate-700" data-testid="gps-warehouse-window">
              <b>النافذة المتجددة:</b> المعروض <span dir="ltr" className="font-black">{progress.window.displayed_month.slice(0, 7)}</span> · قيد التجميع <span dir="ltr" className="font-black">{progress.window.collecting_month.slice(0, 7)}</span>{progress.window.auto_enqueue ? ' (يوم الأمس يُسحب تلقائياً كل ليلة)' : ' (الجدولة التلقائية متوقفة)'} · ما قبل <span dir="ltr">{progress.window.cutoff}</span> يُمسح بلا أثر
              {progress.last_rollover_at && progress.last_rollover ? ` · آخر مسح ${fmt(progress.last_rollover_at)}: ${progress.last_rollover.stops.toLocaleString('en')} توقف و${progress.last_rollover.jobs.toLocaleString('en')} مهمة` : ''}
            </p>
          )}
          {progress.months.length === 0 ? <p className="text-slate-500">لا مهام بعد — تُجدول تلقائياً مع أول دورة للمجدول.</p> : (
            <table className="w-full text-right"><thead><tr className="text-[10px] text-slate-500"><th className="p-1">الشهر</th><th className="p-1">الإنجاز</th><th className="p-1">بانتظار</th><th className="p-1">فشل نهائي</th><th className="p-1">نقاط</th><th className="p-1">توقفات</th><th className="p-1">آليات</th><th className="p-1">السرعة</th><th className="p-1">المتبقي تقريباً</th></tr></thead>
              <tbody>{progress.months.map((m) => {
                const pct = m.total ? Math.round((m.done / m.total) * 100) : 0
                const remaining = m.total - m.done - m.failed
                const eta = m.done_last_hour > 0 ? remaining / m.done_last_hour : null
                return (
                  <tr key={m.month} className="border-t" data-testid={`gps-warehouse-month-${m.month}`}>
                    <td className="p-1 font-black"><span dir="ltr">{m.month}</span>{m.role && <span className={`mr-1 rounded-full px-1.5 py-0.5 text-[9px] font-black ${m.role === 'displayed' ? 'bg-emerald-100 text-emerald-800' : m.role === 'collecting' ? 'bg-sky-100 text-sky-800' : m.role === 'expired' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`} data-testid={`gps-warehouse-role-${m.month}`}>{GPS_WAREHOUSE_MONTH_ROLE[m.role]}</span>}</td>
                    <td className="p-1"><span className="inline-block h-2 w-24 overflow-hidden rounded bg-slate-200 align-middle"><span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} /></span> <b>{pct}%</b> <span className="text-slate-500">({m.done}/{m.total})</span></td>
                    <td className="p-1">{m.queued + m.running}</td>
                    <td className={`p-1 ${m.failed ? 'font-black text-rose-700' : ''}`}>{m.failed}</td>
                    <td className="p-1">{m.points.toLocaleString('en')}</td>
                    <td className="p-1">{m.stops.toLocaleString('en')}</td>
                    <td className="p-1">{m.devices}</td>
                    <td className="p-1">{m.done_last_hour} يوم/ساعة</td>
                    <td className="p-1">{remaining === 0 ? 'اكتمل' : eta == null ? '—' : eta < 1 ? 'أقل من ساعة' : eta < 48 ? `${Math.ceil(eta)} ساعة` : `${Math.ceil(eta / 24)} يوم`}</td>
                  </tr>
                )
              })}</tbody></table>
          )}
          <p className="mt-2 text-[10px] text-slate-500">التوقفات حسب الصنف: صالحة {progress.stops_by_class.valid ?? 0} · طويلة (&gt; الحد الأقصى، مستبعدة) {progress.stops_by_class.long ?? 0} · عطل مشتبه (≥ يوم، مستبعدة) {progress.stops_by_class.fault ?? 0}</p>
          {progress.errors.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer font-bold text-rose-800">آخر الأخطاء ({progress.errors.length})</summary>
              <ul className="mt-1 space-y-0.5" data-testid="gps-warehouse-errors">{progress.errors.map((e, i) => { const x = explainLvnError(e.error_code); return <li key={i}><span dir="ltr">{e.day}</span> · {e.device_external_id} · <b>{x.title}</b> <span className="text-slate-500">({e.error_code} · محاولة {e.attempts})</span></li> })}</ul>
            </details>
          )}
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
        <span className="mx-1 h-5 border-r" />
        <button type="button" onClick={() => run('pull')} disabled={busy || state !== 'ok' || paused} className="rounded-xl bg-emerald-600 px-3 py-2 text-white disabled:opacity-50" data-testid="gps-warehouse-pull-btn">سحب دفعة الآن</button>
        {paused
          ? <button type="button" onClick={() => run('resume')} disabled={busy || state !== 'ok'} className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-emerald-800 disabled:opacity-50" data-testid="gps-warehouse-resume-btn"><Play size={14} />استئناف السحب</button>
          : <button type="button" onClick={() => run('pause')} disabled={busy || state !== 'ok'} className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-rose-800 disabled:opacity-50" data-testid="gps-warehouse-pause-btn"><Pause size={14} />إيقاف مؤقت</button>}
        <span className="text-[10px] font-normal text-slate-400">السحب يجري تلقائياً كل دقيقة (3 أيام-جهاز في الدقيقة)؛ «سحب دفعة الآن» لا يلزم إلا للتجربة.</span>
      </div>
    </article>
  )
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-white px-2 py-1.5"><span className="block text-[10px] text-slate-500">{label}</span><b className="text-slate-900" dir="auto">{value}</b></div>
}

/**
 * لوحة الحالة الحية — دليل التشغيل التقني (00278)
 * صفحة واحدة تجيب: هل Supabase يستجيب؟ ما آخر ترحيل مطبّق؟ هل البصمة تصل (لكل مصدر)؟ هل الدوال الطرفية منشورة؟ GPS حيّ؟
 * قراءة فقط؛ تتحدث كل 30 ثانية؛ كل مؤشر بلون وشرح بلغة بسيطة.
 */
import clsx from 'clsx'
import { useDevOpsStatus, useEdgeHealth } from '@features/devops-status/hooks'
import type { DevOpsDevice } from '@sdk/devops.sdk'

type Tone = 'ok' | 'warn' | 'bad' | 'muted'
const TONE: Record<Tone, string> = { ok: 'bg-emerald-100 text-emerald-800 border-emerald-200', warn: 'bg-amber-100 text-amber-800 border-amber-200', bad: 'bg-rose-100 text-rose-800 border-rose-200', muted: 'bg-slate-100 text-slate-600 border-slate-200' }
const MODE: Record<string, string> = { adms_push: 'ZKTeco دفع (ADMS)', app_api_pull: 'API المزود', lan_pull: 'شبكة داخلية', generic_pull: 'مصدر عام' }

const fmt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
export const ago = (iso: string | null | undefined, now = Date.now()): string => {
  if (!iso) return 'لم يحدث بعد'
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'الآن'
  if (m < 60) return `قبل ${m} دقيقة`
  const h = Math.round(m / 60); if (h < 48) return `قبل ${h} ساعة`
  return `قبل ${Math.round(h / 24)} يوماً`
}
/** حالة المصدر: أخضر = اتصال خلال ساعة؛ أصفر = خلال يوم؛ أحمر = أكثر أو خطأ؛ رمادي = موقوف */
export const deviceTone = (d: DevOpsDevice, now = Date.now()): Tone => {
  if (!d.is_active) return 'muted'
  if (d.bridge_last_error || d.last_pull?.status === 'failed') return 'bad'
  const seen = d.last_seen_at ? now - new Date(d.last_seen_at).getTime() : Infinity
  if (seen <= 3_600_000) return 'ok'
  if (seen <= 86_400_000) return 'warn'
  return 'bad'
}

function Card({ title, value, hint, tone = 'muted', testId }: { title: string; value: string | number; hint?: string; tone?: Tone; testId?: string }) {
  return (
    <div className={clsx('rounded-2xl border p-3', TONE[tone])} data-testid={testId}>
      <p className="text-[11px] opacity-80">{title}</p>
      <b className="block text-xl leading-tight" dir="ltr">{value}</b>
      {hint && <p className="mt-1 text-[11px] opacity-80">{hint}</p>}
    </div>
  )
}

export default function DevOpsStatusPage() {
  const q = useDevOpsStatus(), edge = useEdgeHealth()
  const s = q.data?.status, lat = q.data?.latency_ms
  const dbTone: Tone = q.isError ? 'bad' : !s ? 'muted' : (lat ?? 0) > 2000 ? 'warn' : 'ok'
  const devices = s?.biometric.devices ?? []
  const edgeDown = (edge.data ?? []).filter((e) => e.state === 'down').length
  const rlsOff = s?.database.rls_disabled_tables ?? []
  return (
    <div className="space-y-4" data-testid="devops-status-page">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800">لوحة الحالة الحية</h1>
          <p className="text-xs text-slate-500">هل كل شيء يعمل الآن؟ أخضر = سليم، أصفر = انتبه، أحمر = يحتاج تدخلاً. تتحدث تلقائياً كل ٣٠ ثانية.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500" data-testid="status-updated">آخر تحديث: {q.dataUpdatedAt ? fmt(new Date(q.dataUpdatedAt).toISOString()) : '—'}</span>
          <button type="button" className="h-9 rounded-xl border px-3 font-black" onClick={() => { void q.refetch(); void edge.refetch() }} disabled={q.isFetching} data-testid="status-refresh">تحديث</button>
        </div>
      </header>

      {q.isError && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800" data-testid="status-error">تعذّر الوصول إلى Supabase أو لا صلاحية: {(q.error as Error).message}. تحقق من الإنترنت ثم من لوحة Supabase (Project → Health).</div>}

      <section>
        <h2 className="mb-2 text-sm font-black">١ · الخلفية (Supabase)</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="db-cards">
          <Card title="وصول قاعدة البيانات" value={q.isError ? 'لا يستجيب' : s ? `${lat} ms` : '…'} hint={s ? 'زمن الاستجابة من متصفحك' : undefined} tone={dbTone} testId="db-reach" />
          <Card title="آخر ترحيل مطبّق" value={s?.database.last_migration ?? (s && !s.database.migrations_tracked ? 'غير متتبّع' : '…')} hint={s?.database.migrations_count != null ? `${s.database.migrations_count} ترحيلاً · ${ago(s.database.last_migration_at)}` : 'يظهر على مشروع Supabase الحقيقي'} tone={s ? (s.database.migrations_tracked ? 'ok' : 'muted') : 'muted'} testId="db-migration" />
          <Card title="الدوال / الجداول" value={s ? `${s.database.functions_count} / ${s.database.tables_count}` : '…'} hint="دوال RPC وجداول public" tone={s ? 'ok' : 'muted'} testId="db-counts" />
          <Card title="جداول بلا RLS" value={rlsOff.length} hint={rlsOff.length ? rlsOff.join('، ') : 'كل الجداول محمية بسياسات الصفوف'} tone={!s ? 'muted' : rlsOff.length ? 'bad' : 'ok'} testId="db-rls" />
        </div>
        {s && <p className="mt-1 text-[11px] text-slate-500" dir="ltr">{s.database.version} · DB time {fmt(s.database.now)} · users {s.auth.users_total}{s.auth.signins_24h != null ? ` · sign-ins 24h ${s.auth.signins_24h}` : ''}</p>}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black">٢ · البصمة — هل تصل الآن؟</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="bio-cards">
          <Card title="آخر بصمة وصلت" value={ago(s?.biometric.last_punch_at)} hint={fmt(s?.biometric.last_punch_at)} tone={!s ? 'muted' : !s.biometric.last_punch_at ? 'warn' : Date.now() - new Date(s.biometric.last_punch_at).getTime() < 6 * 3_600_000 ? 'ok' : 'warn'} testId="bio-last" />
          <Card title="بصمات اليوم" value={s?.biometric.punches_today ?? '…'} hint="كل المصادر" tone={s ? 'ok' : 'muted'} testId="bio-today" />
          <Card title="غير مطابَقة اليوم" value={s?.biometric.unmatched_today ?? '…'} hint="PIN بلا موظف — تُربط من HR" tone={!s ? 'muted' : s.biometric.unmatched_today ? 'warn' : 'ok'} testId="bio-unmatched" />
          <Card title="عمليات سحب فاشلة (٢٤ س)" value={s?.biometric.failed_pulls_24h ?? '…'} hint="التفاصيل في سجل العمليات" tone={!s ? 'muted' : s.biometric.failed_pulls_24h ? 'bad' : 'ok'} testId="bio-failed" />
        </div>
        <div className="mt-2 overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-xs">
            <thead><tr className="border-b bg-slate-900 text-right text-white">{['المصدر', 'النمط', 'آخر اتصال', 'آخر بصمة', 'اليوم', 'آخر سحب', 'أوامر معلّقة'].map((h) => <th key={h} className="px-3 py-2 font-black">{h}</th>)}</tr></thead>
            <tbody>
              {devices.map((d) => {
                const tone = deviceTone(d)
                return (
                  <tr key={d.id} className="border-b odd:bg-slate-50/50" data-testid={`device-${d.serial}`} data-tone={tone}>
                    <td className="px-3 py-2"><span className={clsx('me-1 inline-block h-2.5 w-2.5 rounded-full', tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-rose-500' : 'bg-slate-400')} /><b>{d.name}</b><span className="ms-1 text-slate-400" dir="ltr">{d.serial}</span>{!d.is_active && <span className="ms-1 rounded-full bg-slate-200 px-1.5 text-[10px]">موقوف</span>}</td>
                    <td className="px-3 py-2">{MODE[d.mode] ?? d.mode}</td>
                    <td className="px-3 py-2" title={fmt(d.last_seen_at)}>{ago(d.last_seen_at)}{d.bridge_last_error && <p className="text-[10px] text-rose-700" dir="ltr">{d.bridge_last_error}</p>}</td>
                    <td className="px-3 py-2" title={fmt(d.last_punch_at)}>{ago(d.last_punch_at)}</td>
                    <td className="px-3 py-2" dir="ltr">{d.punches_today}</td>
                    <td className="px-3 py-2">{d.last_pull ? <span className={clsx('rounded-full border px-2 py-0.5 font-black', TONE[d.last_pull.status === 'success' ? 'ok' : d.last_pull.status === 'partial' ? 'warn' : 'bad'])} title={d.last_pull.error ?? ''}>{d.last_pull.status === 'success' ? 'نجح' : d.last_pull.status === 'partial' ? 'جزئي' : 'فشل'} · {ago(d.last_pull.started_at)}{d.last_pull.error ? ` · ${d.last_pull.error}` : ''}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2" dir="ltr">{d.queued_commands}</td>
                  </tr>
                )
              })}
              {s && !devices.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">لا مصادر بصمة مسجلة بعد — تُسجَّل من «البصمة» في التكاملات.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black">٣ · الدوال الطرفية (Edge Functions) {edge.data && <span className={clsx('ms-1 rounded-full border px-2 py-0.5 text-[10px]', TONE[edgeDown ? 'bad' : 'ok'])} data-testid="edge-summary">{edgeDown ? `${edgeDown} غير منشورة/لا تستجيب` : 'كلها تستجيب'}</span>}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="edge-grid">
          {(edge.data ?? []).map((e) => (
            <div key={e.name} className={clsx('flex items-center justify-between rounded-xl border px-3 py-2 text-xs', TONE[e.state === 'up' ? 'ok' : e.state === 'down' ? 'bad' : 'muted'])} data-testid={`edge-${e.name}`}>
              <div><b dir="ltr">{e.name}</b><p className="text-[10px] opacity-80">{e.what}</p></div>
              <span dir="ltr" className="font-black">{e.state === 'up' ? `${e.latency_ms} ms` : 'لا ردّ'}</span>
            </div>
          ))}
          {edge.isLoading && <p className="text-xs text-slate-500">جارٍ الفحص…</p>}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">الفحص = هل الدالة منشورة وتردّ؟ (لا يشغّل منطقها). «لا ردّ» ⇒ انشرها: npx supabase functions deploy &lt;الاسم&gt; — راجع دليل الاستضافة.</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black">٤ · GPS</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="gps-cards">
          <Card title="آخر إحداثية" value={ago(s?.gps.last_fix_at)} hint={fmt(s?.gps.last_fix_at)} tone={!s ? 'muted' : !s.gps.last_fix_at ? 'muted' : Date.now() - new Date(s.gps.last_fix_at).getTime() < 600_000 ? 'ok' : 'warn'} testId="gps-last" />
          <Card title="آليات أرسلت خلال ١٠ دقائق" value={s?.gps.vehicles_10m ?? '…'} tone={!s ? 'muted' : s.gps.vehicles_10m ? 'ok' : 'warn'} testId="gps-live" />
        </div>
      </section>
    </div>
  )
}

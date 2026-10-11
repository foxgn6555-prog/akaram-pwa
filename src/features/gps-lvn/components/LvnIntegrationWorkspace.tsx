/**
 * 00211 — «سلامة التكامل» (LVN والمزامنة): نُقلت من غرفة العمليات إلى بوابة التطوير المركزية
 * (IT ← التكاملات ← سلامة تكامل GPS). خط البيانات، اختبار الاتصال، المزامنة، تشخيص المجدول،
 * سجل المزامنة، وشرح آخر فشل بالعربية (00210).
 */
import type { ReactNode } from 'react'
import { BarChart3, PlugZap, RefreshCw, Sparkles } from 'lucide-react'
import {
  useGpsDashboard,
  useGpsSchedulerHealth,
  useGpsSync,
  useGpsSyncRuns,
} from '@features/gps-lvn/hooks'
import { explainLvnError } from '@features/gps-lvn/lvn-errors'

const fmt = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(v))
    : 'غير متوفر'
function durationLabel(seconds: number) {
  const s = Math.max(0, Number(seconds || 0)),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60)
  return h ? `${h}س ${m}د` : `${m}د`
}
function SectionHead({ icon: Icon, title, subtitle, badge }: { icon: typeof BarChart3; title: string; subtitle: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-slate-900 text-cyan-300">
          <Icon size={17} />
        </span>
        <div>
          <h2 className="text-sm font-black">{title}</h2>
          <p className="text-[10px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      {badge && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{badge}</span>}
    </div>
  )
}
function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
      {children}
    </span>
  )
}

export default function LvnIntegrationWorkspace() {
  const dash = useGpsDashboard(),
    runsQ = useGpsSyncRuns(),
    healthQ = useGpsSchedulerHealth(),
    sync = useGpsSync()
  const dashboard = dash.data,
    runs = runsQ.data ?? [],
    health = healthQ.data,
    syncing = sync.isPending,
    onTest = () => sync.mutate('test'),
    onSync = () => sync.mutate(dashboard?.last_full_sync_at ? 'incremental' : 'full')
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <article className="rounded-[1.75rem] bg-slate-950 p-5 text-white">
          <Sparkles className="text-cyan-300" />
          <h2 className="mt-4 text-xl font-black">سلامة خط البيانات</h2>
          <p className="mt-2 text-xs leading-6 text-slate-400">
            LVN ← الموصل الآمن ← Supabase ← غرفة العمليات
          </p>
          <div className="mt-5 space-y-2">
            <PipelineStep label="خدمة LVN" ok={!dashboard?.last_error_code} />
            <PipelineStep label="المزامنة الخادمية" ok={Boolean(dashboard?.last_success_at)} />
            <PipelineStep label="قاعدة المسارات" ok={Boolean(dashboard?.last_full_sync_at)} />
          </div>
        </article>
        {(() => {
          // 00210: آخر خطأ مزامنة مشروحاً بالعربية — نأخذه من آخر تشغيل فاشل، أو من حالة المزوّد
          const lastFailed = (runs ?? []).find((r) => r.status === 'failed' && r.error_code)
          const code = lastFailed?.error_code ?? dashboard?.last_error_code ?? null
          if (!code) return null
          const e = explainLvnError(code)
          const tone = e.kind === 'credentials' ? 'border-rose-300 bg-rose-50' : e.kind === 'busy' ? 'border-amber-200 bg-amber-50' : 'border-orange-200 bg-orange-50'
          return (
            <article data-testid="lvn-error-explain" data-kind={e.kind} className={`rounded-[1.75rem] border p-4 text-xs shadow-sm ${tone}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900">{e.title}</h3>
                <code className="shrink-0 rounded-lg bg-white/80 px-2 py-0.5 text-[10px] font-bold text-rose-700" dir="ltr">{e.code}</code>
              </div>
              <p className="mt-2 leading-5 text-slate-700"><span className="font-black">السبب:</span> {e.cause}</p>
              <p className="mt-1 leading-5 text-slate-700"><span className="font-black">الإجراء:</span> {e.action}</p>
              <p className="mt-1 text-[10px] text-slate-500">الجهة المعنية: {e.owner}{lastFailed ? ` · آخر فشل: ${fmt(lastFailed.started_at)}` : ''}</p>
            </article>
          )
        })()}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onTest}
            disabled={syncing}
            className="rounded-2xl border bg-white p-4 text-xs font-black"
          >
            <PlugZap className="mx-auto mb-2 text-cyan-700" />
            اختبار الاتصال
          </button>
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded-2xl bg-cyan-400 p-4 text-xs font-black text-slate-950"
          >
            <RefreshCw className={`mx-auto mb-2 ${syncing ? 'animate-spin' : ''}`} />
            مزامنة الآن
          </button>
        </div>
        <article className="rounded-[1.75rem] border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black">تشخيص المجدول الخادمي</h3>
            <span
              className={`size-3 rounded-full ${health?.gps_schedule_healthy && health?.push_schedule_healthy ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <PipelineStep
              label="تحديث GPS كل 1–3 دقائق"
              ok={Boolean(health?.gps_schedule_healthy)}
            />
            <PipelineStep label="موزع Push بلا تراكم" ok={Boolean(health?.push_schedule_healthy)} />
            <div className="grid grid-cols-2 gap-2">
              <SmallMetric label="Push مستحق" value={health?.push_overdue ?? 0} />
              <SmallMetric label="عالق بالمعالجة" value={health?.push_processing_stuck ?? 0} />
              <SmallMetric label="فشل 24 ساعة" value={health?.push_failed_24h ?? 0} />
              <SmallMetric label="أجهزة Push" value={health?.active_push_subscriptions ?? 0} />
            </div>
          </div>
          <p className="mt-3 text-[9px] leading-4 text-slate-500">
            آخر تحديث تلقائي: {fmt(health?.last_incremental_at ?? null)}. الحالة الصفراء تعني أن
            إعداد Cron الخارجي يحتاج مراجعة، ولا تعرض أي مفاتيح سرية.
          </p>
        </article>
      </aside>
      <article className="overflow-hidden rounded-[1.75rem] border bg-white">
        <SectionHead
          icon={BarChart3}
          title="سجل المزامنة"
          subtitle="الصفحات والعناصر والأخطاء الآمنة"
          badge={String(runs?.length ?? 0)}
        />
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-slate-100">
              <tr>
                {[
                  'العملية',
                  'الحالة',
                  'البداية',
                  'المدة',
                  'الصفحات',
                  'المستلم',
                  'الجديد / المحدث',
                  'الخطأ',
                ].map((x) => (
                  <th key={x} className="p-3 text-right">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="p-3 font-bold">
                    {run.sync_type === 'full'
                      ? 'مزامنة كاملة'
                      : run.sync_type === 'incremental'
                        ? 'تحديث جزئي'
                        : 'اختبار اتصال'}
                  </td>
                  <td className="p-3">
                    <Status ok={run.status === 'success'}>
                      {run.status === 'success'
                        ? 'ناجحة'
                        : run.status === 'running'
                          ? 'قيد التنفيذ'
                          : 'فشلت'}
                    </Status>
                  </td>
                  <td className="p-3">{fmt(run.started_at)}</td>
                  <td className="p-3">
                    {run.finished_at
                      ? durationLabel(
                          (new Date(run.finished_at).getTime() -
                            new Date(run.started_at).getTime()) /
                            1000,
                        )
                      : '—'}
                  </td>
                  <td className="p-3">{run.pages_count}</td>
                  <td className="p-3">{run.received_count}</td>
                  <td className="p-3">
                    {run.inserted_count} / {run.updated_count}
                  </td>
                  <td className="p-3 text-rose-700">
                    {run.error_code ? (
                      <span title={explainLvnError(run.error_code).cause}>
                        <span className="font-bold">{explainLvnError(run.error_code).title}</span>
                        <span className="mr-1 text-[10px] text-slate-500" dir="ltr">({run.error_code})</span>
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  )
}
function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <small className="block text-[9px] text-slate-500">{label}</small>
      <b>{value}</b>
    </div>
  )
}
function PipelineStep({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-xs">
      <span>{label}</span>
      <span className={ok ? 'text-emerald-300' : 'text-rose-300'}>
        {ok ? '● سليم' : '● يحتاج متابعة'}
      </span>
    </div>
  )
}
/** 00337: تقرير أداء الموافقات — مشترك بين التطوير المركزية والمدير المفوض (approval_performance_report).
 * زمن كل خطوة = من لحظة وصولها للموافِق (pending_at) حتى القرار. يعرض: ملخص، حسب النوع، حسب الخطوة، حسب الموافِق، المفتوحة الآن (المتأخرون أولاً)، التصعيدات.
 * أرقام لاتينية (قاعدة التقارير)، طباعة نظيفة. */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useApprovalPerformance } from '@features/sector-manager/hooks'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const hrs = (h: number | null | undefined) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} د` : h < 48 ? `${h.toFixed(1)} س` : `${(h / 24).toFixed(1)} يوم`)
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('ar-IQ-u-nu-latn', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')

type Preset = '7' | '30' | '90' | 'custom'
export function ApprovalPerformancePage({ testId = 'approval-performance' }: { testId?: string }) {
  const today = useMemo(() => iso(new Date()), [])
  const [preset, setPreset] = useState<Preset>('30')
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return iso(d) })
  const [to, setTo] = useState(today)
  const pick = (p: Preset) => { setPreset(p); if (p !== 'custom') { const d = new Date(); d.setDate(d.getDate() - (Number(p) - 1)); setFrom(iso(d)); setTo(today) } }
  const q = useApprovalPerformance(from, to)
  const r = q.data, s = r?.summary
  return (
    <div className="space-y-4 pb-6 print:space-y-2" data-testid={testId}>
      <ExecPageHeader icon="gauge" title="أداء الموافقات" subtitle="كم تستغرق كل خطوة؟ من يتأخر؟ ما الذي صُعِّد تلقائياً؟ — زمن الخطوة يُحسب من لحظة وصولها للموافِق حتى قراره"
        stats={s ? [
          { label: 'قرارات في الفترة', value: s.decided, testId: `${testId}-decided` },
          { label: 'متوسط زمن الخطوة', value: hrs(s.avg_hours), tone: 'gold', testId: `${testId}-avg` },
          { label: 'متأخرة الآن', value: s.overdue_now, tone: s.overdue_now ? 'red' : 'green', testId: `${testId}-overdue` },
          { label: 'تصعيدات', value: s.escalated, tone: s.escalated ? 'red' : 'plain', testId: `${testId}-escalated` },
        ] : undefined} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 print:hidden" data-testid={`${testId}-filters`}>
        {(['7', '30', '90'] as Preset[]).map((p) => <button key={p} type="button" data-testid={`${testId}-preset-${p}`} onClick={() => pick(p)} className={clsx('rounded-xl px-3 py-1.5 text-sm font-bold', preset === p ? 'bg-slate-900 text-white' : 'border bg-white')}>آخر {p} يوماً</button>)}
        <label className="text-xs font-bold text-slate-600">من <input type="date" data-testid={`${testId}-from`} value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }} className="ms-1 h-9 rounded-xl border px-2 text-sm" /></label>
        <label className="text-xs font-bold text-slate-600">إلى <input type="date" data-testid={`${testId}-to`} value={to} min={from} max={today} onChange={(e) => { setPreset('custom'); setTo(e.target.value) }} className="ms-1 h-9 rounded-xl border px-2 text-sm" /></label>
        <span className="flex-1" />
        <button type="button" onClick={() => window.print()} className="rounded-xl border px-3 py-1.5 text-sm font-bold">طباعة</button>
      </div>

      {q.isLoading ? <LoadingSpinner /> : q.isError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid={`${testId}-error`}>تعذّر تحميل التقرير.</div> : r && s ? (
        <>
          <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid={`${testId}-summary`}>
            {[
              ['موافقة', s.approved], ['رفض', s.rejected], ['الوسيط', hrs(s.median_hours)],
              ['ضمن المهلة', `${pct(s.within_sla, s.with_sla)}${s.with_sla ? ` (${s.within_sla}/${s.with_sla})` : ''}`],
              ['بالتفويض', s.delegated], ['مفتوحة الآن', `${s.open_now} · ${hrs(s.open_avg_hours)}`],
            ].map(([l, v]) => <div key={String(l)} className="rounded-2xl border bg-white p-3 text-center"><div className="text-xs text-slate-500">{l}</div><div className="text-lg font-black tabular-nums">{v}</div></div>)}
          </section>

          <Block title="حسب نوع الطلب" testId={`${testId}-kinds`} empty={r.by_kind.length === 0}>
            <Table head={['النوع', 'قرارات', 'رفض', 'متوسط', 'أقصى', 'مفتوحة الآن']} rows={r.by_kind.map((k) => [k.label, k.decided, k.rejected, hrs(k.avg_hours), hrs(k.max_hours), k.open_now])} rowTestId={(i) => `${testId}-kind-${r.by_kind[i]?.kind}`} />
          </Block>
          <Block title="حسب الخطوة (الأبطأ أولاً)" testId={`${testId}-steps`} empty={r.by_step.length === 0}>
            <Table head={['النوع', 'الخطوة', 'قرارات', 'متوسط', 'أقصى', 'تجاوزت المهلة', 'مفتوحة الآن']} rows={r.by_step.map((x) => [x.kind_label, x.step_label, x.decided, hrs(x.avg_hours), hrs(x.max_hours), x.overdue, x.open_now])} highlight={(i) => (r.by_step[i]?.overdue ?? 0) > 0} rowTestId={(i) => `${testId}-step-${i}`} />
          </Block>
          <Block title="حسب الموافِق (المتأخرون أولاً)" testId={`${testId}-approvers`} empty={r.by_approver.length === 0}>
            <Table head={['الموافِق', 'قرارات', 'متوسط', 'بالتفويض', 'معلّقة لديه الآن', 'متأخرة الآن']} rows={r.by_approver.map((a) => [a.name, a.decided, hrs(a.avg_hours), a.as_delegate, a.pending_now, a.overdue_now])} highlight={(i) => (r.by_approver[i]?.overdue_now ?? 0) > 0} rowTestId={(i) => `${testId}-approver-${r.by_approver[i]?.user_id}`} />
          </Block>
          <Block title="المفتوحة الآن (الأطول انتظاراً أولاً)" testId={`${testId}-open`} empty={r.open_tasks.length === 0}>
            <Table head={['النوع', 'الخطوة', 'بانتظار', 'منذ', 'المهلة', 'الحالة']} rows={r.open_tasks.map((t) => [t.kind_label, `${t.step_no}. ${t.step_label}`, t.approvers ?? '—', hrs(t.hours), dt(t.due_at), t.overdue ? (t.escalated ? 'متأخرة · صُعِّدت' : 'متأخرة') : 'ضمن المهلة'])} highlight={(i) => Boolean(r.open_tasks[i]?.overdue)} rowTestId={(i) => `${testId}-open-${i}`} />
          </Block>
          <Block title="التصعيدات التلقائية في الفترة" testId={`${testId}-escalations`} empty={r.escalations.length === 0}>
            <Table head={['النوع', 'الخطوة', 'كانت بانتظار', 'وقت التصعيد', 'النتيجة']} rows={r.escalations.map((e) => [e.kind_label, e.step_label, e.approvers ?? '—', dt(e.escalated_at), e.status === 'skipped' ? 'انتقلت للخطوة التالية' : e.status === 'pending' ? 'ما زالت معلّقة (لا خطوة تالية)' : e.status])} rowTestId={(i) => `${testId}-esc-${i}`} />
          </Block>
        </>
      ) : null}
    </div>
  )
}

function Block({ title, testId, empty, children }: { title: string; testId: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4 print:break-inside-avoid" data-testid={testId}>
      <h2 className="mb-2 text-base font-extrabold">{title}</h2>
      {empty ? <p className="text-sm text-slate-500" data-testid={`${testId}-empty`}>لا بيانات في هذه الفترة.</p> : children}
    </section>
  )
}
function Table({ head, rows, highlight, rowTestId }: { head: string[]; rows: Array<Array<string | number>>; highlight?: (i: number) => boolean; rowTestId?: (i: number) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums" dir="rtl">
        <thead><tr className="bg-slate-50 text-xs text-slate-600">{head.map((h) => <th key={h} className="px-2 py-1.5 text-right font-bold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((cells, i) => <tr key={i} data-testid={rowTestId?.(i)} className={clsx('border-t', highlight?.(i) && 'bg-red-50 font-bold text-red-900')}>{cells.map((c, j) => <td key={j} className="px-2 py-1.5">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

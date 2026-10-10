/**
 * 00193 · مكوّنات المرحلتين في وحدة الحضوريات (00205: شبكة أوضح — شريط لون لكل حالة، أحرف أولى، عمود اليوم، خلايا قابلة للنقر، دليل بمربعات):
 *   StageBar  — شريط المراحل (١ التدقيق التفصيلي → ٢ اعتماد الشهر → ٣ الكشف المعتمد → ٤ التصدير للمالية) بحالة حيّة.
 *   MonthGrid — شبكة موظف × أيام: «detailed» بالأوقات والألوان (المرحلة 1) أو «approved» بحاضر/غائب/مجاز فقط (المرحلة 2)،
 *               مجمّعة بالقسم، مع ملخص كل موظف (ساعات العمل، أيام الحضور/الغياب/الإجازة) وتمرير أفقي يناسب الهاتف.
 */
import { useMemo } from 'react'
import type React from 'react'
import clsx from 'clsx'
import type { AttendanceConfirmation, AttendanceGridCell, AttendanceGridRow } from '@features/hr'
import { APPROVED_LABEL, approvedKind, DETAIL_LABEL, fmtHM } from '@features/hr/lib/attendanceExcel'
import { Icon } from '@components/ui/Icon/Icon'

export type Stage = 'detailed' | 'approved'
const WEEKDAY_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']

/** حالة الشهر في سطر واحد (شريحة في رأس الصفحة) */
function monthState(conf: AttendanceConfirmation | undefined): { key: 'open' | 'reopened' | 'confirmed' | 'exported' | 'locked'; label: string; cls: string } {
  if (conf?.locked || conf?.export?.status === 'approved') return { key: 'locked', label: 'مقفل باعتماد المالية', cls: 'bg-slate-800 text-white' }
  if (conf?.export?.status) return { key: 'exported', label: `مُصدَّر للمالية · v${conf.export.version ?? 1} · بانتظار اعتمادها`, cls: 'bg-sky-100 text-sky-900' }
  if (conf?.confirmed) return { key: 'confirmed', label: 'معتمد من غرفة العمليات · لم يُصدَّر بعد', cls: 'bg-emerald-100 text-emerald-900' }
  if (conf?.status === 'reopened') return { key: 'reopened', label: 'مُعاد فتحه · بانتظار إعادة الاعتماد', cls: 'bg-amber-100 text-amber-900' }
  return { key: 'open', label: 'قيد التدقيق', cls: 'bg-slate-100 text-slate-700' }
}

export function MonthStateChip({ conf }: { conf: AttendanceConfirmation | undefined }) {
  const st = monthState(conf)
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold', st.cls)} data-testid="att-month-state" data-state={st.key}>{st.key === 'locked' && '🔒 '}{st.label}</span>
}

/**
 * شريط المراحل: مرحلتان رئيسيتان (زرّان كبيران = التنقل الوحيد بين الشاشتين) وتحت كل منهما خطواتها الفرعية بحالة حيّة:
 *   المرحلة ١ «التدقيق التفصيلي»: ① التدقيق بالأوقات → ② اعتماد الشهر
 *   المرحلة ٢ «الكشف المعتمد»:     ③ الكشف النهائي → ④ التصدير للمالية
 */
export function StageBar({ conf, stage, onStage }: { conf: AttendanceConfirmation | undefined; stage: Stage; onStage: (s: Stage) => void }) {
  const confirmed = !!conf?.confirmed
  const exported = !!conf?.export?.status
  const locked = !!conf?.locked || conf?.export?.status === 'approved'
  const steps = [
    { n: 1, phase: 'detailed' as Stage, label: 'التدقيق بالأوقات', hint: conf?.status === 'reopened' && !confirmed ? `مُعاد فتحه: ${conf.reopen_reason ?? ''}` : 'كل تعديل بسبب موثّق', done: confirmed || locked, active: stage === 'detailed' && !confirmed && !locked },
    { n: 2, phase: 'detailed' as Stage, label: 'اعتماد الشهر', hint: conf?.confirmed_at ? `${conf.confirmed_by_name ?? ''} · ${new Date(conf.confirmed_at).toLocaleDateString('ar-IQ-u-nu-latn')}` : 'بعد اكتمال التدقيق', done: confirmed || locked, active: false },
    { n: 3, phase: 'approved' as Stage, label: 'الكشف المعتمد', hint: 'حاضر / غائب / مجاز', done: exported || locked, active: stage === 'approved' && confirmed && !exported && !locked },
    { n: 4, phase: 'approved' as Stage, label: 'التصدير للمالية', hint: locked ? 'اعتمدته المالية وأُقفل' : exported ? `إصدار v${conf?.export?.version ?? 1} · بانتظار المالية` : 'بعد الاعتماد', done: exported || locked, active: stage === 'approved' && exported && !locked },
  ]
  const phases: { key: Stage; n: string; title: string; sub: string; testId: string; locked: boolean }[] = [
    { key: 'detailed', n: '١', title: 'التدقيق التفصيلي', sub: 'سجلات وأوقات · تعديلات · استقطاعات', testId: 'stage-detailed', locked: false },
    { key: 'approved', n: '٢', title: 'الكشف المعتمد والتصدير', sub: confirmed || locked ? 'جاهز' : 'يُفتح بعد اعتماد الشهر', testId: 'stage-approved', locked: !confirmed && !locked },
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="att-stage-bar" role="tablist" aria-label="مراحل الحضورية">
      {phases.map((p) => {
        const current = stage === p.key
        const tone = p.key === 'detailed' ? 'brand' : 'emerald'
        return (
          <button key={p.key} type="button" role="tab" aria-selected={current} onClick={() => onStage(p.key)} data-testid={p.testId}
            className={clsx('rounded-2xl border p-3 text-start shadow-sm transition', current ? (tone === 'brand' ? 'border-brand-500 bg-white ring-2 ring-brand-200' : 'border-emerald-500 bg-white ring-2 ring-emerald-200') : 'border-slate-200 bg-slate-50 hover:bg-white')}>
            <span className="flex items-center gap-2">
              <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black', current ? (tone === 'brand' ? 'bg-brand-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-200 text-slate-600')}>{p.locked ? <Icon name="lock" size={14} /> : p.n}</span>
              <span className="min-w-0"><span className={clsx('block text-sm font-black', current ? 'text-slate-900' : 'text-slate-600')}>{p.title}</span><span className="block truncate text-[11px] text-slate-500">{p.sub}</span></span>
            </span>
            <ol className="mt-2 grid grid-cols-2 gap-1.5">
              {steps.filter((s) => s.phase === p.key).map((s) => (
                <li key={s.n} className={clsx('flex items-center gap-1.5 rounded-xl px-2 py-1.5', s.active ? 'bg-brand-600 text-white' : s.done ? 'bg-emerald-50 text-emerald-900' : 'bg-white text-slate-500 ring-1 ring-slate-100')} data-testid={`att-stage-${s.n}`} data-done={s.done} data-active={s.active}>
                  <span className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black', s.active ? 'bg-white/25' : s.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600')}>{s.done && !s.active ? '✓' : s.n}</span>
                  <span className="min-w-0"><span className="block truncate text-[11px] font-black">{s.label}</span><span className={clsx('block truncate text-[10px]', s.active ? 'text-white/80' : 'text-slate-500')}>{s.hint}</span></span>
                </li>
              ))}
            </ol>
          </button>
        )
      })}
    </div>
  )
}

/** سطر حالة موحّد داخل بطاقة «حالة الشهر» (يستبدل اللافتات المتناثرة) */
export function StatusLine({ tone, icon, children, action, testId, role }: { tone: 'emerald' | 'amber' | 'rose' | 'violet' | 'sky' | 'slate'; icon?: 'check' | 'alert-triangle' | 'lock' | 'send' | 'refresh'; children: React.ReactNode; action?: React.ReactNode; testId?: string; role?: 'status' | 'alert' }) {
  const t = { emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900', amber: 'border-amber-200 bg-amber-50 text-amber-900', rose: 'border-rose-200 bg-rose-50 text-rose-900', violet: 'border-violet-200 bg-violet-50 text-violet-900', sky: 'border-sky-200 bg-sky-50 text-sky-900', slate: 'border-slate-200 bg-slate-50 text-slate-700' }[tone]
  const ic = { emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600', violet: 'text-violet-600', sky: 'text-sky-600', slate: 'text-slate-500' }[tone]
  return (
    <div className={clsx('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs', t)} role={role} data-testid={testId}>
      {icon && <Icon name={icon} size={15} className={clsx('shrink-0', ic)} />}
      <span className="min-w-0 flex-1">{children}</span>
      {action && <span className="ms-auto flex shrink-0 flex-wrap gap-1.5">{action}</span>}
    </div>
  )
}

/** بطاقة مجمّعة بعنوان صغير — تُستخدم لحالة الشهر وجاهزية الاعتماد وبطاقة التصدير */
export function SectionCard({ title, badge, children, testId, className }: { title: string; badge?: React.ReactNode; children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <section className={clsx('space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm', className)} data-testid={testId}>
      <header className="flex items-center justify-between gap-2"><h2 className="text-xs font-black text-slate-700">{title}</h2>{badge}</header>
      {children}
    </section>
  )
}

/** 00205 — لوحة ألوان الشبكة: خلفية + شريط لون أعلى الخلية لتمييز الحالة بنظرة واحدة */
const CELL: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-900', late: 'bg-amber-50 text-amber-900', early_leave: 'bg-orange-50 text-orange-900', incomplete: 'bg-violet-50 text-violet-900',
  absent: 'bg-rose-50 text-rose-800', leave: 'bg-sky-50 text-sky-900', time_permit: 'bg-sky-50 text-sky-900', rest: 'bg-slate-50 text-slate-400', pending: 'bg-white text-slate-400', future: 'bg-white text-slate-200', none: 'bg-slate-50/60 text-slate-200',
}
const BAR: Record<string, string> = {
  present: 'bg-emerald-500', late: 'bg-amber-500', early_leave: 'bg-orange-500', incomplete: 'bg-violet-500', absent: 'bg-rose-500', leave: 'bg-sky-500', time_permit: 'bg-sky-400', rest: 'bg-slate-300', pending: 'bg-slate-200', future: 'bg-transparent', none: 'bg-transparent',
}
const KIND: Record<string, string> = { present: 'bg-emerald-100 text-emerald-900', absent: 'bg-rose-100 text-rose-800', leave: 'bg-sky-100 text-sky-900', rest: 'bg-slate-100 text-slate-400', none: 'bg-white text-slate-200' }
const KIND_BAR: Record<string, string> = { present: 'bg-emerald-500', absent: 'bg-rose-500', leave: 'bg-sky-500', rest: 'bg-slate-300', none: 'bg-transparent' }

const isFriday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5
const todayIso = () => new Date().toISOString().slice(0, 10)

function DetailCell({ c, onClick }: { c: AttendanceGridCell; onClick?: () => void }) {
  const title = `${c.d} · ${DETAIL_LABEL[c.s]}${c.in ? ` · ${c.in}→${c.out ?? '؟'}` : ''}${c.late ? ` · تأخير ${c.late} د` : ''}${c.early ? ` · مبكر ${c.early} د` : ''}${c.short ? ` · نقص ${c.short} د` : ''}${c.permit ? ` · زمنية ${c.permit} د` : ''}${c.src === 'manual' ? ` · تعديل: ${c.note ?? ''}` : ''}${c.waived ? ' · استقطاع مُلغى' : ''}${onClick ? '\nانقر لفتح سجل اليوم' : ''}`
  const clickable = !!onClick && c.s !== 'future' && c.s !== 'none'
  const body = c.s === 'absent' ? <span className="text-[11px] font-black">غائب</span>
    : c.s === 'leave' ? <span className="text-[10px] font-bold">إجازة</span>
    : c.s === 'time_permit' ? <span className="text-[10px] font-bold">زمنية</span>
    : c.s === 'rest' ? <span className="text-[9px]">راحة</span>
    : c.s === 'pending' ? <span className="text-[11px] font-bold">؟</span>
    : c.s === 'future' || c.s === 'none' ? <span className="text-[9px]">·</span>
    : (<><span className="text-[10px] font-black tabular-nums">{c.in ?? '؟'}</span><span className="text-[10px] tabular-nums opacity-80">{c.out ?? '؟'}</span></>)
  return (
    <td className={clsx('border-s border-slate-100 p-0 align-middle', CELL[c.s], c.d === todayIso() && 'shadow-[inset_0_0_0_1px_#2563eb]')} title={title} data-testid={`cell-${c.d}`} data-status={c.s}>
      <button type="button" disabled={!clickable} onClick={onClick} className={clsx('relative flex h-11 w-full min-w-[3.4rem] flex-col items-center justify-center leading-none transition', clickable && 'hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-400', c.src === 'manual' && 'ring-1 ring-inset ring-amber-400')} dir="ltr" aria-label={title} data-testid={`cell-btn-${c.d}`}>
        <span className={clsx('absolute inset-x-0 top-0 h-0.5', BAR[c.s])} aria-hidden />
        {body}
        {(c.pm > 0 || c.pd > 0) && !c.waived && c.s !== 'absent' && <span className="absolute bottom-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" aria-label="استقطاع مقترح" />}
        {c.waived && <span className="absolute bottom-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="استقطاع مُلغى" />}
      </button>
    </td>
  )
}
function ApprovedCell({ c }: { c: AttendanceGridCell }) {
  const k = approvedKind(c.s)
  return (
    <td className={clsx('border-s border-slate-100 p-0 text-center align-middle', KIND[k], c.d === todayIso() && 'shadow-[inset_0_0_0_1px_#2563eb]')} title={`${c.d} · ${APPROVED_LABEL[k]}`} data-testid={`cell-${c.d}`} data-kind={k}>
      <div className="relative flex h-9 min-w-[3rem] items-center justify-center text-[11px] font-bold"><span className={clsx('absolute inset-x-0 top-0 h-0.5', KIND_BAR[k])} aria-hidden />{k === 'none' ? '·' : APPROVED_LABEL[k]}</div>
    </td>
  )
}

/** شارة رقمية صغيرة للملخصات (0 تظهر باهتة) */
function Num({ v, tone = 'slate', bold }: { v: number | string; tone?: 'emerald' | 'amber' | 'orange' | 'violet' | 'rose' | 'sky' | 'slate'; bold?: boolean }) {
  const zero = v === 0 || v === '0' || v === '—'
  const t = { emerald: 'text-emerald-700', amber: 'text-amber-700', orange: 'text-orange-700', violet: 'text-violet-700', rose: 'text-rose-700', sky: 'text-sky-800', slate: 'text-slate-700' }[tone]
  return <span className={clsx('tabular-nums', zero ? 'text-slate-300' : t, (bold || !zero) && 'font-bold')} dir="ltr">{v}</span>
}
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('')

export function MonthGrid({ rows, mode, onRowClick, onCellClick }: { rows: AttendanceGridRow[]; mode: Stage; onRowClick?: (r: AttendanceGridRow) => void; onCellClick?: (r: AttendanceGridRow, c: AttendanceGridCell) => void }) {
  const days = rows[0]?.days ?? []
  const groups = useMemo(() => {
    const map = new Map<string, AttendanceGridRow[]>()
    for (const r of rows) { const k = r.department_name ?? 'بلا قسم'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r) }
    return [...map.entries()]
  }, [rows])
  const detailed = mode === 'detailed'
  const totalsHead = detailed
    ? ['حضور', 'تأخير', 'مبكر', 'ناقصة', 'غياب', 'إجازة', 'ساعات', 'نقص (د)', 'إضافي (د)', 'استقطاع مقترح']
    : ['أيام الحضور', 'أيام الغياب', 'أيام الإجازة', 'ساعات العمل']
  const sum = (xs: AttendanceGridRow[], k: keyof AttendanceGridRow) => xs.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  const presentOf = (r: AttendanceGridRow) => r.present_days + r.late_days + r.early_days + r.incomplete_days
  const today = todayIso()
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid={`att-grid-${mode}`}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-900 text-white">
            <th className="sticky right-0 z-20 bg-slate-900 px-3 py-2 text-start" rowSpan={2}><span className="block text-[11px] font-black">الموظف</span><span className="block text-[9px] font-normal text-slate-400">{rows.length} موظفاً · {groups.length} قسم</span></th>
            <th colSpan={days.length} className="border-b border-slate-700 px-2 py-1 text-center text-[10px] font-bold text-slate-300">أيام الشهر — انقر أي يوم لفتح سجله</th>
            <th colSpan={totalsHead.length} className="border-b border-slate-600 bg-slate-800 px-2 py-1 text-center text-[10px] font-bold text-slate-300">ملخص الشهر</th>
          </tr>
          <tr className="bg-slate-900 text-white">
            {days.map((d) => { const dt = new Date(`${d.d}T00:00:00Z`); const fri = isFriday(d.d); const isToday = d.d === today; return (
              <th key={d.d} className={clsx('px-1 py-1 text-center', fri && 'bg-slate-700', isToday && 'bg-brand-600')} title={isToday ? 'اليوم' : undefined} data-testid={`grid-day-${d.d}`}>
                <span className="block text-[12px] font-black tabular-nums leading-none">{Number(d.d.slice(8, 10))}</span>
                <span className={clsx('block text-[9px] font-normal leading-tight', fri ? 'text-amber-200' : 'text-slate-400')}>{WEEKDAY_SHORT[dt.getUTCDay()]}</span>
              </th>) })}
            {totalsHead.map((t) => <th key={t} className="whitespace-nowrap bg-slate-800 px-2 text-center text-[10px] font-bold">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map(([dept, xs]) => (
            <GroupRows key={dept} dept={dept} xs={xs} days={days.length} detailed={detailed} sum={sum} presentOf={presentOf} onRowClick={onRowClick} onCellClick={onCellClick} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ dept, xs, days, detailed, sum, presentOf, onRowClick, onCellClick }: { dept: string; xs: AttendanceGridRow[]; days: number; detailed: boolean; sum: (xs: AttendanceGridRow[], k: keyof AttendanceGridRow) => number; presentOf: (r: AttendanceGridRow) => number; onRowClick?: (r: AttendanceGridRow) => void; onCellClick?: (r: AttendanceGridRow, c: AttendanceGridCell) => void }) {
  const present = xs.reduce((a, r) => a + presentOf(r), 0)
  const chip = (l: string, v: number | string, cls: string) => <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', cls)}>{l} <b className="tabular-nums" dir="ltr">{v}</b></span>
  return (
    <>
      <tr className="bg-slate-50" data-testid={`grid-dept-${dept}`}>
        <td className="sticky right-0 z-10 bg-slate-50 px-3 py-1.5 shadow-[inset_-1px_0_0_#e2e8f0]"><span className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-800"><Icon name="folder" size={12} className="text-brand-600" /> {dept}<span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{xs.length}</span></span></td>
        <td colSpan={days} className="px-2 py-1"><span className="flex flex-wrap gap-1">{chip('حضور', present, 'bg-emerald-100 text-emerald-900')}{chip('غياب', sum(xs, 'absent_days'), 'bg-rose-100 text-rose-900')}{chip('إجازة', sum(xs, 'leave_days'), 'bg-sky-100 text-sky-900')}{chip('ساعات', fmtHM(sum(xs, 'worked_minutes')), 'bg-slate-200 text-slate-800')}</span></td>
        {detailed
          ? [present, sum(xs, 'late_days'), sum(xs, 'early_days'), sum(xs, 'incomplete_days'), sum(xs, 'absent_days'), sum(xs, 'leave_days'), fmtHM(sum(xs, 'worked_minutes')), sum(xs, 'shortfall_minutes'), sum(xs, 'overtime_minutes'), `${sum(xs, 'proposed_days')} ي / ${sum(xs, 'proposed_minutes')} د`].map((v, i) => <td key={i} className="p-1 text-center text-[11px] font-black text-slate-800 tabular-nums" dir="ltr">{v}</td>)
          : [present, sum(xs, 'absent_days'), sum(xs, 'leave_days'), fmtHM(sum(xs, 'worked_minutes'))].map((v, i) => <td key={i} className="p-1 text-center text-[11px] font-black text-slate-800 tabular-nums" dir="ltr">{v}</td>)}
      </tr>
      {xs.map((r) => (
        <tr key={r.employee_id} className={clsx('group border-t border-slate-100 hover:bg-slate-50/70', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)} data-testid={`grid-row-${r.employee_number}`}>
          <td className="sticky right-0 z-10 bg-white px-3 py-1.5 shadow-[inset_-1px_0_0_#e2e8f0] group-hover:bg-slate-50">
            <span className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-black text-brand-800 ring-1 ring-brand-100" aria-hidden>{initials(r.full_name)}</span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[12px] font-bold text-slate-900">{r.full_name}</span>
                <span className="block whitespace-nowrap text-[10px] text-slate-500" dir="ltr">{r.employee_number}{r.job_title ? ` · ${r.job_title}` : ''}</span>
                {r.unevaluated_days > 0 && detailed && <span className="mt-0.5 inline-block rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700">{r.unevaluated_days} غير محتسب</span>}
              </span>
            </span>
          </td>
          {r.days.map((c) => detailed ? <DetailCell key={c.d} c={c} onClick={onCellClick ? () => onCellClick(r, c) : undefined} /> : <ApprovedCell key={c.d} c={c} />)}
          {detailed ? (
            <>
              <td className="p-1 text-center"><Num v={presentOf(r)} tone="emerald" /></td>
              <td className="p-1 text-center"><Num v={r.late_days} tone="amber" /></td>
              <td className="p-1 text-center"><Num v={r.early_days} tone="orange" /></td>
              <td className="p-1 text-center"><Num v={r.incomplete_days} tone="violet" /></td>
              <td className="p-1 text-center"><Num v={r.absent_days} tone="rose" /></td>
              <td className="p-1 text-center"><Num v={r.leave_days} tone="sky" /></td>
              <td className="p-1 text-center"><Num v={fmtHM(r.worked_minutes)} tone="slate" /></td>
              <td className="p-1 text-center"><Num v={r.shortfall_minutes} tone="rose" /></td>
              <td className="p-1 text-center"><Num v={r.overtime_minutes} tone="emerald" /></td>
              <td className="whitespace-nowrap p-1 text-center text-[11px]" data-testid={`grid-proposed-${r.employee_number}`}>{r.proposed_days > 0 || r.proposed_minutes > 0 ? <span className="rounded-md bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700 ring-1 ring-rose-100">{`${r.proposed_days > 0 ? `${r.proposed_days} يوم` : ''}${r.proposed_days > 0 && r.proposed_minutes > 0 ? ' + ' : ''}${r.proposed_minutes > 0 ? `${r.proposed_minutes} د` : ''}`}</span> : <span className="text-slate-300">—</span>}</td>
            </>
          ) : (
            <>
              <td className="p-1 text-center font-black text-emerald-700" data-testid={`grid-present-${r.employee_number}`}>{presentOf(r)}</td>
              <td className={clsx('p-1 text-center font-black', r.absent_days > 0 ? 'text-rose-700' : 'text-slate-300')} data-testid={`grid-absent-${r.employee_number}`}>{r.absent_days}</td>
              <td className={clsx('p-1 text-center font-black', r.leave_days > 0 ? 'text-sky-800' : 'text-slate-300')} data-testid={`grid-leave-${r.employee_number}`}>{r.leave_days}</td>
              <td className="p-1 text-center font-bold tabular-nums" dir="ltr" data-testid={`grid-hours-${r.employee_number}`}>{fmtHM(r.worked_minutes)}</td>
            </>
          )}
        </tr>
      ))}
    </>
  )
}

/** 00205 — دليل ألوان بمربعات واضحة بدل نصوص صغيرة */
export function GridLegend({ mode }: { mode: Stage }) {
  const items: Array<[string, string]> = mode === 'detailed'
    ? [['present', 'حاضر (أول / آخر بصمة)'], ['late', 'متأخر'], ['early_leave', 'خروج مبكر'], ['incomplete', 'بصمة ناقصة'], ['absent', 'غائب'], ['leave', 'إجازة / زمنية'], ['rest', 'راحة'], ['pending', '؟ غير محتسب']]
    : [['present', 'حاضر'], ['absent', 'غائب'], ['leave', 'مجاز'], ['rest', 'راحة']]
  const bar = mode === 'detailed' ? BAR : KIND_BAR
  const bg = mode === 'detailed' ? CELL : KIND
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700" data-testid={`grid-legend-${mode}`}>
      <span className="font-black text-slate-500">الدليل:</span>
      {items.map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={clsx('relative inline-block h-3.5 w-3.5 overflow-hidden rounded-[4px] ring-1 ring-slate-200', bg[k])}><span className={clsx('absolute inset-x-0 top-0 h-0.5', bar[k])} /></span>{l}</span>)}
      {mode === 'detailed' && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-[4px] ring-2 ring-inset ring-amber-400" />تعديل غرفة العمليات</span>}
      {mode === 'detailed' && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />استقطاع مقترح</span>}
      {mode === 'detailed' && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />استقطاع مُلغى بسبب</span>}
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-[4px] ring-1 ring-inset ring-blue-600" />اليوم</span>
    </div>
  )
}

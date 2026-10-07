/**
 * 00193 · مكوّنات المرحلتين في وحدة الحضوريات:
 *   StageBar  — شريط المراحل (١ التدقيق التفصيلي → ٢ اعتماد الشهر → ٣ الكشف المعتمد → ٤ التصدير للمالية) بحالة حيّة.
 *   MonthGrid — شبكة موظف × أيام: «detailed» بالأوقات والألوان (المرحلة 1) أو «approved» بحاضر/غائب/مجاز فقط (المرحلة 2)،
 *               مجمّعة بالقسم، مع ملخص كل موظف (ساعات العمل، أيام الحضور/الغياب/الإجازة) وتمرير أفقي يناسب الهاتف.
 */
import { useMemo } from 'react'
import clsx from 'clsx'
import type { AttendanceConfirmation, AttendanceGridCell, AttendanceGridRow } from '@features/hr'
import { APPROVED_LABEL, approvedKind, DETAIL_LABEL, fmtHM } from '@features/hr/lib/attendanceExcel'
import { Icon } from '@components/ui/Icon/Icon'

export type Stage = 'detailed' | 'approved'
const WEEKDAY_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']

export function StageBar({ conf, stage, onStage }: { conf: AttendanceConfirmation | undefined; stage: Stage; onStage: (s: Stage) => void }) {
  const confirmed = !!conf?.confirmed
  const exported = !!conf?.export?.status
  const locked = !!conf?.locked
  const steps = [
    { n: 1, label: 'التدقيق التفصيلي', hint: 'الأوقات والتعديلات', done: confirmed || locked, active: stage === 'detailed' && !confirmed, go: () => onStage('detailed') },
    { n: 2, label: 'اعتماد الشهر', hint: conf?.confirmed_at ? `${conf.confirmed_by_name ?? ''} · ${new Date(conf.confirmed_at).toLocaleDateString('ar-IQ-u-nu-latn')}` : 'بعد اكتمال التدقيق', done: confirmed || locked, active: false, go: () => onStage('detailed') },
    { n: 3, label: 'الكشف المعتمد', hint: 'حاضر / غائب / مجاز', done: exported || locked, active: stage === 'approved' && confirmed, go: () => onStage('approved') },
    { n: 4, label: 'التصدير للمالية', hint: locked ? 'معتمد ومقفل' : exported ? `إصدار v${conf?.export?.version ?? 1}` : 'بعد الاعتماد', done: exported || locked, active: false, go: () => onStage('approved') },
  ]
  return (
    <ol className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-4" data-testid="att-stage-bar" aria-label="مراحل الحضورية">
      {steps.map((s) => (
        <li key={s.n}>
          <button type="button" onClick={s.go} className={clsx('flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start transition', s.active ? 'bg-brand-600 text-white shadow' : s.done ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-500')} data-testid={`att-stage-${s.n}`} data-done={s.done} data-active={s.active}>
            <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black', s.active ? 'bg-white/20' : s.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600')}>{s.done && !s.active ? '✓' : s.n}</span>
            <span className="min-w-0"><span className="block truncate text-xs font-black">{s.label}</span><span className={clsx('block truncate text-[10px]', s.active ? 'text-white/80' : 'text-slate-500')}>{s.hint}</span></span>
          </button>
        </li>
      ))}
    </ol>
  )
}

const CELL: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-800', late: 'bg-amber-50 text-amber-800', early_leave: 'bg-orange-50 text-orange-800', incomplete: 'bg-violet-50 text-violet-800',
  absent: 'bg-rose-50 text-rose-700', leave: 'bg-sky-50 text-sky-800', time_permit: 'bg-sky-50 text-sky-800', rest: 'bg-slate-100 text-slate-400', pending: 'bg-white text-slate-300', future: 'bg-white text-slate-200', none: 'bg-slate-50 text-slate-200',
}
const KIND: Record<string, string> = { present: 'bg-emerald-100 text-emerald-900', absent: 'bg-rose-100 text-rose-800', leave: 'bg-sky-100 text-sky-900', rest: 'bg-slate-100 text-slate-400', none: 'bg-white text-slate-200' }

function DetailCell({ c }: { c: AttendanceGridCell }) {
  const title = `${c.d} · ${DETAIL_LABEL[c.s]}${c.in ? ` · ${c.in}→${c.out ?? '؟'}` : ''}${c.late ? ` · تأخير ${c.late} د` : ''}${c.early ? ` · مبكر ${c.early} د` : ''}${c.short ? ` · نقص ${c.short} د` : ''}${c.permit ? ` · زمنية ${c.permit} د` : ''}${c.src === 'manual' ? ` · تعديل: ${c.note ?? ''}` : ''}${c.waived ? ' · استقطاع مُلغى' : ''}`
  return (
    <td className={clsx('border-s border-slate-100 p-0 text-center align-middle', CELL[c.s])} title={title} data-testid={`cell-${c.d}`} data-status={c.s}>
      <div className={clsx('flex h-10 min-w-[3.4rem] flex-col items-center justify-center leading-none', c.src === 'manual' && 'ring-1 ring-inset ring-amber-400')} dir="ltr">
        {c.s === 'absent' ? <span className="text-[11px] font-black">غ</span>
          : c.s === 'leave' ? <span className="text-[10px] font-bold">إجازة</span>
          : c.s === 'rest' ? <span className="text-[9px]">راحة</span>
          : c.s === 'pending' ? <span className="text-[11px]">؟</span>
          : c.s === 'future' || c.s === 'none' ? <span className="text-[9px]">·</span>
          : (<><span className="text-[10px] font-bold tabular-nums">{c.in ?? '؟'}</span><span className="text-[10px] tabular-nums">{c.out ?? '؟'}</span></>)}
        {(c.pm > 0 || c.pd > 0) && !c.waived && c.s !== 'absent' && <span className="mt-0.5 h-1 w-1 rounded-full bg-rose-500" aria-label="استقطاع مقترح" />}
      </div>
    </td>
  )
}
function ApprovedCell({ c }: { c: AttendanceGridCell }) {
  const k = approvedKind(c.s)
  return (
    <td className={clsx('border-s border-slate-100 p-0 text-center align-middle', KIND[k])} title={`${c.d} · ${APPROVED_LABEL[k]}`} data-testid={`cell-${c.d}`} data-kind={k}>
      <div className="flex h-9 min-w-[3rem] items-center justify-center text-[11px] font-bold">{k === 'none' ? '·' : APPROVED_LABEL[k]}</div>
    </td>
  )
}

export function MonthGrid({ rows, mode, onRowClick }: { rows: AttendanceGridRow[]; mode: Stage; onRowClick?: (r: AttendanceGridRow) => void }) {
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
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid={`att-grid-${mode}`}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800 text-white">
            <th className="sticky right-0 z-20 bg-slate-800 p-2 text-start" rowSpan={2}>الموظف</th>
            {days.map((d) => { const dt = new Date(`${d.d}T00:00:00Z`); const fri = dt.getUTCDay() === 5; return <th key={d.d} className={clsx('px-1 pt-1 text-center font-black', fri && 'bg-slate-600')}>{Number(d.d.slice(8, 10))}</th> })}
            {totalsHead.map((t) => <th key={t} className="whitespace-nowrap bg-slate-700 px-2 text-center" rowSpan={2}>{t}</th>)}
          </tr>
          <tr className="bg-slate-800 text-[9px] text-slate-300">
            {days.map((d) => { const dt = new Date(`${d.d}T00:00:00Z`); return <th key={d.d} className={clsx('px-1 pb-1 text-center font-normal', dt.getUTCDay() === 5 && 'bg-slate-600')}>{WEEKDAY_SHORT[dt.getUTCDay()]}</th> })}
          </tr>
        </thead>
        <tbody>
          {groups.map(([dept, xs]) => (
            <GroupRows key={dept} dept={dept} xs={xs} days={days.length} detailed={detailed} sum={sum} presentOf={presentOf} onRowClick={onRowClick} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ dept, xs, days, detailed, sum, presentOf, onRowClick }: { dept: string; xs: AttendanceGridRow[]; days: number; detailed: boolean; sum: (xs: AttendanceGridRow[], k: keyof AttendanceGridRow) => number; presentOf: (r: AttendanceGridRow) => number; onRowClick?: (r: AttendanceGridRow) => void }) {
  const present = xs.reduce((a, r) => a + presentOf(r), 0)
  return (
    <>
      <tr className="bg-brand-50/70" data-testid={`grid-dept-${dept}`}>
        <td className="sticky right-0 z-10 bg-brand-50 p-2 font-black text-brand-900" colSpan={1}><span className="inline-flex items-center gap-1"><Icon name="folder" size={12} /> {dept}</span><span className="ms-2 rounded-full bg-white px-1.5 text-[10px] font-bold text-brand-700">{xs.length}</span></td>
        <td colSpan={days} className="p-1 text-[10px] text-brand-800">حضور {present} · غياب {sum(xs, 'absent_days')} · إجازة {sum(xs, 'leave_days')} · ساعات {fmtHM(sum(xs, 'worked_minutes'))}</td>
        {detailed
          ? [present, sum(xs, 'late_days'), sum(xs, 'early_days'), sum(xs, 'incomplete_days'), sum(xs, 'absent_days'), sum(xs, 'leave_days'), fmtHM(sum(xs, 'worked_minutes')), sum(xs, 'shortfall_minutes'), sum(xs, 'overtime_minutes'), `${sum(xs, 'proposed_days')} ي / ${sum(xs, 'proposed_minutes')} د`].map((v, i) => <td key={i} className="p-1 text-center font-bold text-brand-900">{v}</td>)
          : [present, sum(xs, 'absent_days'), sum(xs, 'leave_days'), fmtHM(sum(xs, 'worked_minutes'))].map((v, i) => <td key={i} className="p-1 text-center font-bold text-brand-900">{v}</td>)}
      </tr>
      {xs.map((r) => (
        <tr key={r.employee_id} className={clsx('border-t border-slate-100 hover:bg-slate-50', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)} data-testid={`grid-row-${r.employee_number}`}>
          <td className="sticky right-0 z-10 bg-white p-2 shadow-[inset_-1px_0_0_#e2e8f0]">
            <p className="whitespace-nowrap font-bold">{r.full_name}</p>
            <p className="text-[10px] text-slate-500">{r.employee_number}{r.job_title ? ` · ${r.job_title}` : ''}{r.unevaluated_days > 0 && detailed && <span className="ms-1 rounded bg-rose-100 px-1 text-rose-700">{r.unevaluated_days} غير محتسب</span>}</p>
          </td>
          {r.days.map((c) => detailed ? <DetailCell key={c.d} c={c} /> : <ApprovedCell key={c.d} c={c} />)}
          {detailed ? (
            <>
              <td className="p-1 text-center font-bold text-emerald-700">{presentOf(r)}</td>
              <td className={clsx('p-1 text-center', r.late_days > 0 && 'font-bold text-amber-700')}>{r.late_days}</td>
              <td className={clsx('p-1 text-center', r.early_days > 0 && 'font-bold text-orange-700')}>{r.early_days}</td>
              <td className={clsx('p-1 text-center', r.incomplete_days > 0 && 'font-bold text-violet-700')}>{r.incomplete_days}</td>
              <td className={clsx('p-1 text-center', r.absent_days > 0 && 'font-bold text-rose-700')}>{r.absent_days}</td>
              <td className="p-1 text-center text-sky-800">{r.leave_days}</td>
              <td className="p-1 text-center tabular-nums" dir="ltr">{fmtHM(r.worked_minutes)}</td>
              <td className={clsx('p-1 text-center tabular-nums', r.shortfall_minutes > 0 && 'text-rose-700')}>{r.shortfall_minutes}</td>
              <td className={clsx('p-1 text-center tabular-nums', r.overtime_minutes > 0 && 'text-emerald-700')}>{r.overtime_minutes}</td>
              <td className="whitespace-nowrap p-1 text-center text-[11px] font-bold text-rose-700" data-testid={`grid-proposed-${r.employee_number}`}>{r.proposed_days > 0 || r.proposed_minutes > 0 ? `${r.proposed_days > 0 ? `${r.proposed_days} يوم` : ''}${r.proposed_days > 0 && r.proposed_minutes > 0 ? ' + ' : ''}${r.proposed_minutes > 0 ? `${r.proposed_minutes} د` : ''}` : '—'}</td>
            </>
          ) : (
            <>
              <td className="p-1 text-center font-black text-emerald-700" data-testid={`grid-present-${r.employee_number}`}>{presentOf(r)}</td>
              <td className={clsx('p-1 text-center font-black', r.absent_days > 0 ? 'text-rose-700' : 'text-slate-400')} data-testid={`grid-absent-${r.employee_number}`}>{r.absent_days}</td>
              <td className="p-1 text-center font-black text-sky-800" data-testid={`grid-leave-${r.employee_number}`}>{r.leave_days}</td>
              <td className="p-1 text-center font-bold tabular-nums" dir="ltr" data-testid={`grid-hours-${r.employee_number}`}>{fmtHM(r.worked_minutes)}</td>
            </>
          )}
        </tr>
      ))}
    </>
  )
}

export function GridLegend({ mode }: { mode: Stage }) {
  const items: Array<[string, string]> = mode === 'detailed'
    ? [['present', 'حاضر: أول/آخر بصمة'], ['late', 'متأخر'], ['early_leave', 'خروج مبكر'], ['incomplete', 'بصمة ناقصة'], ['absent', 'غ = غائب'], ['leave', 'إجازة / زمنية'], ['rest', 'راحة'], ['pending', '؟ غير محتسب']]
    : [['present', 'حاضر'], ['absent', 'غائب'], ['leave', 'مجاز'], ['rest', 'راحة']]
  const palette = mode === 'detailed' ? CELL : KIND
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]" data-testid={`grid-legend-${mode}`}>
      {items.map(([k, l]) => <span key={k} className={clsx('rounded-md px-1.5 py-0.5 font-bold', palette[k])}>{l}</span>)}
      {mode === 'detailed' && <span className="rounded-md px-1.5 py-0.5 font-bold ring-1 ring-amber-400">إطار أصفر = تعديل غرفة العمليات</span>}
      {mode === 'detailed' && <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-rose-700"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> استقطاع مقترح</span>}
    </div>
  )
}

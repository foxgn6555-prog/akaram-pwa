/**
 * ملف الموظف الكامل (HR): البيانات (قابلة للتعديل) · المستمسكات · الشفت وتاريخه · حضور الشهر · الإجازات المعتمدة · حالة الراتب (بلا أرقام).
 */
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import {
  ATTENDANCE_STATUS_LABELS, CONTRACT_LABELS, TERMINATION_LABELS, WEEKDAYS_AR,
  useAssignShift, useAttendance, useHrEmployee, useHrLeaves, useHrShifts, useShiftAssignments, useUpdateEmployee, useHrJobTitles,
} from '@features/hr'
import type { AttendanceStatus } from '@features/hr'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import clsx from 'clsx'
import { DocumentsPanel } from '../../components/DocumentsPanel'
import { ExportButton } from '../../components/ExportButton'
import { buildEmployeeProfileWorkbook, downloadWorkbook } from '@features/hr/lib/hrExcel'
import { hr } from '@sdk/hr.sdk'
import { Field, MonthPicker, StatCard, StatusBadge } from '../../components/hr-ui'
import { field, fmtMinutes, fmtTime, hhmm, isoDay, monthStart } from '../../components/hr-format'

type Tab = 'data' | 'docs' | 'shift' | 'attendance' | 'leaves'
const GENDER: Record<string, string> = { male: 'ذكر', female: 'أنثى' }
const MARITAL: Record<string, string> = { single: 'أعزب/عزباء', married: 'متزوج/ة', divorced: 'مطلق/ة', widowed: 'أرمل/ة' }

export default function EmployeeDetail() {
  const { employeeId = '' } = useParams()
  const { data: e, isLoading } = useHrEmployee(employeeId)
  const [tab, setTab] = useState<Tab>('data')
  if (isLoading || !e) return <LoadingSpinner />

  return (
    <div className="space-y-4" data-testid="employee-detail">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar name={e.full_name} />
          <div>
            <h1 className="text-lg font-black">{e.full_name}</h1>
            <p className="text-xs text-slate-500">{e.employee_number} · {e.job_title ?? '—'} · {e.department_name ?? 'بلا قسم'} · {e.branch_name ?? 'بلا فرع'}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Chip>{CONTRACT_LABELS[e.contract_type]}</Chip>
              <Chip>{e.shift_name ? `شفت ${e.shift_name}` : 'بلا شفت'}</Chip>
              <Chip tone={e.salary_status === 'defined' ? 'emerald' : 'amber'} testId="salary-status">{e.salary_status === 'defined' ? 'الراتب مُعرَّف لدى المالية' : 'الراتب بانتظار المالية'}</Chip>
              {e.employment_status === 'terminated' && <Chip tone="red" testId="terminated-chip">منتهية خدمته — {e.termination_type ? TERMINATION_LABELS[e.termination_type] : ''} {e.terminated_at}</Chip>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton label="تصدير الملف Excel" testId="emp-profile-export" onExport={async () => {
            const [assignments, shifts, attendance] = await Promise.all([hr.listAssignments(e.id), hr.listShifts(true), hr.listAttendance({ from: monthStart(), to: isoDay(), search: e.employee_number })])
            await downloadWorkbook(await buildEmployeeProfileWorkbook(e, assignments, shifts, attendance.filter((r) => r.employee_id === e.id)), `ملف-${e.employee_number}.xlsx`)
          }} />
          <Link to="/hr/employees" className="text-xs font-semibold text-brand-700 hover:underline">← كل الموظفين</Link>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {([['data', 'البيانات'], ['docs', 'المستمسكات'], ['shift', 'الشفت'], ['attendance', 'الحضور'], ['leaves', 'الإجازات المعتمدة']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} data-testid={`etab-${k}`} className={clsx('rounded-lg px-3 py-1.5 text-xs font-bold', tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600')}>{l}</button>
        ))}
      </nav>

      {tab === 'data' && <DataTab e={e} />}
      {tab === 'docs' && <DocumentsPanel employeeId={e.id} />}
      {tab === 'shift' && <ShiftTab employeeId={e.id} />}
      {tab === 'attendance' && <AttendanceTab employeeId={e.id} search={e.employee_number} />}
      {tab === 'leaves' && <LeavesTab employeeId={e.id} />}
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return <div className="flex size-14 items-center justify-center rounded-full bg-brand-100 text-xl font-black text-brand-700">{name.trim().charAt(0)}</div>
}
function Chip({ children, tone = 'slate', testId }: { children: React.ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'red'; testId?: string }) {
  const t = { slate: 'bg-slate-100 text-slate-700', emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700' }
  return <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', t[tone])} data-testid={testId}>{children}</span>
}

// ── البيانات ──
type Full = NonNullable<ReturnType<typeof useHrEmployee>['data']>
function DataTab({ e }: { e: Full }) {
  const [editing, setEditing] = useState(false)
  const [p, setP] = useState<Record<string, string>>({})
  const { data: departments = [] } = useDepartments()
  const { data: jobTitles = [] } = useHrJobTitles()
  const { data: branches = [] } = useBranches()
  const update = useUpdateEmployee()
  const val = (k: keyof Full) => (p[k as string] ?? (e[k] as string | null) ?? '')
  const set = (k: string, v: string) => setP((s) => ({ ...s, [k]: v }))
  const save = async () => {
    const patch = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === '' ? null : v]))
    await update.mutateAsync({ id: e.id, patch }); setEditing(false); setP({})
  }
  const rows: Array<[string, keyof Full, 'text' | 'date' | 'select-dept' | 'select-branch' | 'select-title' | 'select-gender' | 'select-marital' | 'readonly']> = [
    ['الرقم الوظيفي', 'employee_number', 'readonly'], ['الاسم الرباعي', 'full_name', 'text'], ['اسم الأم', 'mother_name', 'text'], ['الجنس', 'gender', 'select-gender'],
    ['تاريخ الولادة', 'birth_date', 'date'], ['محل الولادة', 'birth_place', 'text'], ['الحالة الاجتماعية', 'marital_status', 'select-marital'], ['التحصيل الدراسي', 'education', 'text'],
    ['فصيلة الدم', 'blood_type', 'text'], ['البطاقة الموحدة', 'national_id_number', 'text'], ['بطاقة السكن', 'residence_card_number', 'text'], ['المحافظة', 'governorate', 'text'],
    ['العنوان', 'address', 'text'], ['الهاتف 1', 'phone', 'text'], ['الهاتف 2', 'phone2', 'text'], ['البريد', 'email', 'text'],
    ['قريب الطوارئ', 'emergency_contact_name', 'text'], ['هاتف الطوارئ', 'emergency_contact_phone', 'text'], ['المسمى الوظيفي', 'job_title_id', 'select-title'],
    ['القسم', 'department_id', 'select-dept'], ['الفرع', 'branch_id', 'select-branch'], ['تاريخ المباشرة', 'hire_date', 'date'], ['رقم البصمة', 'biometric_pin', 'text'],
  ]
  const display = (k: keyof Full) => {
    const v = e[k] as string | null
    if (k === 'department_id') return e.department_name ?? '—'
    if (k === 'job_title_id') return e.job_title ? <>{e.job_title}{e.is_driver && <span className="ms-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800" data-testid="driver-badge">🚛 يقود آليات</span>}</> : <span className="text-amber-700" data-testid="no-title">بلا مسمى — عيّنه من الهيكل</span>
    if (k === 'branch_id') return e.branch_name ?? '—'
    if (k === 'gender') return v ? GENDER[v] : '—'
    if (k === 'marital_status') return v ? MARITAL[v] : '—'
    return v || '—'
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="data-tab">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">البيانات الشخصية والوظيفية</h3>
        {e.employment_status !== 'terminated' && (
          editing
            ? <div className="flex gap-2"><Button size="sm" onClick={() => void save()} isLoading={update.isPending} data-testid="edit-save">حفظ</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setP({}) }}>إلغاء</Button></div>
            : <Button size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="edit-toggle">تعديل</Button>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([l, k, kind]) => (
          <div key={k as string} data-testid={`fld-${k as string}`}>
            <dt className="text-[11px] text-slate-500">{l}</dt>
            <dd className="text-sm font-semibold">
              {!editing || kind === 'readonly' ? display(k)
                : kind === 'select-title' ? <select className={field} value={val(k)} onChange={(ev) => set(k as string, ev.target.value)} data-testid="edit-title"><option value="">— بلا مسمى —</option>{jobTitles.map((t) => <option key={t.id} value={t.id}>{t.department_name} › {t.name}{t.drives_vehicles ? ' 🚛' : ''}</option>)}</select>
                : kind === 'select-dept' ? (val('job_title_id') ? <span className="text-xs text-slate-500">يُشتق من المسمى</span> : <select className={field} value={val(k)} onChange={(ev) => set(k as string, ev.target.value)}><option value="">—</option>{departments.filter((d) => !d.is_job_title).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>)
                : kind === 'select-branch' ? <select className={field} value={val(k)} onChange={(ev) => set(k as string, ev.target.value)}><option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                : kind === 'select-gender' ? <select className={field} value={val(k)} onChange={(ev) => set(k as string, ev.target.value)}><option value="">—</option><option value="male">ذكر</option><option value="female">أنثى</option></select>
                : kind === 'select-marital' ? <select className={field} value={val(k)} onChange={(ev) => set(k as string, ev.target.value)}><option value="">—</option>{Object.entries(MARITAL).map(([kk, ll]) => <option key={kk} value={kk}>{ll}</option>)}</select>
                : <input type={kind === 'date' ? 'date' : 'text'} className={field} value={val(k)} onChange={(ev) => set(k as string, ev.target.value)} data-testid={`inp-${k as string}`} />}
            </dd>
          </div>
        ))}
      </dl>
      {e.employment_status === 'terminated' && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-800" data-testid="termination-box">
          <p className="font-bold">إنهاء الخدمة: {e.termination_type ? TERMINATION_LABELS[e.termination_type] : '—'} · آخر يوم {e.terminated_at}</p>
          <p className="mt-1">{e.termination_reason}</p>
        </div>
      )}
    </section>
  )
}

// ── الشفت ──
function ShiftTab({ employeeId }: { employeeId: string }) {
  const { data: shifts = [] } = useHrShifts()
  const { data: history = [] } = useShiftAssignments(employeeId)
  const assign = useAssignShift()
  const [shiftId, setShiftId] = useState('')
  const [from, setFrom] = useState(isoDay())
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [grace, setGrace] = useState(''); const [note, setNote] = useState('')
  const [days, setDays] = useState<number[] | null>(null)
  const byId = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s])), [shifts])
  const submit = async () => {
    if (!shiftId) return
    await assign.mutateAsync({ employeeId, shiftId, from, start: start || null, end: end || null, grace: grace === '' ? null : Number(grace), days, note })
    setStart(''); setEnd(''); setGrace(''); setNote(''); setDays(null)
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="shift-tab">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold">تغيير الشفت / تجاوز الأوقات</h3>
        <p className="text-[11px] text-slate-500">يسري من التاريخ المحدد؛ الأيام السابقة تبقى محسوبة بالشفت القديم. اترك التجاوزات فارغة لاعتماد أوقات القالب.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="a-shift" label="الشفت *"><select id="a-shift" className={field} value={shiftId} onChange={(e) => setShiftId(e.target.value)} data-testid="a-shift"><option value="">— اختر —</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name} · {hhmm(s.start_time)}–{hhmm(s.end_time)}</option>)}</select></Field>
          <Field id="a-from" label="يسري من *"><input id="a-from" type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="a-from" /></Field>
          <Field id="a-start" label="تجاوز البداية"><input id="a-start" type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} data-testid="a-start" /></Field>
          <Field id="a-end" label="تجاوز النهاية"><input id="a-end" type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field id="a-grace" label="تجاوز السماحية (د)"><input id="a-grace" type="number" min={0} max={180} className={field} value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
          <Field id="a-note" label="ملاحظة"><input id="a-note" className={field} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-600">تجاوز أيام العمل (اختياري)</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS_AR.map((d, i) => { const on = days ? days.includes(i) : (shiftId ? byId[shiftId]?.work_days.includes(i) : false)
              return <button key={d} type="button" aria-pressed={on} onClick={() => setDays((cur) => { const base = cur ?? byId[shiftId]?.work_days ?? [0,1,2,3,4,5,6]; return base.includes(i) ? base.filter((x) => x !== i) : [...base, i].sort() })}
                className={clsx('rounded-full px-3 py-1 text-xs font-bold', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>{d}</button> })}
          </div>
        </div>
        <Button size="sm" onClick={() => void submit()} disabled={!shiftId} isLoading={assign.isPending} data-testid="a-save">حفظ الإسناد</Button>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold">تاريخ الشفتات</h3>
        <ul className="mt-2 divide-y text-sm" data-testid="shift-history">
          {history.map((h, i) => (
            <li key={h.id} className="flex items-center justify-between py-2" data-testid={`shift-hist-${h.effective_from}`}>
              <div>
                <p className="font-semibold">{byId[h.shift_id]?.name ?? '—'} {i === 0 && <span className="ms-1 rounded-full bg-emerald-50 px-2 text-[10px] text-emerald-700">الحالي</span>}</p>
                <p className="text-[11px] text-slate-500">من {h.effective_from}{h.start_override || h.end_override ? ` · أوقات خاصة ${hhmm(h.start_override) || hhmm(byId[h.shift_id]?.start_time)}–${hhmm(h.end_override) || hhmm(byId[h.shift_id]?.end_time)}` : ''}{h.grace_override != null ? ` · سماحية ${h.grace_override}د` : ''}{h.note ? ` · ${h.note}` : ''}</p>
              </div>
            </li>
          ))}
          {history.length === 0 && <li className="py-4 text-center text-xs text-slate-400">لم يُسند شفت بعد</li>}
        </ul>
      </section>
    </div>
  )
}

// ── الحضور ──
function AttendanceTab({ employeeId, search }: { employeeId: string; search: string }) {
  const [month, setMonth] = useState(monthStart())
  const to = useMemo(() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoDay(d) }, [month])
  const { data: rows = [] } = useAttendance({ from: month, to, search })
  const mine = rows.filter((r) => r.employee_id === employeeId)
  const count = (s: AttendanceStatus) => mine.filter((r) => r.status === s).length
  return (
    <div className="space-y-3" data-testid="attendance-tab">
      <div className="flex items-center gap-2"><MonthPicker value={month} onChange={setMonth} /><span className="text-xs text-slate-500">{mine.length} يوماً مسجلاً</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {(['present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit'] as AttendanceStatus[]).map((s) => <StatCard key={s} title={ATTENDANCE_STATUS_LABELS[s]} value={count(s)} testId={`att-count-${s}`} />)}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-2 text-start">اليوم</th><th className="p-2">الشفت</th><th className="p-2">دخول</th><th className="p-2">خروج</th><th className="p-2">تأخير</th><th className="p-2">مبكر</th><th className="p-2">الحالة</th></tr></thead>
          <tbody>{mine.map((r) => (
            <tr key={r.id} className="border-t border-slate-100" data-testid={`att-row-${r.work_date}`}>
              <td className="p-2 text-xs">{r.work_date} · {WEEKDAYS_AR[new Date(r.work_date).getDay()]}</td><td className="p-2 text-center text-xs">{r.shift_name ?? '—'}</td>
              <td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_in)}</td><td className="p-2 text-center tabular-nums" dir="ltr">{fmtTime(r.check_out)}</td>
              <td className="p-2 text-center text-xs text-amber-700">{fmtMinutes(r.late_minutes)}</td><td className="p-2 text-center text-xs text-orange-700">{fmtMinutes(r.early_minutes)}</td>
              <td className="p-2 text-center"><StatusBadge status={r.status} source={r.source} /></td>
            </tr>))}
            {mine.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-xs text-slate-400">لا سجلات لهذا الشهر</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── الإجازات ──
function LeavesTab({ employeeId }: { employeeId: string }) {
  const { data: leaves = [] } = useHrLeaves({ from: '2000-01-01', to: '2100-01-01', approvedOnly: true, employeeId })
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="leaves-tab">
      <h3 className="text-sm font-bold">الإجازات والزمنيات المعتمدة</h3>
      <ul className="mt-2 divide-y text-sm">
        {leaves.map((l) => (
          <li key={l.id} className="flex items-center justify-between py-2">
            <span>{l.kind === 'leave' ? `إجازة ${l.leave_type}` : 'زمنية'} · {l.start_date}{l.end_date !== l.start_date ? ` → ${l.end_date}` : ''}{l.start_time ? ` · ${hhmm(l.start_time)}–${hhmm(l.end_time)}` : ''}</span>
            <span className="text-[11px] text-slate-500">{l.notes}</span>
          </li>
        ))}
        {leaves.length === 0 && <li className="py-4 text-center text-xs text-slate-400">لا إجازات معتمدة</li>}
      </ul>
    </section>
  )
}

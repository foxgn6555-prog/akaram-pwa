/**
 * بوابة الموارد البشرية — وحدة «التوظيف وإنهاء الخدمات»
 *   ① توظيف: نموذج الموظف الكامل (الحزمة العراقية) + القسم/الفرع/المدير + نوع التعاقد + الشفت (مع تجاوز الأوقات) + رقم البصمة.
 *      الراتب لا يُدخل هنا — يُنشأ ملف «بانتظار المالية» تلقائياً.
 *   ② بعد الحفظ: رفع المستمسكات (صورة شخصية، موحدة وجه/ظهر، سكن وجه/ظهر، أخرى).
 *   ③ إنهاء الخدمات: اختيار موظف نشط → نوع الإنهاء + آخر يوم + سبب + مرفق اختياري → إشعار تسوية للمالية.
 *   ④ إدارة قوالب الشفتات (اسم/بداية/نهاية/سماحية/أيام العمل).
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import {
  CONTRACT_LABELS, GOVERNORATES_IQ, TERMINATION_LABELS, WEEKDAYS_AR,
  useCreateEmployee, useHrEmployees, useHrShifts, useSaveShift, useTerminateEmployee, useUploadDocument,
} from '@features/hr'
import type { CreateEmployeeInput, HrShift, TerminationType } from '@features/hr'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import clsx from 'clsx'
import { Field } from '../../components/hr-ui'
import { field, hhmm, isoDay } from '../../components/hr-format'
import { DocumentsPanel } from '../../components/DocumentsPanel'
import { ImportEmployeesPanel } from '../../components/ImportEmployeesPanel'

type Tab = 'hire' | 'import' | 'terminate' | 'shifts'

const EMPTY: CreateEmployeeInput = {
  employee_number: '', full_name: '', contract_type: 'monthly', hire_date: isoDay(), department_id: '', branch_id: '', manager_id: '',
  job_title: '', phone: '', phone2: '', email: '', mother_name: '', gender: '', birth_date: '', birth_place: '', marital_status: '', education: '',
  national_id_number: '', residence_card_number: '', governorate: 'بغداد', address: '', emergency_contact_name: '', emergency_contact_phone: '',
  blood_type: '', biometric_pin: '', shift_id: '', shift_start_override: '', shift_end_override: '', shift_grace_override: null,
}

export default function Recruitment() {
  const [tab, setTab] = useState<Tab>('hire')
  return (
    <div className="space-y-4" data-testid="hr-recruitment">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">التوظيف وإنهاء الخدمات</h1>
          <p className="text-xs text-slate-500">بيانات الموظف الكاملة · المستمسكات · الشفت · إنهاء الخدمة — الراتب يُعرَّف في بوابة المالية حصراً</p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="أقسام الوحدة">
          {([['hire', 'توظيف موظف'], ['import', 'استيراد من Excel'], ['terminate', 'إنهاء خدمات'], ['shifts', 'قوالب الشفتات']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} data-testid={`tab-${k}`}
              className={clsx('rounded-lg px-3 py-1.5 text-xs font-bold', tab === k ? 'bg-white shadow text-brand-700' : 'text-slate-600')}>{l}</button>
          ))}
        </nav>
      </header>
      {tab === 'hire' && <HireForm />}
      {tab === 'import' && <ImportEmployeesPanel />}
      {tab === 'terminate' && <TerminatePanel />}
      {tab === 'shifts' && <ShiftsPanel />}
    </div>
  )
}

// ───────────────────────── توظيف ─────────────────────────
function HireForm() {
  const [v, setV] = useState<CreateEmployeeInput>(EMPTY)
  const [err, setErr] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const { data: departments = [] } = useDepartments()
  const { data: branches = [] } = useBranches()
  const { data: shifts = [] } = useHrShifts()
  const { data: managers = [] } = useHrEmployees({ status: 'active' })
  const create = useCreateEmployee()
  const set = <K extends keyof CreateEmployeeInput>(k: K, val: CreateEmployeeInput[K]) => setV((s) => ({ ...s, [k]: val }))
  const shift = shifts.find((s) => s.id === v.shift_id)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    if (!v.full_name.trim()) return setErr('الاسم الرباعي مطلوب')
    if (!v.employee_number.trim()) return setErr('الرقم الوظيفي مطلوب')
    if (!v.department_id) return setErr('اختر القسم')
    if (!v.branch_id) return setErr('اختر الفرع')
    if (!v.shift_id) return setErr('اختر الشفت')
    if (v.phone && !/^0?7\d{9}$/.test(v.phone.replace(/\s/g, ''))) return setErr('رقم الهاتف غير صالح (07XXXXXXXXX)')
    if (v.national_id_number && !/^\d{12}$/.test(v.national_id_number)) return setErr('رقم البطاقة الموحدة 12 رقماً')
    try {
      const id = await create.mutateAsync({ ...v, shift_grace_override: v.shift_grace_override ?? undefined })
      setCreatedId(id)
    } catch { /* toast */ }
  }

  if (createdId) {
    return (
      <div className="space-y-4" data-testid="hire-success">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-800">✓ سُجّل الموظف «{v.full_name}» برقم {v.employee_number}</p>
          <p className="mt-1 text-xs text-emerald-700">أُنشئ ملف راتب «بانتظار المالية» وأُرسل إشعار لبوابة المالية لإدخال بيانات الراتب. ارفع المستمسكات الآن أو لاحقاً من ملف الموظف.</p>
          <div className="mt-3 flex gap-2">
            <Link to={`/hr/employees/${createdId}`} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white" data-testid="go-profile">فتح ملف الموظف</Link>
            <Button size="sm" variant="secondary" onClick={() => { setCreatedId(null); setV(EMPTY) }} data-testid="hire-another">توظيف موظف آخر</Button>
          </div>
        </div>
        <DocumentsPanel employeeId={createdId} />
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" data-testid="hire-form" noValidate>
      <Section title="البيانات الوظيفية">
        <Field id="h-number" label="الرقم الوظيفي *"><input id="h-number" className={field} value={v.employee_number} onChange={(e) => set('employee_number', e.target.value)} data-testid="f-number" /></Field>
        <Field id="h-name" label="الاسم الرباعي واللقب *"><input id="h-name" className={field} value={v.full_name} onChange={(e) => set('full_name', e.target.value)} data-testid="f-name" /></Field>
        <Field id="h-title" label="المسمى الوظيفي"><input id="h-title" className={field} value={v.job_title} onChange={(e) => set('job_title', e.target.value)} data-testid="f-title" /></Field>
        <Field id="h-dept" label="القسم *">
          <select id="h-dept" className={field} value={v.department_id ?? ''} onChange={(e) => set('department_id', e.target.value)} data-testid="f-dept">
            <option value="">— اختر —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.parent_id ? '↳ ' : ''}{d.name}</option>)}
          </select>
        </Field>
        <Field id="h-branch" label="الفرع *">
          <select id="h-branch" className={field} value={v.branch_id ?? ''} onChange={(e) => set('branch_id', e.target.value)} data-testid="f-branch">
            <option value="">— اختر —</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field id="h-manager" label="المدير المباشر">
          <select id="h-manager" className={field} value={v.manager_id ?? ''} onChange={(e) => set('manager_id', e.target.value)} data-testid="f-manager">
            <option value="">— بلا —</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {m.job_title ?? m.employee_number}</option>)}
          </select>
        </Field>
        <Field id="h-contract" label="نوع التعاقد *" hint="يحدد طريقة احتساب المالية: شهري أو أجر يومي × أيام الحضور المدققة">
          <select id="h-contract" className={field} value={v.contract_type} onChange={(e) => set('contract_type', e.target.value as 'monthly' | 'daily')} data-testid="f-contract">
            {Object.entries(CONTRACT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field id="h-hire" label="تاريخ المباشرة *"><input id="h-hire" type="date" className={field} value={v.hire_date} onChange={(e) => set('hire_date', e.target.value)} data-testid="f-hire" /></Field>
        <Field id="h-pin" label="رقم البصمة (PIN على الجهاز)" hint="يجب أن يطابق رقم المستخدم المسجل في جهاز البصمة"><input id="h-pin" className={field} dir="ltr" value={v.biometric_pin} onChange={(e) => set('biometric_pin', e.target.value)} data-testid="f-pin" /></Field>
      </Section>

      <Section title="الشفت وأوقات العمل">
        <Field id="h-shift" label="الشفت *">
          <select id="h-shift" className={field} value={v.shift_id ?? ''} onChange={(e) => set('shift_id', e.target.value)} data-testid="f-shift">
            <option value="">— اختر —</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} · {hhmm(s.start_time)}–{hhmm(s.end_time)} · سماحية {s.grace_minutes}د</option>)}
          </select>
        </Field>
        <Field id="h-ss" label="تجاوز وقت البداية (اختياري)" hint={shift ? `افتراضي القالب ${hhmm(shift.start_time)}` : undefined}><input id="h-ss" type="time" className={field} value={v.shift_start_override} onChange={(e) => set('shift_start_override', e.target.value)} data-testid="f-shift-start" /></Field>
        <Field id="h-se" label="تجاوز وقت النهاية (اختياري)" hint={shift ? `افتراضي القالب ${hhmm(shift.end_time)}` : undefined}><input id="h-se" type="time" className={field} value={v.shift_end_override} onChange={(e) => set('shift_end_override', e.target.value)} data-testid="f-shift-end" /></Field>
        <Field id="h-sg" label="تجاوز السماحية بالدقائق (اختياري)"><input id="h-sg" type="number" min={0} max={180} className={field} value={v.shift_grace_override ?? ''} onChange={(e) => set('shift_grace_override', e.target.value === '' ? null : Number(e.target.value))} data-testid="f-shift-grace" /></Field>
      </Section>

      <Section title="البيانات الشخصية">
        <Field id="h-mother" label="اسم الأم الثلاثي"><input id="h-mother" className={field} value={v.mother_name} onChange={(e) => set('mother_name', e.target.value)} /></Field>
        <Field id="h-gender" label="الجنس">
          <select id="h-gender" className={field} value={v.gender} onChange={(e) => set('gender', e.target.value as 'male' | 'female' | '')}><option value="">—</option><option value="male">ذكر</option><option value="female">أنثى</option></select>
        </Field>
        <Field id="h-bd" label="تاريخ الولادة"><input id="h-bd" type="date" className={field} value={v.birth_date} onChange={(e) => set('birth_date', e.target.value)} /></Field>
        <Field id="h-bp" label="محل الولادة"><input id="h-bp" className={field} value={v.birth_place} onChange={(e) => set('birth_place', e.target.value)} /></Field>
        <Field id="h-ms" label="الحالة الاجتماعية">
          <select id="h-ms" className={field} value={v.marital_status} onChange={(e) => set('marital_status', e.target.value)}>
            <option value="">—</option><option value="single">أعزب/عزباء</option><option value="married">متزوج/ة</option><option value="divorced">مطلق/ة</option><option value="widowed">أرمل/ة</option>
          </select>
        </Field>
        <Field id="h-edu" label="التحصيل الدراسي"><input id="h-edu" className={field} value={v.education} onChange={(e) => set('education', e.target.value)} placeholder="بكالوريوس / دبلوم / إعدادية…" /></Field>
        <Field id="h-blood" label="فصيلة الدم">
          <select id="h-blood" className={field} value={v.blood_type} onChange={(e) => set('blood_type', e.target.value)}><option value="">—</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map((b) => <option key={b}>{b}</option>)}</select>
        </Field>
      </Section>

      <Section title="المستمسكات الرسمية والعنوان">
        <Field id="h-nid" label="رقم البطاقة الموحدة" hint="12 رقماً"><input id="h-nid" className={field} dir="ltr" inputMode="numeric" value={v.national_id_number} onChange={(e) => set('national_id_number', e.target.value.replace(/\D/g, ''))} data-testid="f-nid" /></Field>
        <Field id="h-res" label="رقم بطاقة السكن"><input id="h-res" className={field} dir="ltr" value={v.residence_card_number} onChange={(e) => set('residence_card_number', e.target.value)} /></Field>
        <Field id="h-gov" label="المحافظة">
          <select id="h-gov" className={field} value={v.governorate} onChange={(e) => set('governorate', e.target.value)}>{GOVERNORATES_IQ.map((g) => <option key={g}>{g}</option>)}</select>
        </Field>
        <Field id="h-addr" label="العنوان التفصيلي"><input id="h-addr" className={field} value={v.address} onChange={(e) => set('address', e.target.value)} placeholder="المنطقة، المحلة، الزقاق، الدار" /></Field>
      </Section>

      <Section title="الاتصال والطوارئ">
        <Field id="h-phone" label="الهاتف 1"><input id="h-phone" className={field} dir="ltr" inputMode="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} data-testid="f-phone" /></Field>
        <Field id="h-phone2" label="الهاتف 2"><input id="h-phone2" className={field} dir="ltr" inputMode="tel" value={v.phone2} onChange={(e) => set('phone2', e.target.value)} /></Field>
        <Field id="h-email" label="البريد الإلكتروني"><input id="h-email" type="email" className={field} dir="ltr" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field id="h-ecn" label="اسم قريب للطوارئ"><input id="h-ecn" className={field} value={v.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} /></Field>
        <Field id="h-ecp" label="هاتف قريب الطوارئ"><input id="h-ecp" className={field} dir="ltr" inputMode="tel" value={v.emergency_contact_phone} onChange={(e) => set('emergency_contact_phone', e.target.value)} /></Field>
      </Section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        بيانات الراتب لا تُدخل هنا: بعد الحفظ يظهر الموظف في بوابة المالية بحالة «راتب بانتظار التعريف» وتُدخلها المالية حصراً.
      </div>
      {err && <p role="alert" className="text-sm font-semibold text-red-600" data-testid="hire-error">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setV(EMPTY)}>مسح</Button>
        <Button type="submit" isLoading={create.isPending} data-testid="hire-submit"><Icon name="user-plus" size={16} /> حفظ وتوظيف</Button>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <legend className="px-2 text-sm font-bold text-brand-700">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  )
}

// ───────────────────────── إنهاء الخدمات ─────────────────────────
function TerminatePanel() {
  const [search, setSearch] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [type, setType] = useState<TerminationType>('resignation')
  const [lastDay, setLastDay] = useState(isoDay())
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const { data: employees = [] } = useHrEmployees({ status: 'active', search })
  const terminate = useTerminateEmployee()
  const upload = useUploadDocument()
  const emp = employees.find((e) => e.id === employeeId)

  const submit = async () => {
    setErr(null)
    if (!employeeId) return setErr('اختر الموظف')
    if (!reason.trim()) return setErr('سبب الإنهاء مطلوب')
    if (!lastDay) return setErr('تاريخ آخر يوم عمل مطلوب')
    try {
      let attachmentPath: string | null = null
      if (file) { const doc = await upload.mutateAsync({ employeeId, docType: 'other', file, title: `مرفق إنهاء الخدمة — ${TERMINATION_LABELS[type]}` }); attachmentPath = doc.storage_path }
      await terminate.mutateAsync({ id: employeeId, type, lastDay, reason: reason.trim(), attachmentPath })
      setDone(true)
    } catch { /* toast */ }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="terminate-success">
        <p className="font-bold">✓ أُنهيت خدمة «{emp?.full_name}» ({TERMINATION_LABELS[type]}) — آخر يوم عمل {lastDay}</p>
        <p className="mt-1 text-xs text-slate-500">أُرسل إشعار تسوية نهائية إلى بوابة المالية، ولن يُحتسب حضور بعد آخر يوم.</p>
        <Button size="sm" className="mt-3" variant="secondary" onClick={() => { setDone(false); setEmployeeId(''); setReason(''); setFile(null) }}>إنهاء آخر</Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]" data-testid="terminate-panel">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="t-search" className="mb-1 block text-xs font-semibold text-slate-600">ابحث عن الموظف (اسم/رقم/هاتف)</label>
        <input id="t-search" className={field} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="t-search" />
        <ul className="mt-2 max-h-80 divide-y overflow-auto rounded-xl border border-slate-100" data-testid="t-results">
          {employees.slice(0, 50).map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setEmployeeId(e.id)} data-testid={`t-pick-${e.employee_number}`}
                className={clsx('flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-slate-50', employeeId === e.id && 'bg-brand-50')}>
                <span><span className="font-semibold">{e.full_name}</span><span className="ms-2 text-xs text-slate-500">{e.employee_number} · {e.department_name ?? '—'}</span></span>
                <span className="text-[10px] text-slate-400">{e.branch_name}</span>
              </button>
            </li>
          ))}
          {employees.length === 0 && <li className="p-4 text-center text-xs text-slate-400">لا نتائج</li>}
        </ul>
      </div>
      <div className="space-y-3 rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-red-700">إنهاء خدمة {emp ? `«${emp.full_name}»` : '— اختر موظفاً'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="t-type" label="نوع الإنهاء *">
            <select id="t-type" className={field} value={type} onChange={(e) => setType(e.target.value as TerminationType)} data-testid="t-type">
              {Object.entries(TERMINATION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field id="t-day" label="آخر يوم عمل *"><input id="t-day" type="date" className={field} value={lastDay} onChange={(e) => setLastDay(e.target.value)} data-testid="t-day" /></Field>
        </div>
        <Field id="t-reason" label="السبب *"><textarea id="t-reason" className="w-full rounded-xl border border-slate-300 p-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="t-reason" /></Field>
        <Field id="t-file" label="مرفق (كتاب الاستقالة/الأمر الإداري) — اختياري"><input id="t-file" type="file" accept="image/*,application/pdf" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        {err && <p role="alert" className="text-xs font-semibold text-red-600" data-testid="t-error">{err}</p>}
        <Button variant="danger" disabled={!employeeId} isLoading={terminate.isPending || upload.isPending} onClick={() => void submit()} data-testid="t-submit">تأكيد إنهاء الخدمة</Button>
      </div>
    </div>
  )
}

// ───────────────────────── قوالب الشفتات ─────────────────────────
function ShiftsPanel() {
  const { data: shifts = [] } = useHrShifts(true)
  const save = useSaveShift()
  const [editing, setEditing] = useState<Partial<HrShift> | null>(null)
  const e = editing
  const set = (p: Partial<HrShift>) => setEditing((s) => ({ ...(s ?? {}), ...p }))
  const overnight = useMemo(() => !!e?.start_time && !!e?.end_time && e.end_time <= e.start_time, [e?.start_time, e?.end_time])

  const submit = async () => {
    if (!e?.name?.trim() || !e.start_time || !e.end_time) return
    await save.mutateAsync({ id: e.id, name: e.name.trim(), start_time: e.start_time, end_time: e.end_time, grace_minutes: e.grace_minutes ?? 10,
      work_days: e.work_days?.length ? e.work_days : [0, 1, 2, 3, 4, 5, 6], is_active: e.is_active ?? true })
    setEditing(null)
  }

  return (
    <div className="space-y-3" data-testid="shifts-panel">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">القوالب تُسند للموظفين؛ ويمكن تجاوز الأوقات/السماحية لكل موظف على حدة. بلا عطل افتراضية — كل الأيام عمل ما لم تُزل هنا.</p>
        <Button size="sm" onClick={() => setEditing({ name: '', start_time: '08:00', end_time: '16:00', grace_minutes: 10, work_days: [0, 1, 2, 3, 4, 5, 6], is_active: true })} data-testid="shift-new">+ شفت جديد</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shifts.map((s) => (
          <div key={s.id} className={clsx('rounded-2xl border bg-white p-4 shadow-sm', s.is_active ? 'border-slate-200' : 'border-dashed opacity-70')} data-testid={`shift-card-${s.name}`}>
            <div className="flex items-start justify-between">
              <p className="font-bold">{s.name}</p>
              <button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => setEditing({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time) })} data-testid={`shift-edit-${s.name}`}>تعديل</button>
            </div>
            <p className="mt-1 text-sm tabular-nums" dir="ltr">{hhmm(s.start_time)} → {hhmm(s.end_time)}{s.end_time <= s.start_time && <span className="ms-1 text-[10px] text-violet-700">(+1 يوم)</span>}</p>
            <p className="text-xs text-slate-500">سماحية {s.grace_minutes} دقيقة · {s.work_days.length === 7 ? 'كل الأيام' : s.work_days.map((d) => WEEKDAYS_AR[d]).join('، ')}</p>
          </div>
        ))}
      </div>
      {e && (
        <div className="space-y-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm" data-testid="shift-form">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field id="s-name" label="الاسم"><input id="s-name" className={field} value={e.name ?? ''} onChange={(ev) => set({ name: ev.target.value })} data-testid="s-name" /></Field>
            <Field id="s-start" label="البداية"><input id="s-start" type="time" className={field} value={e.start_time ?? ''} onChange={(ev) => set({ start_time: ev.target.value })} data-testid="s-start" /></Field>
            <Field id="s-end" label="النهاية" hint={overnight ? 'يعبر منتصف الليل — الخروج في اليوم التالي' : undefined}><input id="s-end" type="time" className={field} value={e.end_time ?? ''} onChange={(ev) => set({ end_time: ev.target.value })} data-testid="s-end" /></Field>
            <Field id="s-grace" label="السماحية (دقائق)"><input id="s-grace" type="number" min={0} max={180} className={field} value={e.grace_minutes ?? 10} onChange={(ev) => set({ grace_minutes: Number(ev.target.value) })} data-testid="s-grace" /></Field>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">أيام العمل</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS_AR.map((d, i) => {
                const on = (e.work_days ?? []).includes(i)
                return (
                  <button key={d} type="button" data-testid={`s-day-${i}`} aria-pressed={on}
                    onClick={() => set({ work_days: on ? (e.work_days ?? []).filter((x) => x !== i) : [...(e.work_days ?? []), i].sort() })}
                    className={clsx('rounded-full px-3 py-1 text-xs font-bold', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>{d}</button>
                )
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={e.is_active ?? true} onChange={(ev) => set({ is_active: ev.target.checked })} /> فعّال</label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void submit()} isLoading={save.isPending} data-testid="s-save">حفظ</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>إلغاء</Button>
          </div>
        </div>
      )}
    </div>
  )
}


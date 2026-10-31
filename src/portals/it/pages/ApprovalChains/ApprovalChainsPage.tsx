/**
 * سلاسل الموافقات v2 (00160 → 00333 → 00335) — التطوير المركزية.
 * لكل (دور طالب × نوع طلب [× نوع فرعي للإجازات]) سلسلة خطوات مرتبة. كل خطوة:
 *  - «حسب التسلسل» (النظام يحدد الشخص من الإسنادات) أو «حساب محدد».
 *  - خصائص اختيارية: نمط «الجميع»، شرط (المبلغ/الأيام/الدقائق ≥ أو ≤ قيمة)، مهلة بالأيام مع تذكير، تصعيد تلقائي.
 * أدوات: نسخ سلسلة لدور/نوع آخر، سجل الإصدارات، المحاكاة («لو طلب فلان كذا — من يوافق؟»).
 * 00391: نطاق «قسم» من الشجرة التنظيمية (مع/بدون الأقسام الفرعية) يُطبَّق على كل موظفي القسم أياً كان دورهم وحتى بلا حساب،
 *        ويتقدّم على سلاسل الأدوار (قسم الموظف ← الأب ← … ← الدور). + تشخيص «لماذا لا توجد سلسلة لهذا الموظف؟».
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Copy, History, Plus, Settings2, Trash2, Wand2 } from 'lucide-react'
import { useApprovalChainVersions, useApprovalChains, useApprovalEmployeeLookup, useApprovalSimulate, useDeleteApprovalChain, useSaveApprovalChain } from '@features/sector-manager/hooks'
import { useUsers } from '@features/user-management'
import { useLeaveTypes } from '@features/hr'
import { useDepartments } from '@features/departments'
import { ChainPreview } from '@components/approvals/ChainPreview'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import type { ApprovalChain, ApprovalRequestType, ApprovalStep, ApprovalStepOptions } from '@sdk/sector-manager.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { DelegationPanel } from '@components/approvals/DelegationPanel'

/** أدوار حقيقية فقط (مرآة app.approval_requester_roles) */
const REQUESTER_ROLES: { role: string; group: string }[] = [
  { role: 'employee', group: 'الميدان' }, { role: 'department_manager', group: 'الميدان' }, { role: 'admin_ops', group: 'الميدان' }, { role: 'field_ops', group: 'الميدان' },
  { role: 'maintenance', group: 'الوحدات' }, { role: 'central_garage_officer', group: 'الوحدات' }, { role: 'transfer_station', group: 'الوحدات' }, { role: 'ops_room', group: 'الوحدات' },
  { role: 'media_officer', group: 'الوحدات' }, { role: 'complaints_officer', group: 'الوحدات' }, { role: 'follow_up', group: 'الوحدات' },
  { role: 'hr_officer', group: 'الإدارة' }, { role: 'finance_officer', group: 'الإدارة' }, { role: 'it_admin', group: 'الإدارة' }, { role: 'deputy_director', group: 'الإدارة' }, { role: 'executive_director', group: 'الإدارة' },
]
const ROLE_GROUPS = ['الميدان', 'الوحدات', 'الإدارة']
const HIERARCHY_ROLES: { role: string; label: string; hint: string }[] = [
  { role: 'department_manager', label: 'مسؤول قسمه', hint: 'مسؤول القسم المسؤول عن الطالب (للمتعهد: من إسناده؛ للموظف: المدير المباشر في HR)' },
  { role: 'admin_ops', label: 'مسؤول قاطعه', hint: 'مسؤول القاطع الذي يتبع له الطالب (الكرادة/الزعفرانية)' },
  { role: 'field_ops', label: 'العمليات الميدانية', hint: 'حسابات العمليات الميدانية' },
  { role: 'it_admin', label: 'التطوير المركزية', hint: 'أي حساب تطوير مركزية آخر غير الطالب' },
  { role: 'hr_officer', label: 'الموارد البشرية', hint: 'أي موظف موارد بشرية' },
  { role: 'deputy_director', label: 'معاون المدير المفوض', hint: 'أي حساب بهذا الدور' },
  { role: 'executive_director', label: 'المدير التنفيذي', hint: 'أي حساب بهذا الدور' },
  { role: 'super_admin', label: 'المدير المفوض', hint: 'أي حساب بهذا الدور' },
]
const TYPES: { key: ApprovalRequestType; label: string; fields: Array<'amount' | 'days' | 'minutes'> }[] = [
  { key: 'leave', label: 'إجازة', fields: ['days'] }, { key: 'time_permit', label: 'زمنية (إذن وقتي)', fields: ['minutes'] },
  { key: 'supplies', label: 'مستلزمات القواطع (من مخزن غرفة العمليات)', fields: [] }, { key: 'termination', label: 'إنهاء خدمة (وحدة الإجراءات)', fields: [] },
  { key: 'disclosure', label: 'كشف (وحدة الكشوفات — غرفة العمليات)', fields: ['amount'] }, { key: 'advance', label: 'سلفة (تُدخلها غرفة العمليات لموظف — الافتراضي: المعاون ثم المدير المفوض)', fields: ['amount'] },
  { key: 'complaint_report', label: 'اعتماد تقرير شكاوى (طالبه موظف الشكاوى — بلا سلسلة: يعتمده بنفسه بعد المراجعة)', fields: [] },
  { key: 'cold_archive_purge', label: 'حذف أرشيف بارد (طالبه حساب التطوير المركزية — بلا سلسلة: موافقة حساب IT آخر إن فُعّلت)', fields: [] },
  { key: 'hire', label: 'طلب تعيين موظف (من إجراءات الكراج/المحطة/الصيانة — بلا سلسلة: المدير المفوض؛ الرقم الوظيفي تكتبه الموارد البشرية بعد الاعتماد)', fields: [] },
  { key: 'attendance_edit', label: 'تعديل حضور جماعي (طالبه غرفة العمليات — بلا سلسلة: يصل الموارد البشرية مباشرة؛ بعد الموافقات تراجعه HR وتعتمده)', fields: [] },   // 00397
  { key: 'platform_reset', label: 'تصفير المنصة (طالبه حساب التطوير المركزية من وحدة «التصفير» — بلا سلسلة: تنفيذ فوري؛ المعتمِد يعتمد من صفحة التفاصيل بكلمة سر)', fields: [] },   // 00398
]
const FIELD_LABEL: Record<'amount' | 'days' | 'minutes', string> = { amount: 'المبلغ (د.ع)', days: 'الأيام', minutes: 'الدقائق' }
const roleLabel = (r: string) => (r === 'employee' ? 'متعهد (موظف ميداني)' : (ROLE_LABELS as Record<string, string>)[r] ?? r)
const sameStep = (a: ApprovalStep | undefined, b: ApprovalStep) => !!a && a.kind === b.kind && (b.kind === 'hierarchy' ? (a as { role?: string }).role === b.role : (a as { user_id?: string }).user_id === b.user_id)
const scopeKey = (role: string, type: string, subtype: string | null | undefined, department?: string | null) => `${department ? `dept:${department}` : role}|${type}|${subtype ?? ''}`
const DEPT_TYPES: ApprovalRequestType[] = ['leave', 'time_permit', 'advance']
const fmtDate = (v: string) => new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(v))

export default function ApprovalChainsPage() {
  const chains = useApprovalChains(), save = useSaveApprovalChain(), del = useDeleteApprovalChain()
  const users = useUsers()
  const leaveTypes = useLeaveTypes()
  const departments = useDepartments()
  const simulate = useApprovalSimulate()
  const [role, setRole] = useState<string>('employee'), [type, setType] = useState<ApprovalRequestType>('leave'), [subtype, setSubtype] = useState<string>('')
  // 00391: نطاق السلسلة — دور أو قسم (مع/بدون الفرعية)
  const [scope, setScope] = useState<'role' | 'department'>('role'), [department, setDepartment] = useState<string>(''), [includeChildren, setIncludeChildren] = useState(true)
  const [diag, setDiag] = useState<{ query: string; employeeId: string }>({ query: '', employeeId: '' })
  const diagEmployees = useApprovalEmployeeLookup(diag.query)
  const [steps, setSteps] = useState<ApprovalStep[]>([]), [active, setActive] = useState(true), [editing, setEditing] = useState<string | null>(null)
  const [accountId, setAccountId] = useState(''), [accountQuery, setAccountQuery] = useState(''), [dup, setDup] = useState(false)
  const [openStep, setOpenStep] = useState<number | null>(null)
  const [copyTarget, setCopyTarget] = useState<{ role: string; type: ApprovalRequestType; subtype: string } | null>(null)
  const [versionsOf, setVersionsOf] = useState<ApprovalChain | null>(null)
  const versions = useApprovalChainVersions(versionsOf?.id ?? null)
  const [sim, setSim] = useState<{ userId: string; query: string; amount: string; days: string; minutes: string }>({ userId: '', query: '', amount: '', days: '', minutes: '' })

  const typeMeta = TYPES.find((t) => t.key === type) as (typeof TYPES)[number]
  const subtypeOptions = useMemo(() => (leaveTypes.data ?? []).filter((t) => t.kind === type), [leaveTypes.data, type])
  const subtypeAllowed = type === 'leave' || type === 'time_permit'
  const effSubtype = subtypeAllowed && subtype ? subtype : null
  const effDepartment = scope === 'department' && department ? department : null
  const existing = useMemo(() => (chains.data ?? []).find((c) => c.request_type === type && (c.subtype ?? null) === effSubtype && (effDepartment ? c.department_id === effDepartment : (!c.department_id && c.requester_role === role))), [chains.data, role, type, effSubtype, effDepartment])
  const withChain = useMemo(() => new Set((chains.data ?? []).filter((c) => c.is_active).map((c) => scopeKey(c.requester_role, c.request_type, c.subtype, c.department_id))), [chains.data])
  const deptTree = useMemo(() => {
    const list = departments.data ?? []
    const byParent = new Map<string | null, typeof list>()
    for (const d of list) { const k = d.parent_id ?? null; byParent.set(k, [...(byParent.get(k) ?? []), d]) }
    const out: { id: string; name: string; depth: number }[] = []
    const walk = (parent: string | null, depth: number) => { for (const d of byParent.get(parent) ?? []) { out.push({ id: d.id, name: d.name, depth }); if (depth < 10) walk(d.id, depth + 1) } }
    walk(null, 0)
    return out
  }, [departments.data])
  const deptTypeOk = DEPT_TYPES.includes(type)
  const accountOptions = useMemo(() => (users.data ?? []).filter((u) => (u.employee_name ?? u.email ?? '').includes(accountQuery)).slice(0, 30), [users.data, accountQuery])
  const simOptions = useMemo(() => (users.data ?? []).filter((u) => (u.employee_name ?? u.email ?? '').includes(sim.query)).slice(0, 30), [users.data, sim.query])
  const userName = (id: string) => { const u = (users.data ?? []).find((x) => x.id === id); return u?.employee_name ?? u?.email ?? id.slice(0, 8) }

  const reset = () => { setSteps([]); setActive(true); setEditing(null); setOpenStep(null); setDup(false) }
  const load = (c: ApprovalChain) => {
    if (c.department_id) { setScope('department'); setDepartment(c.department_id); setIncludeChildren(c.include_children ?? true) } else { setScope('role'); setRole(c.requester_role) }
    setType(c.request_type); setSubtype(c.subtype ?? ''); setSteps(c.steps); setActive(c.is_active); setEditing(c.id); setOpenStep(null)
  }
  // السلسلة القائمة تُحمَّل تلقائياً — لا استبدال صامت
  useEffect(() => { if (existing && editing !== existing.id) { setSteps(existing.steps); setActive(existing.is_active); setEditing(existing.id); if (existing.department_id) setIncludeChildren(existing.include_children ?? true) } }, [existing, editing])
  const addStep = (st: ApprovalStep) => { if (sameStep(steps[steps.length - 1], st)) { setDup(true); return } setDup(false); setSteps((s) => [...s, st]) }
  const move = (i: number, d: -1 | 1) => setSteps((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; const t = n[i] as ApprovalStep; n[i] = n[j] as ApprovalStep; n[j] = t; return n })
  const patchStep = (i: number, patch: ApprovalStepOptions) => setSteps((s) => s.map((st, k) => (k === i ? { ...st, ...patch } : st)))
  const baseLabel = (s: ApprovalStep) => (s.kind === 'hierarchy' ? `${HIERARCHY_ROLES.find((h) => h.role === s.role)?.label ?? roleLabel(s.role)} (حسب التسلسل)` : s.label ?? userName(s.user_id))
  const optionBadges = (s: ApprovalStep) => [
    s.mode === 'all' ? 'الجميع' : null,
    s.condition ? `إذا ${FIELD_LABEL[s.condition.field].split(' ')[0]} ${s.condition.op === 'gte' ? '≥' : '≤'} ${s.condition.value.toLocaleString('en-US')}` : null,
    s.sla_days ? `مهلة ${s.sla_days} يوم${s.escalate === 'next' ? ' ثم تصعيد' : ''}` : null,
  ].filter(Boolean) as string[]
  const stepLabel = (s: ApprovalStep) => s.label ?? baseLabel(s)
  const typeLabel = (c: ApprovalChain) => `${TYPES.find((t) => t.key === c.request_type)?.label ?? c.request_type}${c.subtype_label ? ` — ${c.subtype_label}` : ''}`

  const doSave = () => save.mutate({ requesterRole: effDepartment ? 'department' : role, requestType: type, steps, active, subtype: effSubtype, department: effDepartment, includeChildren }, { onSuccess: () => setEditing(null) })
  const scopeLabel = (c: ApprovalChain) => (c.department_id ? `قسم «${c.department_name ?? '—'}»${c.include_children ? ' + الفرعية' : ''}` : roleLabel(c.requester_role))
  const chainKey = (c: ApprovalChain) => `${c.department_id ? `dept-${c.department_id.slice(0, 8)}` : c.requester_role}-${c.request_type}${c.subtype ? `-${c.subtype}` : ''}`
  const doCopy = () => {
    if (!copyTarget) return
    const st = (copyTarget.type === 'leave' || copyTarget.type === 'time_permit') && copyTarget.subtype ? copyTarget.subtype : null
    save.mutate({ requesterRole: copyTarget.role, requestType: copyTarget.type, steps, active: true, subtype: st }, { onSuccess: () => setCopyTarget(null) })
  }
  const runSim = () => {
    const ctx: Record<string, number> = {}
    if (sim.amount) ctx.amount = Number(sim.amount); if (sim.days) ctx.days = Number(sim.days); if (sim.minutes) ctx.minutes = Number(sim.minutes)
    simulate.mutate({ userId: sim.userId, type, subtype: effSubtype, context: ctx })
  }

  return (
    <div className="space-y-5" data-testid="approval-chains-page">
      <header>
        <h1 className="text-xl font-black">سلاسل الموافقات</h1>
        <p className="mt-1 text-xs text-slate-600">
          لكل دور طالب ونوع طلب (وللإجازات: نوع فرعي اختياري) سلسلة خطوات مرتبة. الخطوة إمّا <b>«حسب التسلسل»</b> أو <b>«حساب محدد»</b>، ولها خصائص اختيارية: <b>الجميع</b> (كل المعتمدين)، <b>شرط</b> (تُطبَّق فقط إذا تحقق)، <b>مهلة</b> بالأيام مع تذكير و<b>تصعيد</b> تلقائي.
          بلا سلسلة فعّالة يعمل الافتراضي (المدير المباشر / افتراضي الوحدة). لا يوافق أحد على طلب نفسه.
          <br /><b>سلسلة القسم</b> (00391): تُطبَّق على كل موظفي القسم المختار — وأقسامه الفرعية إن شئت — أياً كان دورهم وحتى من لا حساب له (تطلب غرفة العمليات/HR نيابةً عنه).
          الأولوية: قسم الموظف ← القسم الأب ← … ← سلسلة الدور. داخل كل مستوى: النوع الفرعي ثم العام.
        </p>
      </header>

      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="chain-editor">
        <div className="mb-3 inline-flex rounded-xl border p-0.5 text-xs" role="tablist" data-testid="chain-scope">
          {([['role', 'حسب دور الطالب'], ['department', 'حسب القسم (الشجرة التنظيمية)']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={scope === k} data-testid={`chain-scope-${k}`} onClick={() => { setScope(k); if (k === 'department' && !deptTypeOk) { setType('leave'); setSubtype('') } reset() }}
              className={clsx('h-9 rounded-lg px-3 font-black', scope === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}>{l}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {scope === 'role' ? (
            <label className="text-xs font-bold">دور الطالب
              <select data-testid="chain-role" value={role} onChange={(e) => { setRole(e.target.value); reset() }} className="mt-1 h-11 w-full rounded-xl border px-3 font-normal">
                {ROLE_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {REQUESTER_ROLES.filter((r) => r.group === g).map((r) => <option key={r.role} value={r.role}>{roleLabel(r.role)}{withChain.has(scopeKey(r.role, type, effSubtype)) ? ' ✓' : ''}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-bold">القسم <span className="font-normal text-slate-500">(كل موظفيه أياً كان دورهم)</span>
              <select data-testid="chain-department" value={department} onChange={(e) => { setDepartment(e.target.value); reset() }} className="mt-1 h-11 w-full rounded-xl border px-3 font-normal">
                <option value="">اختر قسماً</option>
                {deptTree.map((d) => <option key={d.id} value={d.id}>{'\u00a0\u00a0'.repeat(d.depth)}{d.depth > 0 ? '↳ ' : ''}{d.name}{withChain.has(scopeKey('department', type, effSubtype, d.id)) ? ' ✓' : ''}</option>)}
              </select>
              <label className="mt-1 flex items-center gap-2 text-[11px] font-bold"><input type="checkbox" data-testid="chain-include-children" checked={includeChildren} onChange={(e) => setIncludeChildren(e.target.checked)} /> تشمل الأقسام الفرعية (ما لم يكن للقسم الفرعي سلسلته الخاصة)</label>
            </label>
          )}
          <label className="text-xs font-bold">نوع الطلب
            <select data-testid="chain-type" value={type} onChange={(e) => { setType(e.target.value as ApprovalRequestType); setSubtype(''); reset() }} className="mt-1 h-11 w-full rounded-xl border px-3 font-normal">
              {TYPES.filter((t) => scope === 'role' || DEPT_TYPES.includes(t.key)).map((t) => <option key={t.key} value={t.key}>{t.label}{withChain.has(scopeKey(role, t.key, null, effDepartment)) ? ' ✓' : ''}</option>)}
            </select>
          </label>
          <label className={clsx('text-xs font-bold', !subtypeAllowed && 'opacity-50')}>النوع الفرعي <span className="font-normal text-slate-500">(إجازات/زمنيات)</span>
            <select data-testid="chain-subtype" value={subtype} disabled={!subtypeAllowed} onChange={(e) => { setSubtype(e.target.value); reset() }} className="mt-1 h-11 w-full rounded-xl border px-3 font-normal">
              <option value="">— عام (كل الأنواع) —</option>
              {subtypeOptions.map((t) => <option key={t.code} value={t.code}>{t.name}{withChain.has(scopeKey(role, type, t.code, effDepartment)) ? ' ✓' : ''}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            {existing && <p className="pb-3 text-xs text-emerald-700" data-testid="chain-loaded">سلسلة قائمة ({existing.steps.length} خطوات · إصدار {existing.version_no ?? 1}) — محمَّلة للتعديل؛ الحفظ يستبدلها</p>}
            {!existing && scope === 'department' && !department && <p className="pb-3 text-xs text-slate-500" data-testid="chain-pick-dept">اختر القسم أولاً</p>}
            {!existing && (scope === 'role' || department) && <p className="pb-3 text-xs text-amber-700" data-testid="chain-none">{effSubtype ? 'لا سلسلة خاصة بهذا النوع الفرعي — يعمل العام ثم الافتراضي' : 'لا سلسلة لهذا الدور/النوع — يعمل الافتراضي (المدير المباشر / افتراضي الوحدة)'} — ستُنشأ عند الحفظ</p>}
          </div>
        </div>

        <ol className="mt-4 space-y-2" data-testid="chain-steps">
          {steps.length === 0 && <li className="rounded-xl border border-dashed p-3 text-center text-xs text-slate-500">لا خطوات بعد — أضف أول خطوة أدناه</li>}
          {steps.map((s, i) => (
            <li key={`${i}-${s.kind}`} className="rounded-xl border bg-slate-50 px-3 py-2" data-testid={`chain-step-${i + 1}`}>
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{i + 1}</span>
                <span className="flex-1 text-sm font-bold">{baseLabel(s)}
                  <span className="ms-2 inline-flex flex-wrap gap-1 align-middle">{optionBadges(s).map((b) => <span key={b} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900" data-testid={`chain-step-opt-${i + 1}`}>{b}</span>)}</span>
                </span>
                <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', s.kind === 'hierarchy' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800')}>{s.kind === 'hierarchy' ? 'حسب التسلسل' : 'حساب محدد'}</span>
                <button type="button" aria-label="خصائص الخطوة" data-testid={`chain-step-options-${i + 1}`} onClick={() => setOpenStep(openStep === i ? null : i)} className={clsx('rounded-lg border p-1', openStep === i ? 'bg-slate-900 text-white' : 'bg-white')}><Settings2 size={14} /></button>
                <button type="button" aria-label="أعلى" onClick={() => move(i, -1)} className="rounded-lg border bg-white p-1"><ArrowUp size={14} /></button>
                <button type="button" aria-label="أسفل" onClick={() => move(i, 1)} className="rounded-lg border bg-white p-1"><ArrowDown size={14} /></button>
                <button type="button" aria-label="حذف الخطوة" data-testid={`chain-step-remove-${i + 1}`} onClick={() => { setSteps((x) => x.filter((_, k) => k !== i)); setOpenStep(null) }} className="rounded-lg border bg-white p-1 text-rose-700"><Trash2 size={14} /></button>
              </div>
              {openStep === i && (
                <div className="mt-3 grid gap-3 rounded-xl border bg-white p-3 text-xs md:grid-cols-4" data-testid={`chain-step-panel-${i + 1}`}>
                  <label className="font-bold">النمط
                    <select data-testid={`step-mode-${i + 1}`} value={s.mode ?? 'any'} onChange={(e) => patchStep(i, { mode: e.target.value as 'any' | 'all' })} className="mt-1 h-10 w-full rounded-lg border px-2 font-normal">
                      <option value="any">أي واحد من المعتمدين يكفي</option>
                      <option value="all">الجميع يجب أن يوافقوا</option>
                    </select>
                  </label>
                  <div className="font-bold md:col-span-2">شرط التطبيق <span className="font-normal text-slate-500">(بلا شرط = تُطبَّق دائماً)</span>
                    <div className="mt-1 flex gap-2">
                      <select data-testid={`step-cond-field-${i + 1}`} value={s.condition?.field ?? ''} onChange={(e) => patchStep(i, { condition: e.target.value ? { field: e.target.value as 'amount' | 'days' | 'minutes', op: s.condition?.op ?? 'gte', value: s.condition?.value ?? 0 } : null })} className="h-10 flex-1 rounded-lg border px-2 font-normal">
                        <option value="">بلا شرط</option>
                        {typeMeta.fields.map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
                      </select>
                      <select data-testid={`step-cond-op-${i + 1}`} value={s.condition?.op ?? 'gte'} disabled={!s.condition} onChange={(e) => s.condition && patchStep(i, { condition: { ...s.condition, op: e.target.value as 'gte' | 'lte' } })} className="h-10 w-20 rounded-lg border px-2 font-normal">
                        <option value="gte">≥</option><option value="lte">≤</option>
                      </select>
                      <input data-testid={`step-cond-value-${i + 1}`} type="number" min={0} step="any" disabled={!s.condition} value={s.condition?.value ?? ''} onChange={(e) => s.condition && patchStep(i, { condition: { ...s.condition, value: Number(e.target.value) } })} className="h-10 w-32 rounded-lg border px-2 font-normal dir-ltr" />
                    </div>
                    {typeMeta.fields.length === 0 && <p className="mt-1 text-[11px] text-slate-500">هذا النوع بلا قيم قابلة للشرط.</p>}
                  </div>
                  <div className="font-bold">المهلة والتصعيد
                    <div className="mt-1 flex gap-2">
                      <input data-testid={`step-sla-${i + 1}`} type="number" min={0} max={60} placeholder="أيام" value={s.sla_days ?? ''} onChange={(e) => patchStep(i, { sla_days: e.target.value ? Number(e.target.value) : null, escalate: e.target.value ? s.escalate : 'none' })} className="h-10 w-20 rounded-lg border px-2 font-normal dir-ltr" />
                      <select data-testid={`step-escalate-${i + 1}`} value={s.escalate ?? 'none'} disabled={!s.sla_days} onChange={(e) => patchStep(i, { escalate: e.target.value as 'none' | 'next' })} className="h-10 flex-1 rounded-lg border px-2 font-normal">
                        <option value="none">تذكير فقط</option>
                        <option value="next">تذكير ثم تصعيد للخطوة التالية</option>
                      </select>
                    </div>
                    <p className="mt-1 text-[11px] font-normal text-slate-500">تذكير عند انقضاء المهلة؛ التصعيد بعد ضعفها.</p>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs font-black">إضافة خطوة «حسب التسلسل»</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {HIERARCHY_ROLES.map((h) => (
                <button key={h.role} type="button" title={h.hint} data-testid={`add-hier-${h.role}`} onClick={() => addStep({ kind: 'hierarchy', role: h.role })}
                  className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-900"><Plus size={12} className="inline" /> {h.label}</button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-black">إضافة خطوة «حساب محدد»</p>
            <input aria-label="بحث عن حساب" data-testid="account-search" value={accountQuery} onChange={(e) => setAccountQuery(e.target.value)} placeholder="ابحث بالاسم أو البريد" className="mt-2 h-10 w-full rounded-xl border px-3 text-sm" />
            <div className="mt-2 flex gap-2">
              <select aria-label="الحساب" data-testid="account-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-10 flex-1 rounded-xl border px-2 text-sm">
                <option value="">اختر حساباً</option>
                {accountOptions.map((u) => <option key={u.id} value={u.id}>{u.employee_name ?? u.email} — {u.roles.map(roleLabel).join('، ') || 'بلا دور'}</option>)}
              </select>
              <button type="button" data-testid="add-account" disabled={!accountId} onClick={() => { const u = (users.data ?? []).find((x) => x.id === accountId); addStep({ kind: 'account', user_id: accountId, label: u?.employee_name ?? u?.email ?? undefined }); setAccountId('') }}
                className="h-10 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-40">إضافة</button>
            </div>
          </div>
        </div>
        {dup && <p className="mt-2 text-xs font-bold text-rose-700" role="alert" data-testid="chain-dup">الخطوة نفسها لا تُكرَّر مباشرة بعد نفسها — المعتمِد نفسه لن يوافق مرتين متتاليتين</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" data-testid="chain-active" checked={active} onChange={(e) => setActive(e.target.checked)} /> السلسلة فعّالة</label>
          <button type="button" data-testid="chain-save" disabled={steps.length === 0 || save.isPending || (scope === 'department' && !department)} onClick={doSave} className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-40">حفظ السلسلة</button>
          <button type="button" data-testid="chain-copy" disabled={steps.length === 0} onClick={() => setCopyTarget({ role, type, subtype: '' })} className="flex h-11 items-center gap-1 rounded-xl border px-4 text-sm font-bold disabled:opacity-40"><Copy size={14} /> نسخ إلى دور/نوع آخر</button>
          {steps.length > 0 && <button type="button" onClick={reset} className="h-11 rounded-xl border px-4 text-sm font-bold">تفريغ</button>}
        </div>

        {copyTarget && (
          <div className="mt-3 grid gap-2 rounded-xl border border-dashed p-3 text-xs md:grid-cols-4" data-testid="chain-copy-panel">
            <label className="font-bold">إلى دور
              <select data-testid="copy-role" value={copyTarget.role} onChange={(e) => setCopyTarget({ ...copyTarget, role: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-2 font-normal">
                {REQUESTER_ROLES.map((r) => <option key={r.role} value={r.role}>{roleLabel(r.role)}</option>)}
              </select>
            </label>
            <label className="font-bold">إلى نوع
              <select data-testid="copy-type" value={copyTarget.type} onChange={(e) => setCopyTarget({ ...copyTarget, type: e.target.value as ApprovalRequestType, subtype: '' })} className="mt-1 h-10 w-full rounded-lg border px-2 font-normal">
                {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label className="font-bold">نوع فرعي
              <select data-testid="copy-subtype" value={copyTarget.subtype} disabled={!(copyTarget.type === 'leave' || copyTarget.type === 'time_permit')} onChange={(e) => setCopyTarget({ ...copyTarget, subtype: e.target.value })} className="mt-1 h-10 w-full rounded-lg border px-2 font-normal">
                <option value="">— عام —</option>
                {(leaveTypes.data ?? []).filter((t) => t.kind === copyTarget.type).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" data-testid="copy-confirm" onClick={doCopy} className="h-10 rounded-lg bg-slate-900 px-4 font-black text-white">نسخ</button>
              <button type="button" onClick={() => setCopyTarget(null)} className="h-10 rounded-lg border px-3 font-bold">إلغاء</button>
              {withChain.has(scopeKey(copyTarget.role, copyTarget.type, copyTarget.subtype || null)) && <span className="pb-2 text-amber-700" data-testid="copy-overwrite">الهدف له سلسلة — ستُستبدل</span>}
            </div>
          </div>
        )}
      </section>

      {/* المحاكاة */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="chain-sim">
        <h2 className="flex items-center gap-2 text-sm font-black"><Wand2 size={16} /> محاكاة: لو طلب فلان «{typeMeta.label.split(' (')[0]}{effSubtype ? ` — ${subtypeOptions.find((t) => t.code === effSubtype)?.name ?? ''}` : ''}» — من يوافق؟</h2>
        <p className="mt-1 text-[11px] text-slate-500">تُجرى على السلاسل <b>المحفوظة</b> (احفظ أولاً). الأشخاص الفعليون حسب إسنادات الطالب والتفويضات النافذة اليوم.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          <input aria-label="بحث عن طالب" data-testid="sim-search" value={sim.query} onChange={(e) => setSim({ ...sim, query: e.target.value })} placeholder="ابحث عن الطالب" className="h-10 rounded-xl border px-3 text-sm" />
          <select aria-label="الطالب" data-testid="sim-user" value={sim.userId} onChange={(e) => setSim({ ...sim, userId: e.target.value })} className="h-10 rounded-xl border px-2 text-sm md:col-span-2">
            <option value="">اختر الطالب</option>
            {simOptions.map((u) => <option key={u.id} value={u.id}>{u.employee_name ?? u.email} — {u.roles.map(roleLabel).join('، ') || 'بلا دور'}</option>)}
          </select>
          {typeMeta.fields.map((f) => <input key={f} data-testid={`sim-${f}`} type="number" min={0} placeholder={FIELD_LABEL[f]} value={sim[f]} onChange={(e) => setSim({ ...sim, [f]: e.target.value })} className="h-10 rounded-xl border px-3 text-sm dir-ltr" />)}
          <button type="button" data-testid="sim-run" disabled={!sim.userId || simulate.isPending} onClick={runSim} className="h-10 rounded-xl bg-indigo-700 px-4 text-sm font-black text-white disabled:opacity-40">شغّل المحاكاة</button>
        </div>
        {simulate.data && (
          <div className="mt-3 rounded-xl border bg-slate-50 p-3 text-xs" data-testid="sim-result">
            {!simulate.data.chain_id ? <p className="font-bold text-amber-800">{simulate.data.note ?? 'لا سلسلة'}</p> : (
              <>
                <p className="font-bold">السلسلة المطبَّقة: {simulate.data.department_name ? `قسم «${simulate.data.department_name}»` : simulate.data.requester_label}{simulate.data.subtype ? ` — ${subtypeOptions.find((t) => t.code === simulate.data?.subtype)?.name ?? simulate.data.subtype}` : ' — عامة'}</p>
                <ol className="mt-2 space-y-1">
                  {simulate.data.steps.map((st) => (
                    <li key={st.step_no} className={clsx('flex flex-wrap items-center gap-2 rounded-lg border bg-white px-2 py-1', st.status !== 'active' && 'opacity-60')} data-testid={`sim-step-${st.step_no}`}>
                      <span className="font-black">{st.step_no}.</span><span className="font-bold">{st.label}</span>
                      {st.condition && <span className="rounded-full bg-amber-100 px-2 text-[10px] font-bold text-amber-900">{st.condition}</span>}
                      {st.mode === 'all' && <span className="rounded-full bg-amber-100 px-2 text-[10px] font-bold text-amber-900">الجميع</span>}
                      {st.sla_days && <span className="rounded-full bg-amber-100 px-2 text-[10px] font-bold text-amber-900">مهلة {st.sla_days} يوم{st.escalate === 'next' ? ' ثم تصعيد' : ''}</span>}
                      <span className="ms-auto">
                        {st.status === 'active' && <>{st.approvers.map((a) => a.name).join('، ') || '—'}{st.delegates.length > 0 && <span className="text-indigo-700"> (بالتفويض: {st.delegates.map((d) => `${d.to_name} عن ${d.from_name}`).join('، ')})</span>}</>}
                        {st.status === 'skipped_condition' && <span className="text-slate-500">تُخطّى — الشرط غير متحقق</span>}
                        {st.status === 'skipped_nobody' && <span className="text-rose-700">تُخطّى — لا يوجد معتمِد</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </section>

      {/* 00391: التشخيص — لماذا لا توجد سلسلة لهذا الموظف؟ */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="chain-diagnose">
        <h2 className="text-sm font-black">تشخيص: ما الذي سيُطبَّق على موظف معيّن — ولماذا «لا توجد سلسلة»؟</h2>
        <p className="mt-1 text-[11px] text-slate-500">يعمل لأي موظف في ملاك الموارد البشرية حتى بلا حساب. يفحص: القسم، سلسلة القسم/الأب، الحساب والأدوار، سلسلة الدور، المدير المباشر — ويقترح الحل.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input aria-label="بحث عن موظف" data-testid="diag-search" value={diag.query} onChange={(e) => setDiag({ query: e.target.value, employeeId: '' })} placeholder="ابحث بالاسم أو الرقم الوظيفي (حرفان على الأقل)" className="h-10 rounded-xl border px-3 text-sm" />
          <select aria-label="الموظف" data-testid="diag-employee" value={diag.employeeId} onChange={(e) => setDiag({ ...diag, employeeId: e.target.value })} className="h-10 rounded-xl border px-2 text-sm md:col-span-2">
            <option value="">{diag.query.trim().length < 2 ? 'اكتب في البحث أولاً' : (diagEmployees.data ?? []).length === 0 ? 'لا نتائج' : 'اختر الموظف'}</option>
            {(diagEmployees.data ?? []).slice(0, 50).map((e) => <option key={e.id} value={e.id}>{e.full_name} — {e.employee_number}{e.department_name ? ` · ${e.department_name}` : ''}</option>)}
          </select>
        </div>
        {diag.employeeId && (type === 'leave' || type === 'time_permit' || type === 'advance') && (
          <div className="mt-3"><ChainPreview employeeId={diag.employeeId} type={type} subtype={effSubtype} detailed testId="diag-preview" /></div>
        )}
        {diag.employeeId && !(type === 'leave' || type === 'time_permit' || type === 'advance') && <p className="mt-2 text-xs text-amber-700" data-testid="diag-type-note">التشخيص متاح لأنواع الإجازة/الزمنية/السلفة — اختر أحدها في المحرر أعلاه.</p>}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black">السلاسل المضبوطة</h2>
        {chains.isLoading ? <LoadingSpinner /> : (chains.data ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-500" data-testid="chains-empty">لا سلاسل بعد — كل الطلبات تمر بالافتراضي.</p> : (
          <ul className="mt-3 divide-y" data-testid="chains-list">
            {(chains.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-3" data-testid={`chain-${chainKey(c)}`}>
                <div className="min-w-[12rem]">
                  <div className="text-sm font-black">{c.department_id && <span className="me-1 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-black text-sky-900">قسم</span>}{scopeLabel(c)} · {typeLabel(c)}</div>
                  {c.department_path && c.department_path.includes('←') && <div className="text-[10px] text-slate-500" dir="rtl">{c.department_path}</div>}
                  <div className="text-[11px] text-slate-500">{c.is_active ? 'فعّالة' : 'معطّلة'} · إصدار {c.version_no ?? 1}{c.updated_by_name ? ` · آخر تعديل: ${c.updated_by_name}` : ''}</div>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1 text-xs">
                  {c.steps.map((s, i) => <span key={i} className={clsx('rounded-full px-2 py-0.5 font-bold', s.kind === 'hierarchy' ? 'bg-indigo-100 text-indigo-900' : 'bg-emerald-100 text-emerald-900')}>{i + 1}. {stepLabel(s)}{optionBadges(s).length > 0 && <span className="text-amber-800"> [{optionBadges(s).join(' · ')}]</span>}</span>)}
                </div>
                <button type="button" data-testid={`chain-edit-${chainKey(c)}`} onClick={() => load(c)} className="rounded-lg border px-3 py-1 text-xs font-bold">تعديل</button>
                <button type="button" aria-label="سجل الإصدارات" data-testid={`chain-history-${chainKey(c)}`} onClick={() => setVersionsOf(versionsOf?.id === c.id ? null : c)} className="rounded-lg border px-2 py-1 text-xs font-bold"><History size={14} /></button>
                <button disabled={del.isPending} type="button" data-testid={`chain-delete-${chainKey(c)}`} onClick={() => { if (window.confirm('حذف السلسلة؟ ستعود طلبات هذا الدور إلى الافتراضي.')) del.mutate(c.id) }} className="rounded-lg border px-3 py-1 text-xs font-bold text-rose-700">حذف</button>
              </li>
            ))}
          </ul>
        )}
        {versionsOf && (
          <div className="mt-3 rounded-xl border bg-slate-50 p-3 text-xs" data-testid="chain-versions">
            <div className="flex items-center justify-between"><p className="font-black">سجل إصدارات: {scopeLabel(versionsOf)} · {typeLabel(versionsOf)}</p><button type="button" onClick={() => setVersionsOf(null)} className="rounded-lg border bg-white px-2 py-0.5 font-bold">إغلاق</button></div>
            {versions.isLoading ? <LoadingSpinner /> : (
              <ul className="mt-2 space-y-1">
                {(versions.data ?? []).map((v) => (
                  <li key={v.id} className="rounded-lg border bg-white px-2 py-1" data-testid={`chain-version-${v.version_no}`}>
                    <span className="font-black">إصدار {v.version_no}</span> · {v.action === 'created' ? 'إنشاء' : v.action === 'updated' ? 'تعديل' : 'حذف'} · {v.changed_by_name ?? '—'} · {fmtDate(v.changed_at)} · {v.is_active ? 'فعّالة' : 'معطّلة'}
                    <div className="mt-1 flex flex-wrap gap-1">{v.steps.map((s, i) => <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5">{i + 1}. {stepLabel(s)}{optionBadges(s).length > 0 ? ` [${optionBadges(s).join(' · ')}]` : ''}</span>)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      <DelegationPanel admin />
    </div>
  )
}

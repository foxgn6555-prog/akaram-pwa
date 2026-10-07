/**
 * 00160 — سلاسل الموافقات (التطوير المركزية).
 * لكل (دور طالب × نوع طلب) سلسلة خطوات مرتبة. كل خطوة إمّا:
 *  - «حسب التسلسل»: مسؤول قسمه / مسؤول قاطعه / العمليات الميدانية / … — النظام يحدد الشخص تلقائياً من الإسنادات.
 *  - «حساب محدد»: شخص بعينه.
 * مثال: متعهد/إجازة = مسؤول قسمه → مسؤول قاطعه → العمليات الميدانية → معاون المدير (محدد) → المدير المفوض (محدد).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useApprovalChains, useDeleteApprovalChain, useSaveApprovalChain } from '@features/sector-manager/hooks'
import { useUsers } from '@features/user-management'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import type { ApprovalChain, ApprovalRequestType, ApprovalStep } from '@sdk/sector-manager.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const REQUESTER_ROLES = ['employee', 'department_manager', 'admin_ops', 'field_ops', 'maintenance', 'central_garage_officer', 'transfer_station', 'ops_room', 'hr_officer', 'finance_officer', 'media', 'complaints', 'disclosures', 'it_admin', 'deputy_director', 'executive_director'] as const
const HIERARCHY_ROLES: { role: string; label: string; hint: string }[] = [
  { role: 'department_manager', label: 'مسؤول قسمه', hint: 'مسؤول القسم المسؤول عن الطالب (للمتعهد: من إسناده؛ للموظف: المدير المباشر في HR)' },
  { role: 'admin_ops', label: 'مسؤول قاطعه', hint: 'مسؤول القاطع الذي يتبع له الطالب (الكرادة/الزعفرانية)' },
  { role: 'field_ops', label: 'العمليات الميدانية', hint: 'حسابات العمليات الميدانية' },
  { role: 'hr_officer', label: 'الموارد البشرية', hint: 'أي موظف موارد بشرية' },
  { role: 'deputy_director', label: 'معاون المدير المفوض', hint: 'أي حساب بهذا الدور' },
  { role: 'executive_director', label: 'المدير التنفيذي', hint: 'أي حساب بهذا الدور' },
  { role: 'super_admin', label: 'المدير المفوض', hint: 'أي حساب بهذا الدور' },
]
const TYPES: { key: ApprovalRequestType; label: string }[] = [{ key: 'leave', label: 'إجازة' }, { key: 'time_permit', label: 'زمنية (إذن وقتي)' }, { key: 'supplies', label: 'مستلزمات القواطع (من مخزن غرفة العمليات)' }, { key: 'termination', label: 'إنهاء خدمة (وحدة الإجراءات)' }, { key: 'disclosure', label: 'كشف (وحدة الكشوفات — غرفة العمليات)' }, { key: 'advance', label: 'سلفة (تُدخلها غرفة العمليات لموظف — الافتراضي: المعاون ثم المدير المفوض)' }]
const roleLabel = (r: string) => (ROLE_LABELS as Record<string, string>)[r] ?? r

export default function ApprovalChainsPage() {
  const chains = useApprovalChains(), save = useSaveApprovalChain(), del = useDeleteApprovalChain()
  const users = useUsers()
  const [role, setRole] = useState<string>('employee'), [type, setType] = useState<ApprovalRequestType>('leave')
  const [steps, setSteps] = useState<ApprovalStep[]>([]), [active, setActive] = useState(true), [editing, setEditing] = useState<string | null>(null)
  const [accountId, setAccountId] = useState(''), [accountQuery, setAccountQuery] = useState('')
  const existing = useMemo(() => (chains.data ?? []).find((c) => c.requester_role === role && c.request_type === type), [chains.data, role, type])
  const accountOptions = useMemo(() => (users.data ?? []).filter((u) => (u.employee_name ?? u.email ?? '').includes(accountQuery)).slice(0, 30), [users.data, accountQuery])
  const userName = (id: string) => { const u = (users.data ?? []).find((x) => x.id === id); return u?.employee_name ?? u?.email ?? id.slice(0, 8) }

  const load = (c: ApprovalChain) => { setRole(c.requester_role); setType(c.request_type); setSteps(c.steps); setActive(c.is_active); setEditing(c.id) }
  const reset = () => { setSteps([]); setActive(true); setEditing(null) }
  const move = (i: number, d: -1 | 1) => setSteps((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; const t = n[i] as ApprovalStep; n[i] = n[j] as ApprovalStep; n[j] = t; return n })
  const stepLabel = (s: ApprovalStep) => (s.kind === 'hierarchy' ? `${HIERARCHY_ROLES.find((h) => h.role === s.role)?.label ?? roleLabel(s.role)} (حسب التسلسل)` : s.label ?? userName(s.user_id))

  return (
    <div className="space-y-5" data-testid="approval-chains-page">
      <header>
        <h1 className="text-xl font-black">سلاسل الموافقات</h1>
        <p className="mt-1 text-xs text-slate-600">
          لكل دور طالب ونوع طلب سلسلة خطوات مرتبة. الخطوة إمّا <b>«حسب التسلسل»</b> (النظام يحدد الشخص تلقائياً من إسنادات الطالب) أو <b>«حساب محدد»</b>.
          بلا سلسلة فعّالة يبقى الطلب على قاعدة «المدير المباشر» في الموارد البشرية. لا يوافق أحد على طلب نفسه (تُخطّى الخطوة تلقائياً).
        </p>
      </header>

      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="chain-editor">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold">دور الطالب
            <select data-testid="chain-role" value={role} onChange={(e) => { setRole(e.target.value); reset() }} className="mt-1 h-11 w-full rounded-xl border px-3 font-normal">
              {REQUESTER_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold">نوع الطلب
            <select data-testid="chain-type" value={type} onChange={(e) => { setType(e.target.value as ApprovalRequestType); reset() }} className="mt-1 h-11 w-full rounded-xl border px-3 font-normal">
              {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            {existing && !editing && <button type="button" data-testid="chain-load" onClick={() => load(existing)} className="h-11 rounded-xl border px-4 text-sm font-bold">تحميل السلسلة الحالية ({existing.steps.length} خطوات)</button>}
            {!existing && <p className="pb-3 text-xs text-amber-700" data-testid="chain-none">لا سلسلة لهذا الدور/النوع — ستُنشأ عند الحفظ</p>}
          </div>
        </div>

        <ol className="mt-4 space-y-2" data-testid="chain-steps">
          {steps.length === 0 && <li className="rounded-xl border border-dashed p-3 text-center text-xs text-slate-500">لا خطوات بعد — أضف أول خطوة أدناه</li>}
          {steps.map((s, i) => (
            <li key={`${i}-${s.kind}`} className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2" data-testid={`chain-step-${i + 1}`}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{i + 1}</span>
              <span className="flex-1 text-sm font-bold">{stepLabel(s)}</span>
              <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', s.kind === 'hierarchy' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800')}>{s.kind === 'hierarchy' ? 'حسب التسلسل' : 'حساب محدد'}</span>
              <button type="button" aria-label="أعلى" onClick={() => move(i, -1)} className="rounded-lg border bg-white p-1"><ArrowUp size={14} /></button>
              <button type="button" aria-label="أسفل" onClick={() => move(i, 1)} className="rounded-lg border bg-white p-1"><ArrowDown size={14} /></button>
              <button type="button" aria-label="حذف الخطوة" data-testid={`chain-step-remove-${i + 1}`} onClick={() => setSteps((x) => x.filter((_, k) => k !== i))} className="rounded-lg border bg-white p-1 text-rose-700"><Trash2 size={14} /></button>
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs font-black">إضافة خطوة «حسب التسلسل»</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {HIERARCHY_ROLES.map((h) => (
                <button key={h.role} type="button" title={h.hint} data-testid={`add-hier-${h.role}`} onClick={() => setSteps((s) => [...s, { kind: 'hierarchy', role: h.role }])}
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
              <button type="button" data-testid="add-account" disabled={!accountId} onClick={() => { const u = (users.data ?? []).find((x) => x.id === accountId); setSteps((s) => [...s, { kind: 'account', user_id: accountId, label: u?.employee_name ?? u?.email ?? undefined }]); setAccountId('') }}
                className="h-10 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-40">إضافة</button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" data-testid="chain-active" checked={active} onChange={(e) => setActive(e.target.checked)} /> السلسلة فعّالة</label>
          <button type="button" data-testid="chain-save" disabled={steps.length === 0 || save.isPending} onClick={() => save.mutate({ requesterRole: role, requestType: type, steps, active }, { onSuccess: () => setEditing(null) })}
            className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-40">حفظ السلسلة</button>
          {steps.length > 0 && <button type="button" onClick={reset} className="h-11 rounded-xl border px-4 text-sm font-bold">تفريغ</button>}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black">السلاسل المضبوطة</h2>
        {chains.isLoading ? <LoadingSpinner /> : (chains.data ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-500" data-testid="chains-empty">لا سلاسل بعد — كل الطلبات تمر بالمدير المباشر.</p> : (
          <ul className="mt-3 divide-y" data-testid="chains-list">
            {(chains.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-3" data-testid={`chain-${c.requester_role}-${c.request_type}`}>
                <div className="min-w-[10rem]">
                  <div className="text-sm font-black">{c.requester_label} · {TYPES.find((t) => t.key === c.request_type)?.label}</div>
                  <div className="text-[11px] text-slate-500">{c.is_active ? 'فعّالة' : 'معطّلة'}{c.updated_by_name ? ` · آخر تعديل: ${c.updated_by_name}` : ''}</div>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-1 text-xs">
                  {c.steps.map((s, i) => <span key={i} className={clsx('rounded-full px-2 py-0.5 font-bold', s.kind === 'hierarchy' ? 'bg-indigo-100 text-indigo-900' : 'bg-emerald-100 text-emerald-900')}>{i + 1}. {s.label ?? stepLabel(s)}</span>)}
                </div>
                <button type="button" data-testid={`chain-edit-${c.requester_role}-${c.request_type}`} onClick={() => load(c)} className="rounded-lg border px-3 py-1 text-xs font-bold">تعديل</button>
                <button type="button" data-testid={`chain-delete-${c.requester_role}-${c.request_type}`} onClick={() => { if (window.confirm('حذف السلسلة؟ ستعود طلبات هذا الدور إلى المدير المباشر.')) del.mutate(c.id) }} className="rounded-lg border px-3 py-1 text-xs font-bold text-rose-700">حذف</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

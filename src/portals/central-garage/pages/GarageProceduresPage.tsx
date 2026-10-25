/**
 * إجراءات القسم (00209 / 00348) — ① «طلب تعيين موظف» ببيانات أساسية فقط وبلا رقم وظيفي: الطلب يمرّ بسلسلة الموافقات (تُضبط من التطوير المركزية؛
 * بلا سلسلة ⇒ المدير المفوض) ثم تكتب الموارد البشرية الرقم الوظيفي وتُكمل الملف — عندها فقط يُنشأ الموظف. الطلب المرفوض لا يُنشئ موظفاً.
 * ② إنهاء خدمة موظفي القسم عبر سلسلة الموافقات (00163) ③ طلباتي (تعيين + إنهاء) ④ التعيينات الأخيرة ومتابعة اكتمال الملف.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { useCancelHireRequest, useGarageHire, useGarageHireOptions, useGarageRecentHires, useMyHireRequests } from '@features/central-garage/hooks'
import type { MyHireRequest } from '@features/central-garage/types'
import { useMyTerminationRequests } from '@features/sector-manager/hooks'
import { ExecPageHeader, ExecTabBar } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { MyRequests, NewTermination } from '@portals/admin-ops/pages/Procedures/ProceduresPage'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'

type Tab = 'hire' | 'terminate' | 'mine' | 'hires'
const field = 'mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50'
const today = () => new Date().toISOString().slice(0, 10)
const n = (v: number) => v.toLocaleString('en-US')
const HIRE_STATUS: Record<MyHireRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'قيد الموافقة', cls: 'bg-amber-50 text-amber-800' }, approved: { label: 'معتمد — بانتظار الموارد البشرية', cls: 'bg-sky-50 text-sky-800' },
  rejected: { label: 'مرفوض', cls: 'bg-red-50 text-red-700' }, cancelled: { label: 'ملغى', cls: 'bg-slate-100 text-slate-600' }, completed: { label: 'مكتمل — نزل للنظام', cls: 'bg-emerald-50 text-emerald-700' },
}

export interface DeptProceduresPageProps { title?: string; dept?: string; testId?: string }
/** صفحة مشتركة بنطاق القسم — الكراج افتراضياً؛ المحطة التحويلية (00213) والصيانة (00223) تمرران عنوانهما واسم جهتهما. */
export default function GarageProceduresPage({ title = 'إجراءات الكراج', dept = 'الكراج', testId = 'garage-procedures-page' }: DeptProceduresPageProps = {}) {
  const [tab, setTab] = useState<Tab>('hire')
  const mine = useMyTerminationRequests()
  const hireReqs = useMyHireRequests()
  const hires = useGarageRecentHires()
  const all = mine.data ?? []
  const pendingTerm = all.filter((r) => r.status === 'pending').length
  const pendingHire = (hireReqs.data ?? []).filter((r) => r.status === 'pending').length
  const awaitingHr = (hireReqs.data ?? []).filter((r) => r.status === 'approved').length
  const pending = pendingTerm + pendingHire
  const incomplete = (hires.data ?? []).filter((h) => !h.has_biometric || !h.salary_ready || !h.has_manager).length
  return (
    <div className="space-y-4 pb-4" data-testid={testId}>
      <ExecPageHeader icon="flow" title={title} subtitle={`طلب تعيين موظف جديد (بلا رقم وظيفي — يمرّ بسلسلة الموافقات ثم تُكمله الموارد البشرية)، وإنهاء خدمة لموظفي قسم ${dept} عبر سلسلة الموافقات — الراتب للمالية`}
        stats={[{ label: 'تعيين قيد الموافقة', value: hireReqs.isLoading ? '…' : n(pendingHire), tone: pendingHire ? 'gold' : 'plain' }, { label: 'معتمد بانتظار HR', value: hireReqs.isLoading ? '…' : n(awaitingHr), tone: awaitingHr ? 'gold' : 'plain' }, { label: 'إنهاء قيد الموافقة', value: mine.isLoading ? '…' : n(pendingTerm), tone: pendingTerm ? 'gold' : 'plain' }, { label: 'ملفات غير مكتملة', value: hires.isLoading ? '…' : n(incomplete), tone: incomplete ? 'red' : 'green' }]} />
      <ExecTabBar value={tab} onChange={setTab} testId="gp-tabs" tabs={[{ key: 'hire', label: 'طلب تعيين', icon: 'user-plus' }, { key: 'terminate', label: 'إنهاء خدمة', icon: 'alert-triangle' }, { key: 'mine', label: 'طلباتي', icon: 'list', badge: pending }, { key: 'hires', label: 'التعيينات الأخيرة', icon: 'users', badge: incomplete }]} />
      {tab === 'hire' && <HireForm dept={dept} onDone={() => setTab('mine')} />}
      {tab === 'terminate' && <NewTermination onDone={() => setTab('mine')} />}
      {tab === 'mine' && <><MyHireRequests /><MyRequests /></>}
      {tab === 'hires' && <RecentHires />}
    </div>
  )
}

function HireForm({ onDone, dept }: { onDone: () => void; dept: string }) {
  const { data: opts, isLoading, error } = useGarageHireOptions()
  const hire = useGarageHire()
  const [fullName, setFullName] = useState(''); const [phone, setPhone] = useState('')
  const [titleId, setTitleId] = useState(''); const [shiftId, setShiftId] = useState(''); const [hireDate, setHireDate] = useState(today()); const [contract, setContract] = useState<'monthly' | 'daily'>('monthly')
  const [done, setDone] = useState<string | null>(null)
  const title = opts?.job_titles.find((t) => t.id === titleId)
  const canSend = fullName.trim().length >= 3 && !!titleId && !!hireDate && !hire.isPending
  const submit = async () => {
    setDone(null)
    try {
      const r = await hire.mutateAsync({ full_name: fullName.trim(), phone: phone.trim() || null, job_title_id: titleId, hire_date: hireDate, contract_type: contract, shift_id: shiftId || null })
      setDone(`أُرسل طلب تعيين ${r.full_name} (${r.job_title}) إلى ${r.via_chain ? 'سلسلة الموافقات' : 'المدير المفوض'} — بعد الاعتماد تكتب الموارد البشرية الرقم الوظيفي وتُكمل الملف`)
      setFullName(''); setPhone(''); setTitleId(''); setShiftId('')
      onDone()
    } catch { /* الخطأ يُعرض أدناه */ }
  }
  if (isLoading) return <LoadingSpinner />
  if (error) return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{disclosureErrorMessage(error)}</p>
  if (!opts?.job_titles.length) return <EmptyState title={`لا مسميات وظيفية في هيكل قسم ${dept}`} hint={`اطلب من الموارد البشرية إضافة المسميات تحت قسم ${dept} في الهيكل التنظيمي`} />
  const path = opts.chain?.labels.length ? opts.chain.labels.join(' ← ') : 'المدير المفوض (الافتراضي — بلا سلسلة مضبوطة)'
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="gp-hire-form">
      <h2 className="text-sm font-black text-slate-800">طلب تعيين موظف جديد في قسم {dept}</h2>
      <p className="mt-1 text-[11px] text-slate-500">هذا طلب فقط — لا يُنشأ الموظف ولا يُكتب رقمه الوظيفي هنا. بعد اعتماد الطلب تكتب الموارد البشرية الرقم الوظيفي وتُكمل البيانات (البصمة، البيانات الشخصية، المدير المباشر)؛ الراتب تحدده المالية. القسم وخانة «سائق» يُشتقّان من المسمى.</p>
      <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700" data-testid="gp-hire-path">مسار الموافقة: {path}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">الاسم الكامل<input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} data-testid="gp-name" /></label>
        <label className="text-xs font-semibold text-slate-600">الهاتف (اختياري)<input className={field} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="gp-phone" /></label>
        <label className="text-xs font-semibold text-slate-600">المسمى الوظيفي
          <select className={field} value={titleId} onChange={(e) => setTitleId(e.target.value)} data-testid="gp-title">
            <option value="">— اختر —</option>{opts.job_titles.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.department}{t.drives_vehicles ? ' · سائق' : ''}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">تاريخ المباشرة<input type="date" dir="ltr" className={field} value={hireDate} onChange={(e) => setHireDate(e.target.value)} data-testid="gp-date" /></label>
        <label className="text-xs font-semibold text-slate-600">نوع العقد
          <select className={field} value={contract} onChange={(e) => setContract(e.target.value as 'monthly' | 'daily')} data-testid="gp-contract"><option value="monthly">شهري</option><option value="daily">يومي</option></select>
        </label>
        <label className="text-xs font-semibold text-slate-600">الشفت (اختياري)
          <select className={field} value={shiftId} onChange={(e) => setShiftId(e.target.value)} data-testid="gp-shift">
            <option value="">— لاحقاً من الموارد البشرية —</option>{opts.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.start_time}–{s.end_time}</option>)}
          </select>
        </label>
      </div>
      {title && <p className="mt-2 text-[11px] text-slate-500">سيُسجَّل في قسم «{title.department}»{title.drives_vehicles ? ' ويظهر ضمن سائقي غرفة العمليات' : ''} بعد إكمال الموارد البشرية.</p>}
      {hire.error && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700" data-testid="gp-hire-error">{disclosureErrorMessage(hire.error)}</p>}
      {done && <p className="mt-2 rounded-xl bg-emerald-50 p-2 text-xs font-bold text-emerald-700" data-testid="gp-hire-done">{done}</p>}
      <button type="button" disabled={!canSend} onClick={() => void submit()} className="mt-3 h-10 rounded-xl bg-[#0b3d6b] px-5 text-sm font-black text-white disabled:opacity-40" data-testid="gp-hire-submit">إرسال طلب التعيين</button>
    </section>
  )
}

/** 00348: طلبات التعيين التي قدّمتها — الحالة وعند من يقف الطلب وسبب الرفض */
function MyHireRequests() {
  const { data, isLoading, error } = useMyHireRequests()
  const cancel = useCancelHireRequest()
  if (isLoading) return <LoadingSpinner />
  if (error) return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{disclosureErrorMessage(error)}</p>
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="gp-hire-requests">
      <h2 className="text-sm font-black text-slate-800">طلبات التعيين</h2>
      {!data?.length ? <p className="mt-2 text-xs text-slate-500">لا طلبات تعيين بعد.</p> : (
        <ul className="mt-2 divide-y divide-slate-100">
          {data.map((r) => {
            const st = HIRE_STATUS[r.status]
            return (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2" data-testid={`gp-hire-req-${r.id}`}>
                <div className="min-w-0">
                  <div className="font-black text-slate-800">{r.full_name} <span className="text-[11px] font-semibold text-slate-500">· {r.job_title}{r.department ? ` · ${r.department}` : ''}</span></div>
                  <div className="text-[11px] text-slate-500" dir="auto">مباشرة <span dir="ltr">{r.hire_date}</span> · {r.contract_type === 'daily' ? 'يومي' : 'شهري'}{r.shift_name ? ` · ${r.shift_name}` : ''}{r.employee_number ? ` · الرقم الوظيفي ${r.employee_number}` : ''}</div>
                  {r.status === 'pending' && r.current_step && <div className="mt-0.5 text-[11px] font-bold text-amber-800" data-testid={`gp-hire-req-step-${r.id}`}>عند: {r.current_step}</div>}
                  {r.status === 'rejected' && r.rejected_note && <div className="mt-0.5 text-[11px] font-bold text-red-700" data-testid={`gp-hire-req-reason-${r.id}`}>سبب الرفض: {r.rejected_note}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-black', st.cls)} data-testid={`gp-hire-req-status-${r.id}`}>{st.label}</span>
                  {r.status === 'pending' && <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)} className="h-8 rounded-lg border border-slate-300 px-2 text-[11px] font-bold text-slate-700 disabled:opacity-40" data-testid={`gp-hire-req-cancel-${r.id}`}>إلغاء</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {cancel.error && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700">{disclosureErrorMessage(cancel.error)}</p>}
    </section>
  )
}

function RecentHires() {
  const { data, isLoading, error } = useGarageRecentHires()
  if (isLoading) return <LoadingSpinner />
  if (error) return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{disclosureErrorMessage(error)}</p>
  if (!data?.length) return <EmptyState title="لا تعيينات خلال 180 يوماً" />
  const Dot = ({ ok, label }: { ok: boolean; label: string }) => <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-black', ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{ok ? '✓' : '○'} {label}</span>
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-sm" data-testid="gp-hires-table">
        <thead><tr className="border-b-2 border-[#0b3d6b] bg-slate-50 text-[11px] text-slate-500"><th className="px-3 py-2 text-right font-semibold">الموظف</th><th className="px-3 py-2 text-right font-semibold">المسمى</th><th className="px-3 py-2 text-center font-semibold">المباشرة</th><th className="px-3 py-2 text-center font-semibold">العقد</th><th className="px-3 py-2 text-right font-semibold">اكتمال الملف</th></tr></thead>
        <tbody>{data.map((h) => (
          <tr key={h.id} className="border-b border-slate-100 last:border-0" data-testid={`gp-hire-${h.employee_number}`}>
            <td className="px-3 py-2"><div className="font-black text-slate-800">{h.full_name}{h.is_driver && <span className="ms-2 rounded-md bg-[#0b3d6b]/10 px-1.5 py-0.5 text-[10px] font-black text-[#0b3d6b]">سائق</span>}</div><div className="text-[11px] text-slate-400" dir="ltr">{h.employee_number}</div></td>
            <td className="px-3 py-2 text-xs">{h.job_title ?? '—'}</td>
            <td className="px-3 py-2 text-center text-xs tabular-nums" dir="ltr">{h.hire_date}</td>
            <td className="px-3 py-2 text-center text-xs">{h.contract_type === 'daily' ? 'يومي' : 'شهري'}</td>
            <td className="px-3 py-2"><div className="flex flex-wrap gap-1"><Dot ok={h.has_biometric} label="بصمة (HR)" /><Dot ok={h.has_manager} label="مدير مباشر (HR)" /><Dot ok={h.salary_ready} label="راتب (المالية)" /></div></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

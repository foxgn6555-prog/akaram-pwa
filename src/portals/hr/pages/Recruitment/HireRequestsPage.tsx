/**
 * الموارد البشرية — «تعيينات معتمدة بانتظار الإكمال» (00348 — الجولة B)
 *   الطلبات القادمة من إجراءات الكراج/المحطة/الصيانة بعد اكتمال موافقاتها. الموارد البشرية تكتب الرقم الوظيفي يدوياً (مع فحص التكرار فوراً)
 *   وتُكمل البيانات بنموذج التوظيف نفسه؛ **عند الحفظ فقط يُنشأ الموظف** (ملف راتب بانتظار المالية، البصمة، إشعار مقدّم الطلب).
 *   المعلّق/المرفوض لا يظهر هنا للإكمال. تبويب «المكتملة» للمتابعة.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { ExecPageHeader, ExecTabBar } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { Button } from '@components/ui'
import { useEmployeeNumberAvailable, useHrHireRequests } from '@features/hr'
import type { HrHireRequest } from '@features/hr'
import { hrErrorMessage } from '@sdk/hr.sdk'
import { HireForm } from './Recruitment'

type Tab = 'approved' | 'completed'
const n = (v: number) => v.toLocaleString('en-US')
const dateAr = (v: string) => new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeZone: 'Asia/Baghdad' }).format(new Date(v))

export default function HireRequestsPage() {
  const [tab, setTab] = useState<Tab>('approved')
  const [active, setActive] = useState<HrHireRequest | null>(null)
  const approved = useHrHireRequests('approved')
  const completed = useHrHireRequests('completed')
  const waiting = approved.data ?? []
  const late = waiting.filter((r) => r.days_waiting >= 3).length
  if (active) return <CompleteRequest r={active} onBack={() => setActive(null)} />
  return (
    <div className="space-y-4 pb-4" data-testid="hr-hire-requests">
      <ExecPageHeader icon="user-plus" title="تعيينات معتمدة بانتظار الإكمال" subtitle="طلبات التعيين من الكراج/المحطة/الصيانة بعد اكتمال موافقاتها — اكتبوا الرقم الوظيفي يدوياً وأكملوا الملف؛ الموظف يُنشأ عند الحفظ فقط"
        stats={[{ label: 'بانتظار الإكمال', value: approved.isLoading ? '…' : n(waiting.length), tone: waiting.length ? 'gold' : 'green', testId: 'hr-hire-waiting' }, { label: 'متأخرة (3 أيام+)', value: approved.isLoading ? '…' : n(late), tone: late ? 'red' : 'plain' }, { label: 'مكتملة', value: completed.isLoading ? '…' : n((completed.data ?? []).length) }]} />
      <ExecTabBar value={tab} onChange={setTab} testId="hr-hire-tabs" tabs={[{ key: 'approved', label: 'بانتظار الإكمال', icon: 'user-plus', badge: waiting.length }, { key: 'completed', label: 'المكتملة', icon: 'check-square' }]} />
      {tab === 'approved' && <RequestsList q={approved} empty="لا طلبات تعيين معتمدة بانتظار الإكمال" onPick={setActive} />}
      {tab === 'completed' && <RequestsList q={completed} empty="لا طلبات مكتملة بعد" />}
    </div>
  )
}

function RequestsList({ q, empty, onPick }: { q: ReturnType<typeof useHrHireRequests>; empty: string; onPick?: (r: HrHireRequest) => void }) {
  if (q.isLoading) return <LoadingSpinner />
  if (q.error) return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{hrErrorMessage(q.error)}</p>
  if (!q.data?.length) return <EmptyState title={empty} />
  return (
    <ul className="space-y-2" data-testid="hr-hire-list">
      {q.data.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid={`hr-hire-req-${r.id}`}>
          <div className="min-w-0">
            <div className="font-black text-slate-800">{r.full_name} <span className="text-[11px] font-semibold text-slate-500">· {r.job_title}{r.department ? ` · ${r.department}` : ''}</span></div>
            <div className="text-[11px] text-slate-500">من {r.source_label} · طلبه {r.requester_name || '—'} · مباشرة <span dir="ltr">{r.hire_date}</span> · {r.contract_type === 'daily' ? 'يومي' : 'شهري'}{r.shift_name ? ` · ${r.shift_name}` : ''}{r.phone ? ` · ${r.phone}` : ''}</div>
            {r.status === 'approved' && r.decided_at && <div className={clsx('mt-0.5 text-[11px] font-bold', r.days_waiting >= 3 ? 'text-red-700' : 'text-amber-800')} data-testid={`hr-hire-wait-${r.id}`}>اعتُمد {dateAr(r.decided_at)} · بانتظار الإكمال منذ {n(r.days_waiting)} يوم</div>}
            {r.status === 'completed' && <div className="mt-0.5 text-[11px] font-bold text-emerald-700">نزل للنظام برقم <span dir="ltr">{r.employee_number}</span>{r.completed_at ? ` · ${dateAr(r.completed_at)}` : ''}</div>}
          </div>
          {onPick ? <Button size="sm" onClick={() => onPick(r)} data-testid={`hr-hire-complete-${r.id}`}>إكمال وكتابة الرقم الوظيفي</Button>
            : r.employee_id && <Link to={`/hr/employees/${r.employee_id}`} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-[#0b3d6b]" data-testid={`hr-hire-open-${r.id}`}>فتح ملف الموظف</Link>}
        </li>
      ))}
    </ul>
  )
}

/** الإكمال: نموذج التوظيف نفسه معبّأً من الطلب — الرقم الوظيفي يدوي مع فحص فوري */
function CompleteRequest({ r, onBack }: { r: HrHireRequest; onBack: () => void }) {
  return (
    <div className="space-y-4 pb-4" data-testid="hr-hire-complete">
      <ExecPageHeader icon="user-plus" title={`إكمال تعيين: ${r.full_name}`} subtitle={`${r.source_label} · ${r.job_title} · طلبه ${r.requester_name || '—'} — البيانات الأساسية معبّأة من الطلب؛ اكتبوا الرقم الوظيفي وأكملوا الباقي ثم احفظوا`}
        actions={<Button size="sm" variant="secondary" onClick={onBack} data-testid="hr-hire-back">رجوع للقائمة</Button>} />
      <NumberHint />
      <HireForm completeRequestId={r.id}
        initial={{ full_name: r.full_name, phone: r.phone ?? '', job_title_id: r.job_title_id, department_id: r.department_id ?? '', hire_date: r.hire_date, contract_type: r.contract_type, shift_id: r.shift_id ?? '' }} />
    </div>
  )
}

/** فحص الرقم الوظيفي قبل الحفظ (يدوي 100% — لا اقتراح تلقائي) */
function NumberHint() {
  const [num, setNum] = useState('')
  const check = useEmployeeNumberAvailable(num)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="hr-hire-number-check">
      <span className="font-black">فحص الرقم الوظيفي قبل الكتابة:</span>
      <input dir="ltr" className="h-9 w-40 rounded-xl border border-amber-300 bg-white px-2 text-sm" value={num} onChange={(e) => setNum(e.target.value)} placeholder="مثال: G-0125" data-testid="hr-hire-number-input" />
      {num.trim() && (check.isLoading ? <span>…</span> : check.data ? <span className="font-black text-emerald-700" data-testid="hr-hire-number-free">✓ متاح</span> : <span className="font-black text-red-700" data-testid="hr-hire-number-taken">✗ مستخدم لموظف آخر</span>)}
      <span className="text-[11px]">الرقم يُكتب يدوياً في حقل «الرقم الوظيفي» بالنموذج أدناه؛ المكرر يُرفض عند الحفظ أيضاً.</span>
    </div>
  )
}

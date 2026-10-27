/**
 * 00357 — «كتب الشكر والتنبيه» للمدير المفوض (actor="executive") ومعاونه (actor="deputy"):
 *   · كتب الشكر تصدر تلقائياً من وحدة المكافآت (نوع «كتاب شكر») — هنا تُعرض وتُطبع.
 *   · كتاب «تنبيه» أو «إنذار» يدوي: اختيار موظف + سبب ⇒ يصدر برقم رسمي سنوي باسم المدير المفوض، يُبلَّغ الموظف والمدير المباشر، ولا يُعدَّل.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { field } from '@portals/hr/components/hr-format'
import { useLetterIssueDisciplinary, useLettersList, useLettersYears } from '@features/hr/hooks/useHr'
import { LetterViewer } from '@features/letters/components/LetterViewer'
import { EmployeePicker } from '@portals/executive/pages/Treasury/ExecRewardsPage'
import type { EmployeeLookupRow } from '@sdk/treasury.sdk'

type Tab = 'admin_any' | 'thanks' | 'disciplinary_any'
const TABS: Array<[Tab, string]> = [['admin_any', 'الكل'], ['thanks', 'شكر وتقدير'], ['disciplinary_any', 'تنبيه / إنذار']]
const KIND_CLS: Record<string, string> = { thanks: 'bg-amber-100 text-amber-900', notice: 'bg-orange-100 text-orange-800', warning: 'bg-rose-100 text-rose-800' }
export default function ExecLettersPage({ actor = 'executive' }: { actor?: 'executive' | 'deputy' } = {}) {
  const [tab, setTab] = useState<Tab>('admin_any')
  const [year, setYear] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useLettersList(tab, year, q || null)
  const years = useLettersYears()
  const rows = list.data ?? []
  const nThanks = rows.filter((r) => r.kind === 'thanks').length, nNotice = rows.filter((r) => r.kind === 'notice').length, nWarn = rows.filter((r) => r.kind === 'warning').length
  return (
    <div className="space-y-4 pb-6" data-testid="exec-letters-page" data-actor={actor}>
      <ExecPageHeader icon="file-text" title="كتب الشكر والتنبيه" stats={[
        { label: 'شكر وتقدير', value: nThanks, tone: 'gold', testId: 'el-stat-thanks' },
        { label: 'تنبيه', value: nNotice, testId: 'el-stat-notice' },
        { label: 'إنذار', value: nWarn, tone: 'red', testId: 'el-stat-warning' },
      ]} subtitle="كتاب الشكر يصدر تلقائياً عند تسجيل مكافأة «كتاب شكر» · التنبيه والإنذار تصدرهما من هنا بسبب مكتوب · كل كتاب برقم رسمي سنوي باسم المدير المفوض، يُبلَّغ به الموظف والمدير المباشر ولا يُعدَّل بعد صدوره"
        actions={<HeaderButton onClick={() => setOpen(!open)} icon={open ? 'x' : 'alert-triangle'} testId="btn-new-disciplinary">{open ? 'إغلاق' : 'تنبيه / إنذار جديد'}</HeaderButton>} />

      {open && <DisciplinaryForm onDone={() => setOpen(false)} />}

      <div className="flex flex-wrap items-center gap-2" data-testid="el-filters">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" data-testid={`el-tab-${k}`} onClick={() => setTab(k)} className={clsx('h-9 rounded-full border px-4 text-xs font-bold', tab === k ? 'border-[#0b3d6b] bg-gradient-to-l from-[#0b3d6b] to-[#1d6fa5] text-white' : 'border-slate-200 bg-white text-slate-700')}>{l}</button>
        ))}
        <select className={clsx(field, 'w-28')} value={year ?? ''} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)} data-testid="el-year" aria-label="السنة">
          <option value="">كل السنوات</option>
          {(years.data ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input className={clsx(field, 'ms-auto max-w-xs')} placeholder="بحث بالعدد / الاسم / الرقم الوظيفي" value={q} onChange={(e) => setQ(e.target.value)} data-testid="el-search" />
      </div>

      {list.isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
        <EmptyState title="لا كتب هنا" hint="كتب الشكر تظهر تلقائياً من وحدة المكافآت، والتنبيه/الإنذار من زر «تنبيه / إنذار جديد»." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-xs" dir="rtl" data-testid="el-table">
            <thead className="bg-slate-50 text-[11px] text-slate-600"><tr>
              <th className="p-2">العدد</th><th className="p-2">التاريخ</th><th className="p-2">النوع</th><th className="p-2 text-right">الموظف</th><th className="p-2 text-right">الموضوع</th><th className="p-2">أصدره</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100" data-testid={`el-row-${r.letter_no}-${r.letter_year}`}>
                  <td className="p-2 text-center font-mono font-black text-[#0b3d6b]" dir="ltr">{r.ref}</td>
                  <td className="p-2 text-center font-mono">{r.issued_at.slice(0, 10)}</td>
                  <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', KIND_CLS[r.kind] ?? 'bg-sky-100 text-sky-800')}>{r.kind_label}</span></td>
                  <td className="p-2"><div className="font-bold text-slate-800">{r.full_name}</div><div className="text-[11px] text-slate-500">{r.employee_number ?? '—'} · {r.department_name ?? '—'}</div></td>
                  <td className="p-2">{r.subject}</td>
                  <td className="p-2 text-center text-[11px]">{r.issued_by_name ?? '—'}</td>
                  <td className="p-2 text-center"><Button size="sm" variant="secondary" onClick={() => setOpenId(r.id)} data-testid={`el-open-${r.letter_no}-${r.letter_year}`}>معاينة / PDF</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <LetterViewer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function DisciplinaryForm({ onDone }: { onDone: () => void }) {
  const issue = useLetterIssueDisciplinary()
  const [emp, setEmp] = useState<EmployeeLookupRow | null>(null)
  const [kind, setKind] = useState<'notice' | 'warning'>('notice')
  const [reason, setReason] = useState('')
  const valid = Boolean(emp) && reason.trim().length >= 5
  return (
    <form className="space-y-3 rounded-2xl border border-orange-200 bg-white p-4" data-testid="disciplinary-form"
      onSubmit={(e) => { e.preventDefault(); if (!valid || !emp) return; issue.mutate({ employeeId: emp.id, kind, reason: reason.trim() }, { onSuccess: () => { setEmp(null); setReason(''); onDone() } }) }}>
      <h2 className="text-sm font-black text-orange-900">كتاب تنبيه / إنذار جديد</h2>
      <label className="block text-xs font-semibold text-slate-600">الموظف<div className="mt-1"><EmployeePicker value={emp} onChange={setEmp} testId="dl-emp" /></div></label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setKind('notice')} data-testid="dl-kind-notice" className={clsx('h-11 rounded-xl border-2 text-sm font-bold', kind === 'notice' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-slate-200 bg-white text-slate-700')}>تنبيه</button>
        <button type="button" onClick={() => setKind('warning')} data-testid="dl-kind-warning" className={clsx('h-11 rounded-xl border-2 text-sm font-bold', kind === 'warning' ? 'border-rose-600 bg-rose-50 text-rose-900' : 'border-slate-200 bg-white text-slate-700')}>إنذار</button>
      </div>
      <label className="block text-xs font-semibold text-slate-600">السبب (يظهر نصاً في الكتاب)
        <textarea className={clsx(field, 'mt-1 h-24 py-2')} placeholder="مثال: التأخر المتكرر عن الدوام الصباحي رغم التنبيه الشفهي" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="dl-reason" />
      </label>
      <p className="text-[11px] text-slate-500">يصدر الكتاب فوراً برقم رسمي لا يُعدَّل، ويُبلَّغ الموظف والمدير المباشر. إن سبق للموظف تنبيه/إنذار يُذكر تسلسله في النص تلقائياً.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>إلغاء</Button>
        <Button type="submit" variant={kind === 'warning' ? 'danger' : 'primary'} size="sm" disabled={!valid || issue.isPending} data-testid="dl-submit">{kind === 'warning' ? 'إصدار الإنذار' : 'إصدار التنبيه'}</Button>
      </div>
    </form>
  )
}

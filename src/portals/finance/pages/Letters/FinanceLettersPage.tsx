/**
 * 00356 — «سجل الكتب الرسمية» في بوابة الشؤون المالية.
 *   الكتب تُولَّد تلقائياً (إنهاء خدمة بنوعه عند اكتمال الموافقات، وتصفية نهاية الخدمة عند اعتماد المالية) برقم سنوي متسلسل
 *   باسم المدير المفوض ولا تُعدَّل. هنا: بحث ومرشّحات (النوع/السنة)، معاينة بالتصميم الرسمي، طباعة/حفظ PDF. الأرقام إنكليزية.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { field } from '@portals/hr/components/hr-format'
import { useLettersList, useLettersYears } from '@features/hr/hooks/useHr'
import { LetterViewer } from '@features/letters/components/LetterViewer'
import { LETTER_KIND_LABELS } from '@features/letters/lib/letter-html'

type KindFilter = '' | 'termination_any' | 'settlement' | 'resignation_accept' | 'dismissal' | 'contract_end' | 'retirement' | 'death' | 'termination'
const KIND_CLS: Record<string, string> = { settlement: 'bg-emerald-100 text-emerald-800', dismissal: 'bg-rose-100 text-rose-800', death: 'bg-slate-200 text-slate-800' }

export default function FinanceLettersPage() {
  const [kind, setKind] = useState<KindFilter>('')
  const [year, setYear] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useLettersList(kind || null, year, q || null)
  const years = useLettersYears()
  const rows = list.data ?? []
  const nTerm = rows.filter((r) => r.kind !== 'settlement').length, nSet = rows.length - nTerm
  return (
    <div className="space-y-4 pb-6" data-testid="fin-letters">
      <ExecPageHeader icon="file-text" title="سجل الكتب الرسمية" stats={[
        { label: 'كتب معروضة', value: rows.length, testId: 'lt-stat-total' },
        { label: 'كتب إنهاء خدمة', value: nTerm, tone: 'gold', testId: 'lt-stat-term' },
        { label: 'كتب تصفية', value: nSet, tone: 'green', testId: 'lt-stat-set' },
      ]} subtitle={<>تُصدر الكتب تلقائياً برقم تسلسلي سنوي باسم المدير المفوض عند اكتمال الإجراء (إنهاء الخدمة بنوعه، ثم كتاب التصفية عند اعتماد المالية) ولا تُعدَّل بعد صدورها. افتح أي كتاب للمعاينة بالتصميم الرسمي ثم «طباعة / حفظ PDF».</>} />

      <div className="flex flex-wrap items-center gap-2" data-testid="lt-filters">
        {([['', 'الكل'], ['termination_any', 'إنهاء الخدمة'], ['settlement', 'التصفية']] as const).map(([k, l]) => (
          <button key={k} type="button" data-testid={`lt-tab-${k || 'all'}`} onClick={() => setKind(k)} className={clsx('h-9 rounded-full border px-4 text-xs font-bold', kind === k ? 'border-[#0b3d6b] bg-gradient-to-l from-[#0b3d6b] to-[#1d6fa5] text-white' : 'border-slate-200 bg-white text-slate-700')}>{l}</button>
        ))}
        <select className={clsx(field, 'w-40')} value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} data-testid="lt-kind" aria-label="نوع الكتاب">
          <option value="">كل الأنواع</option>
          {Object.entries(LETTER_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className={clsx(field, 'w-28')} value={year ?? ''} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)} data-testid="lt-year" aria-label="السنة">
          <option value="">كل السنوات</option>
          {(years.data ?? []).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <input className={clsx(field, 'ms-auto max-w-xs')} placeholder="بحث بالعدد / الاسم / الرقم الوظيفي / الموضوع" value={q} onChange={(e) => setQ(e.target.value)} data-testid="lt-search" />
      </div>

      {list.isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
        <EmptyState title="لا كتب هنا" hint="تظهر الكتب تلقائياً عند تنفيذ إنهاء خدمة أي موظف وعند اعتماد تصفيته." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-xs" dir="rtl" data-testid="lt-table">
            <thead className="bg-slate-50 text-[11px] text-slate-600"><tr>
              <th className="p-2">العدد</th><th className="p-2">التاريخ</th><th className="p-2">نوع الكتاب</th><th className="p-2 text-right">الموضوع</th><th className="p-2 text-right">الموظف</th><th className="p-2">التوقيع</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100" data-testid={`lt-row-${r.letter_no}-${r.letter_year}`}>
                  <td className="p-2 text-center font-mono font-black text-[#0b3d6b]" dir="ltr">{r.ref}</td>
                  <td className="p-2 text-center font-mono">{r.issued_at.slice(0, 10)}</td>
                  <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', KIND_CLS[r.kind] ?? 'bg-sky-100 text-sky-800')}>{r.kind_label}</span></td>
                  <td className="p-2 font-bold text-slate-800">{r.subject}</td>
                  <td className="p-2"><div>{r.full_name}</div><div className="text-[11px] text-slate-500">{r.employee_number ?? '—'} · {r.department_name ?? '—'}</div></td>
                  <td className="p-2 text-center text-[11px]">{r.signer_name ?? 'المدير المفوض'}</td>
                  <td className="p-2 text-center"><Button size="sm" variant="secondary" onClick={() => setOpenId(r.id)} data-testid={`lt-open-${r.letter_no}-${r.letter_year}`}>معاينة / PDF</Button></td>
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

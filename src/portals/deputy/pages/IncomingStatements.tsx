/**
 * وارد معاون المدير المفوض — الكشوفات المرفوعة من وحدة الكشوفات.
 * يعرض الكشوفات بحالة submitted_to_deputy مع إمكانية المعاينة/الطباعة.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useDisclosureList } from '@features/disclosures'
import { VIOLATION_LABELS, PENALTY_LABELS } from '@features/disclosures/types'
import { printDisclosure } from '@features/disclosures/lib/export'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

const TONE: Record<string, string> = {
  delay: 'bg-amber-50 text-amber-700',
  absence: 'bg-red-50 text-red-700',
  collection: 'bg-purple-50 text-purple-700',
  evasion: 'bg-sky-50 text-sky-700',
}

export default function IncomingStatements() {
  const list = useDisclosureList()
  const [tab, setTab] = useState<'incoming' | 'all'>('incoming')

  const rows = useMemo(() => {
    const all = list.data ?? []
    return tab === 'incoming' ? all.filter((d) => d.status === 'submitted_to_deputy') : all
  }, [list.data, tab])
  const incomingCount = useMemo(
    () => (list.data ?? []).filter((d) => d.status === 'submitted_to_deputy').length,
    [list.data],
  )

  return (
    <div className="space-y-5" data-testid="deputy-statements">
      <div>
        <h1 className="text-lg font-bold text-slate-800">وارد الكشوفات التأديبية</h1>
        <p className="text-sm text-slate-500">الكشوفات المرفوعة من وحدة الكشوفات للاعتماد</p>
      </div>

      <div className="flex gap-2">
        <TabBtn active={tab === 'incoming'} onClick={() => setTab('incoming')}
          label={`للاعتماد (${incomingCount})`} testId="tab-incoming" />
        <TabBtn active={tab === 'all'} onClick={() => setTab('all')}
          label={`كل الكشوفات (${list.data?.length ?? 0})`} testId="tab-all" />
      </div>

      {list.isLoading ? (
        <div className="p-8"><LoadingSpinner label="جارٍ جلب الوارد…" /></div>
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد كشوفات واردة" hint="ما ترفعه وحدة الكشوفات سيظهر هنا" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="incoming-list">
          {rows.map((d) => (
            <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', TONE[d.violation_type])}>
                  {VIOLATION_LABELS[d.violation_type]}
                </span>
                {d.penalty_type && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                    {PENALTY_LABELS[d.penalty_type]}
                  </span>
                )}
                {d.status === 'submitted_to_deputy' && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    بانتظار الاعتماد
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-bold text-slate-800">{d.driver_name}</p>
              <p className="text-xs text-slate-500">
                DB: <span dir="ltr">{d.db_number}</span> · {d.log_date}
              </p>
              <p className="mt-2 line-clamp-3 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                {d.details}
              </p>
              <div className="mt-3 flex gap-1.5">
                <button
                  onClick={() => printDisclosure(d)}
                  data-testid={`print-${d.id}`}
                  className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                >
                  <Icon name="printer" size={14} /> معاينة/طباعة
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabBtn({
  active, onClick, label, testId,
}: { active: boolean; onClick: () => void; label: string; testId: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={clsx(
        'flex h-10 items-center rounded-xl px-4 text-sm font-bold transition-colors',
        active ? 'bg-brand-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  )
}

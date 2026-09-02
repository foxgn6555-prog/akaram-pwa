/**
 * حضورية العمال — تسجيل حاضر/غائب لعمال قواطع المسؤول بتاريخ محدد.
 * البيانات تُحفظ ولا تُرسل إلى شؤون الموظفين في هذه المرحلة.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useWorkers, useAttendanceByDate, useSetAttendance } from '@features/sector'
import { useSectors, useManagerProfile } from '@features/sector'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

function localToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AttendancePage() {
  const [date, setDate] = useState(localToday())
  const [sectorId, setSectorId] = useState<number | 'all'>('all')
  const workers = useWorkers(true)
  const profile = useManagerProfile()
  const sectors = useSectors()
  const att = useAttendanceByDate(date)
  const setAtt = useSetAttendance()

  // رقم اليوم حسب الشفت: الشفت الحالي لمدير القطاع
  const shift = profile.data?.shift ?? 'morning'

  const byWorker = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const a of att.data ?? []) map.set(a.worker_id, a.is_present)
    return map
  }, [att.data])

  const list = (workers.data ?? []).filter(
    (w) => sectorId === 'all' || w.sector_id === sectorId,
  )

  const present = [...byWorker.entries()].filter(([, p]) => p).length
  const absent = [...byWorker.entries()].filter(([, p]) => !p).length

  const mySectorIds = profile.data?.sectors ?? []
  const sectorOpts = (sectors.data ?? []).filter((s) => mySectorIds.includes(s.id))

  return (
    <div className="space-y-5" data-testid="attendance-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">حضورية العمال</h1>
        <p className="text-sm text-slate-500">حدّد حاضر / غائب لعمال قواطعك — تُحفظ في النظام (لا تُرسل لشؤون الموظفين حالياً)</p>
      </div>

      {/* أدوات */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-medium text-slate-600">
          التاريخ
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            data-testid="att-date"
            className="mt-1 block h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500" />
        </label>
        <label className="text-xs font-medium text-slate-600">
          القاطع
          <select value={sectorId} onChange={(e) => setSectorId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            data-testid="att-sector"
            className="mt-1 block h-10 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500">
            <option value="all">كل القواطع</option>
            {sectorOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="ms-auto flex gap-3 text-xs">
          <span className="rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700" data-testid="att-present-count">
            حاضر {present}
          </span>
          <span className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-600" data-testid="att-absent-count">
            غائب {absent}
          </span>
        </div>
      </div>

      {/* القائمة */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {workers.isLoading || att.isLoading ? (
          <LoadingSpinner label="جارٍ الجلب…" />
        ) : list.length === 0 ? (
          <EmptyState title="لا يوجد عمال" hint="أضِف العمال من صفحة «فريقي»" />
        ) : (
          <div className="divide-y divide-slate-50" data-testid="att-list">
            {list.map((w) => {
              const status = byWorker.get(w.id)
              const pending = setAtt.isPending
              const secName = sectors.data?.find((s) => s.id === w.sector_id)?.name ?? `قاطع ${w.sector_id}`
              return (
                <div key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Icon name="user" size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-slate-800">{w.full_name}</div>
                    <div className="text-[11px] text-slate-500">{secName}{w.job_title ? ` · ${w.job_title}` : ''}</div>
                  </div>
                  <div className="flex rounded-xl border border-slate-200 p-1" data-testid={`att-toggle-${w.id}`}>
                    <MarkBtn active={status === true} disabled={pending} color="emerald"
                      onClick={() => setAtt.mutate({ worker_id: w.id, worker_name: w.full_name, sector_id: w.sector_id, shift, log_date: date, is_present: true })}>
                      <Icon name="check" size={15} /> حاضر
                    </MarkBtn>
                    <MarkBtn active={status === false} disabled={pending} color="red"
                      onClick={() => setAtt.mutate({ worker_id: w.id, worker_name: w.full_name, sector_id: w.sector_id, shift, log_date: date, is_present: false })}>
                      <Icon name="x" size={15} /> غائب
                    </MarkBtn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MarkBtn({ active, disabled, color, onClick, children }: {
  active: boolean; disabled: boolean; color: 'emerald' | 'red'
  onClick: () => void; children: React.ReactNode
}) {
  const colors = {
    emerald: active ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50',
    red: active ? 'bg-red-500 text-white' : 'text-red-600 hover:bg-red-50',
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={clsx('flex h-9 items-center gap-1 rounded-lg px-4 text-sm font-bold transition-colors disabled:opacity-50', colors[color])}>
      {children}
    </button>
  )
}

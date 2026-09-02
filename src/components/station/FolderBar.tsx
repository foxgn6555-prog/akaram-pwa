/** شريط نظام الفولدر الشهري — اختيار الشهر + العدّادات + إرسال لمعاون المدير */
import clsx from 'clsx'
import type { SaksatRecord } from '@features/transfer-station/types'
import { Icon } from '@components/ui/Icon/Icon'
import { monthLabel, type StationUnitKind } from './station.utils'

export function FolderBar({
  kind, records, month, onMonthChange, onSend,
}: {
  kind: StationUnitKind
  records: SaksatRecord[]
  month: string
  onMonthChange: (m: string) => void
  onSend: (month: string) => void
}) {
  const sent = records.filter((r) => r.status === 'submitted_to_deputy').length
  const drafts = records.length - sent

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Icon name="folder" size={16} className="text-brand-600" />
          <span className="text-sm font-bold text-slate-700">فولدر الشهر</span>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          data-testid={`folder-${kind}-month`}
          className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
        />
        <span className="text-xs text-slate-500">
          {monthLabel(month)} — {records.length} سجل
        </span>
        <div className="ms-auto flex items-center gap-2">
          <span
            className={clsx(
              'rounded-full px-2.5 py-1 text-[11px] font-bold',
              drafts > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500',
            )}
          >
            {drafts} مسودة
          </span>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
            {sent} مُرسل
          </span>
          <button
            type="button"
            disabled={drafts === 0}
            onClick={() => onSend(month)}
            data-testid={`folder-${kind}-send`}
            className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <Icon name="send" size={15} />
            إرسال الفولدر للمعاون
          </button>
        </div>
      </div>
    </div>
  )
}
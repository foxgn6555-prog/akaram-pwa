/**
 * أرشيف الكشوفات — المؤرشف (المنقول لأرشيف IT) مع سبب الأرشفة.
 * الاستعادة تتم من بوابة التطوير المركزية (IT).
 */
import { useArchivedDisclosures } from '@features/disclosures'
import { VIOLATION_LABELS, PENALTY_LABELS } from '@features/disclosures/types'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function DisclosuresArchivePage() {
  const archived = useArchivedDisclosures()
  const data = archived.data ?? []

  return (
    <div className="space-y-5" data-testid="disc-archive-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">أرشيف الكشوفات</h1>
        <p className="text-sm text-slate-500">
          الكشوفات المحذوفة تُنقل للأرشيف المركزي (IT) مع التنبيه — ويمكن استعادتها من هناك.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Icon name="archive-box" size={16} className="text-slate-500" />
          <h2 className="text-sm font-bold text-slate-700">المؤرشف ({data.length})</h2>
        </div>
        {archived.isLoading ? (
          <div className="p-8"><LoadingSpinner label="جارٍ الجلب…" /></div>
        ) : data.length === 0 ? (
          <div className="p-4">
            <EmptyState title="لا توجد كشوفات مؤرشفة" hint="الكشوفات المحذوفة من قائمة الكشوفات تظهر هنا" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[720px]" data-testid="archived-table">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">السائق</th>
                  <th className="px-3 py-2.5 font-semibold">DB</th>
                  <th className="px-3 py-2.5 font-semibold">المخالفة</th>
                  <th className="px-3 py-2.5 font-semibold">الإجراء</th>
                  <th className="px-3 py-2.5 font-semibold">سبب الأرشفة</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id} className="border-t border-slate-50 text-slate-600">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{d.driver_name}</td>
                    <td className="px-3 py-2.5 dir-ltr">{d.db_number}</td>
                    <td className="px-3 py-2.5">{VIOLATION_LABELS[d.violation_type]}</td>
                    <td className="px-3 py-2.5">{d.penalty_type ? PENALTY_LABELS[d.penalty_type] : '—'}</td>
                    <td className="px-3 py-2.5 text-red-600/80">{d.archive_reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

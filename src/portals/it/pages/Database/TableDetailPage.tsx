import { useNavigate, useParams } from 'react-router'
import { useTableDetails } from '@features/system'
import { formatFileSize } from '@lib/utils/file.utils'
import { formatNumber as fmtNum } from '@lib/utils/format.utils'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

/** وحدة قاعدة البيانات — تفاصيل جدول: الأعمدة والأنواع والحجم (RPC آمنة 00020) */
export default function TableDetailPage() {
  const { tableName } = useParams<{ tableName: string }>()
  const navigate = useNavigate()
  const { data: details, isLoading, isError } = useTableDetails(tableName)

  if (isLoading) return <LoadingSpinner label={`جارٍ قراءة بنية ${tableName}…`} />

  if (isError || !details) {
    return <EmptyState title="تعذر قراءة الجدول" hint="قد يكون الاسم غير صحيح أو صلاحيتك غير كافية" />
  }

  const nullableCount = details.columns.filter((c) => c.nullable).length

  return (
    <section aria-labelledby="table-title" className="space-y-4">
      <button
        onClick={() => navigate('/it/database')}
        className="flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
      >
        <Icon name="chevron-right" size={15} /> عودة للقاعدة
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="table-title" className="text-lg font-bold" dir="ltr">{details.table}</h1>
          <p className="text-sm text-slate-500">
            {details.columns.length} عموداً · {nullableCount} يقبل الفراغ
          </p>
        </div>
        <div className="flex gap-3">
          <MiniStat label="الصفوف (تقديري)" value={`≈ ${fmtNum(details.row_estimate)}`} />
          <MiniStat label="الحجم" value={formatFileSize(details.total_bytes)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm" data-testid="columns-table">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
              <th className="px-4 py-3 text-start font-semibold">#</th>
              <th className="px-4 py-3 text-start font-semibold">العمود</th>
              <th className="px-4 py-3 text-start font-semibold">النوع</th>
              <th className="px-4 py-3 text-start font-semibold">يقبل الفراغ؟</th>
            </tr>
          </thead>
          <tbody>
            {details.columns.map((col, i) => (
              <tr key={col.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-xs text-slate-400">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium" dir="ltr">{col.name}</td>
                <td className="px-4 py-2.5" dir="ltr">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{col.type}</span>
                </td>
                <td className="px-4 py-2.5">
                  {col.nullable
                    ? <span className="text-xs text-slate-400">نعم</span>
                    : <span className="text-xs font-semibold text-emerald-600">إلزامي</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center shadow-sm">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

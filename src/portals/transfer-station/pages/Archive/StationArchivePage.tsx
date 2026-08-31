/**
 * وحدة الأرشيف — المحطة التحويلية:
 *  · تعرض سجلات الأوزان المؤرشفة (التي نُقلت لأرشيف IT)
 *  · الحذف من قائمة المحطة (سجل نشط) يطلب سبباً ويحذّر:
 *    «سيُنبَّه فريق التطوير المركزية، وسيُنقل الملف لأرشيف IT ويمكن استعادته منه».
 * هنا نعرض السجلات النشطة في وحدة الأوزان؛ هذه الصفحة تعرض المؤرشف لمراجعته محلياً.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useArchivedWeights, useWeightList, useArchiveWeight } from '@features/transfer-station'
import { archiveReasonSchema } from '@features/transfer-station/schemas/weight.schema'
import type { WeightRecord } from '@features/transfer-station/types'
import { netOf } from '@features/transfer-station/lib/export'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function StationArchivePage() {
  // النشط (لحذف/أرشفة سجل) والمؤرشف (للعرض)
  const active = useWeightList()
  const archived = useArchivedWeights()
  const archive = useArchiveWeight()

  const [target, setTarget] = useState<WeightRecord | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const archivedRecords = archived.data ?? []

  const filteredActive = useMemo(() => {
    const activeRecords = active.data ?? []
    const q = search.trim()
    if (!q) return activeRecords
    return activeRecords.filter(
      (r) => r.db_number.includes(q) || r.driver_name.includes(q),
    )
  }, [active.data, search])

  const confirm = (): void => {
    if (!target) return
    const parsed = archiveReasonSchema.safeParse({ reason })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'السبب غير صالح')
      return
    }
    archive.mutate(
      { id: target.id, reason: parsed.data.reason },
      {
        onSuccess: () => {
          setTarget(null)
          setReason('')
          setError('')
        },
      },
    )
  }

  return (
    <div className="space-y-5" data-testid="station-archive-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">أرشيف المحطة التحويلية</h1>
        <p className="text-sm text-slate-500">
          سجلات الأوزان — والحذف ينقل السجل إلى الأرشيف المركزي (IT) ويُنبّه فريق التطوير.
        </p>
      </div>

      {/* السجلات النشطة مع إمكانية الأرشفة */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Icon name="list" size={16} className="text-brand-600" />
            السجلات الحالية ({active.data?.length ?? 0})
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بـ DB أو السائق…"
            data-testid="archive-search"
            className="h-9 w-44 min-w-0 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-brand-400 sm:w-56"
          />
        </div>

        {active.isLoading ? (
          <div className="p-8"><LoadingSpinner label="جارٍ الجلب…" /></div>
        ) : filteredActive.length === 0 ? (
          <div className="p-4"><EmptyState title="لا توجد سجلات حالية" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[720px]" data-testid="active-weights-table">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">DB</th>
                  <th className="px-3 py-2.5 font-semibold">السائق</th>
                  <th className="px-3 py-2.5 font-semibold">التاريخ</th>
                  <th className="px-3 py-2.5 font-semibold">الصافي</th>
                  <th className="px-3 py-2.5 font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredActive.map((r) => (
                  <tr key={r.id} className="border-t border-slate-50">
                    <td className="px-3 py-2.5 font-medium dir-ltr">{r.db_number}</td>
                    <td className="px-3 py-2.5">{r.driver_name}</td>
                    <td className="px-3 py-2.5 text-slate-500 dir-ltr">{r.log_date}</td>
                    <td className="px-3 py-2.5 font-bold text-brand-700 dir-ltr">{netOf(r) ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => { setTarget(r); setReason(''); setError('') }}
                        data-testid={`delete-${r.id}`}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Icon name="trash" size={14} />
                        حذف/أرشفة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* السجلات المؤرشفة (منقولة لـ IT) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Icon name="archive-box" size={16} className="text-slate-500" />
          <h2 className="text-sm font-bold text-slate-700">
            المؤرشف (في الأرشيف المركزي IT — {archivedRecords.length})
          </h2>
        </div>
        {archived.isLoading ? (
          <div className="p-8"><LoadingSpinner label="جارٍ الجلب…" /></div>
        ) : archivedRecords.length === 0 ? (
          <div className="p-4">
            <EmptyState title="لا توجد سجلات مؤرشفة" hint="السجلات المحذوفة ستظهر هنا وتُنقل لأرشيف IT" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[720px]" data-testid="archived-weights-table">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">DB</th>
                  <th className="px-3 py-2.5 font-semibold">السائق</th>
                  <th className="px-3 py-2.5 font-semibold">التاريخ</th>
                  <th className="px-3 py-2.5 font-semibold">سبب الأرشفة</th>
                </tr>
              </thead>
              <tbody>
                {archivedRecords.map((r) => (
                  <tr key={r.id} className="border-t border-slate-50 text-slate-500">
                    <td className="px-3 py-2.5 font-medium dir-ltr">{r.db_number}</td>
                    <td className="px-3 py-2.5">{r.driver_name}</td>
                    <td className="px-3 py-2.5 dir-ltr">{r.log_date}</td>
                    <td className="px-3 py-2.5 text-red-600/80">{r.archive_reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ورقة سفلية: تأكيد الحذف/الأرشفة ── */}
      {target && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="archive-confirm"
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/50 p-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4"
          onClick={() => !archive.isPending && setTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-xl sm:rounded-2xl sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Icon name="alert-triangle" size={22} />
              </span>
              <div>
                <h3 className="font-bold text-slate-800">تأكيد حذف السجل</h3>
                <p className="text-xs text-slate-500">
                  {target.db_number} · {target.driver_name}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              ⚠️ لن يُحذف الملف نهائياً. سيُنقَل إلى <b>الأرشيف المركزي لبوابة التطوير المركزية (IT)</b>
              ويُنبَّه فريق التطوير بهذا الحذف، ويمكنهم <b>إعادته</b> للمحطة عند الحاجة.
            </div>

            <label className="mb-1 block text-xs font-bold text-slate-600">
              سبب الحذف <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError('') }}
              rows={3}
              autoFocus
              data-testid="archive-reason"
              placeholder="اكتب سبب الحذف/الأرشفة بوضوح…"
              className={clsx(
                'w-full rounded-xl border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-red-200',
                error ? 'border-red-400' : 'border-slate-300',
              )}
            />
            {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}

            <div className="mt-4 flex gap-3">
              <button
                onClick={confirm}
                disabled={archive.isPending}
                data-testid="archive-confirm-btn"
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {archive.isPending ? <LoadingSpinner label="" /> : <Icon name="archive-box" size={16} />}
                تأكيد الحذف والأرشفة
              </button>
              <button
                onClick={() => setTarget(null)}
                disabled={archive.isPending}
                className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

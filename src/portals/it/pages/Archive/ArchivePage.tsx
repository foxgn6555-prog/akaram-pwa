import { useState, useMemo } from 'react'
import { useArchiveCounts, useArchivedTable, useRestore } from '@features/archive'
import { useArchivedWeights, useRestoreWeight } from '@features/transfer-station'
import { netOf } from '@features/transfer-station/lib/export'
import { useArchivedDisclosures, useRestoreDisclosure } from '@features/disclosures'
import { VIOLATION_LABELS, PENALTY_LABELS } from '@features/disclosures/types'
import type { IconName } from '@components/ui/Icon/Icon'
import { formatRelative } from '@lib/utils/date.utils'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { useComplaintArchiveFolders, useComplaintDeletionRequests, useDecideComplaintDeletion, useRetryComplaintDeletion } from '@features/complaints'
import { useAuth } from '@features/auth'
import { ComplaintDeletionQueue } from './ComplaintDeletionQueue'

/**
 * 🗄️ وحدة الأرشيف — كل شيء يذهب لمكانه المخصص:
 *  · المحذوفات من كل الجداول (موظفون · فروع · أجهزة · شاحنات · بوابات)
 *  · استعادة بنقرة (تحقق IT)
 *  · عدادات حية لكل جدول
 * الفلسفة: لا حذف فعلي — كل شيء أرشفة موثقة بالسبب والزمان والمُنفّذ.
 */
const TABLE_LABELS: Record<string, string> = {
  employees: 'الموظفون',
  departments: 'الأقسام',
  branches: 'الفروع',
  biometric_devices: 'أجهزة البصمة',
  vehicles: 'الشاحنات',
  dynamic_portals: 'البوابات الديناميكية',
  app_errors: 'أخطاء مغلقة',
}

const TABLE_ICONS: Record<string, IconName> = {
  employees: 'users',
  departments: 'folder',
  branches: 'layout-grid',
  biometric_devices: 'fingerprint',
  vehicles: 'truck',
  dynamic_portals: 'layout-grid',
  app_errors: 'alert-triangle',
}

export default function ArchivePage() {
  const { data: session } = useAuth()
  const { data: complaintRequests = [] } = useComplaintDeletionRequests()
  const { data: complaintFolders = [] } = useComplaintArchiveFolders()
  const decideComplaintDeletion = useDecideComplaintDeletion()
  const retryComplaintDeletion = useRetryComplaintDeletion()
  const isSuperAdmin = session?.roles.includes('super_admin') ?? false
  const { data: counts, isLoading: cLoading } = useArchiveCounts()
  const [activeTable, setActiveTable] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { data: records, isLoading: rLoading } = useArchivedTable(activeTable ?? undefined)
  const restore = useRestore()

  // أرشيف سجلات أوزان المحطة التحويلية (قابل للاستعادة للمحطة)
  const { data: stationWeights, isLoading: wLoading } = useArchivedWeights()
  const restoreWeight = useRestoreWeight()

  // أرشيف كشوفات وحدة الكشوفات (قابل للاستعادة)
  const { data: discList, isLoading: dLoading } = useArchivedDisclosures()
  const restoreDisclosure = useRestoreDisclosure()

  const totalArchived = (counts ?? []).reduce((sum, c) => sum + c.count, 0)

  // بحث محلي على السجلات المعروضة
  const filteredRecords = useMemo(() => {
    if (!records || !search.trim()) return records
    const q = search.trim().toLowerCase()
    return records.filter((r) =>
      (r.name ?? '').toLowerCase().includes(q)
      || (r.employee_number ?? '').toLowerCase().includes(q)
      || (r.code ?? '').toLowerCase().includes(q)
      || (r.archive_reason ?? '').toLowerCase().includes(q)
    )
  }, [records, search])

  return (
    <section aria-labelledby="archive-title" className="space-y-4">
      <div>
        <h1 id="archive-title" className="flex items-center gap-2 text-lg font-bold">
          <Icon name="database" size={20} className="text-brand-600" />
          الأرشيف الهندسي
        </h1>
        <p className="text-sm text-slate-500">
          لا حذف فعلي — كل سجل محذوف يُحفظ هنا مع سببه وزمانه ومُنفّذه، قابل للاستعادة بنقرة
        </p>
      </div>

      <ComplaintDeletionQueue
        requests={complaintRequests}
        folders={complaintFolders}
        isSuperAdmin={isSuperAdmin}
        busy={decideComplaintDeletion.isPending || retryComplaintDeletion.isPending}
        onDecide={(requestId, approved) => decideComplaintDeletion.mutate({ requestId, approved, note: approved ? 'موافقة مدير النظام' : 'مرفوض من مدير النظام' })}
        onRetry={(requestId) => retryComplaintDeletion.mutate({ requestId, note: 'إعادة محاولة موقعة من مدير النظام' })}
      />

      {/* ═══ سجلات أوزان المحطة التحويلية — أرشيف قابل للاستعادة ═══ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="station-weights-archive">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Icon name="scale" size={15} className="text-brand-600" />
            أرشيف المحطة التحويلية — سجلات الأوزان
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {stationWeights?.length ?? 0}
            </span>
          </h2>
        </div>
        {wLoading ? (
          <LoadingSpinner label="جارٍ جلب سجلات المحطة…" />
        ) : stationWeights && stationWeights.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[760px]" data-testid="station-weights-table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-start font-semibold">DB</th>
                  <th className="px-4 py-2.5 text-start font-semibold">السائق</th>
                  <th className="px-4 py-2.5 text-start font-semibold">التاريخ</th>
                  <th className="px-4 py-2.5 text-start font-semibold">الصافي</th>
                  <th className="px-4 py-2.5 text-start font-semibold">سبب الأرشفة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">أُرشف</th>
                  <th className="px-4 py-2.5 text-start font-semibold">استعادة</th>
                </tr>
              </thead>
              <tbody>
                {stationWeights.map((w) => (
                  <tr key={w.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium dir-ltr">{w.db_number}</td>
                    <td className="px-4 py-2.5">{w.driver_name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 dir-ltr">{w.log_date}</td>
                    <td className="px-4 py-2.5 font-bold text-brand-700 dir-ltr">{netOf(w) ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-red-600/80">
                      {w.archive_reason ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {w.archived_at ? formatRelative(w.archived_at) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => restoreWeight.mutate(w.id)}
                        disabled={restoreWeight.isPending}
                        data-testid={`restore-weight-${w.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <Icon name="refresh" size={13} />
                        إعادة للمحطة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="لا توجد سجلات أوزان مؤرشفة من المحطة" hint="عند حذف سجل من المحطة يظهر هنا ويمكن إعادته" />
        )}
      </div>

      {/* ═══ أرشيف كشوفات وحدة الكشوفات ═══ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="disclosures-archive">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Icon name="file-text" size={15} className="text-brand-600" />
            أرشيف وحدة الكشوفات — الكشوفات التأديبية
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {discList?.length ?? 0}
            </span>
          </h2>
        </div>
        {dLoading ? (
          <LoadingSpinner label="جارٍ جلب الكشوفات…" />
        ) : discList && discList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm sm:min-w-[760px]" data-testid="disclosures-table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-start font-semibold">السائق</th>
                  <th className="px-4 py-2.5 text-start font-semibold">المخالفة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">الإجراء</th>
                  <th className="px-4 py-2.5 text-start font-semibold">سبب الأرشفة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">استعادة</th>
                </tr>
              </thead>
              <tbody>
                {discList.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium">{d.driver_name}</td>
                    <td className="px-4 py-2.5">{VIOLATION_LABELS[d.violation_type]}</td>
                    <td className="px-4 py-2.5">{d.penalty_type ? PENALTY_LABELS[d.penalty_type] : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-red-600/80">
                      {d.archive_reason ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => restoreDisclosure.mutate(d.id)}
                        disabled={restoreDisclosure.isPending}
                        data-testid={`restore-disc-${d.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <Icon name="refresh" size={13} />
                        إعادة للوحدة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="لا توجد كشوفات مؤرشفة" hint="كشوفات وحدة الكشوفات المحذوفة تظهر هنا" />
        )}
      </div>

      {/* العدادات */}
      {cLoading ? (
        <LoadingSpinner label="جارٍ العد…" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="archive-counts">
          {(counts ?? []).map((c) => (
            <button
              key={c.table}
              onClick={() => setActiveTable(c.table)}
              data-testid={`archive-tab-${c.table}`}
              className={clsx(
                'flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all',
                activeTable === c.table
                  ? 'border-brand-300 bg-brand-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <Icon name={TABLE_ICONS[c.table] ?? 'database'} size={18}
                    className={c.count > 0 ? 'text-brand-600' : 'text-slate-300'} />
              <span className="text-lg font-bold">{c.count}</span>
              <span className="text-[10px] text-slate-500">{TABLE_LABELS[c.table] ?? c.table}</span>
            </button>
          ))}
          {totalArchived === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4 text-center">
              <p className="text-sm text-emerald-700">✓ الأرشيف فارغ — لم تؤرشف أي بيانات بعد</p>
              <p className="mt-1 text-xs text-slate-500">
                عند حذف أي موظف أو فرع أو جهاز سيظهر هنا تلقائياً مع سبب الحذف
              </p>
            </div>
          )}
        </div>
      )}

      {/* محتوى الجدول المختار */}
      {activeTable && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Icon name={TABLE_ICONS[activeTable] ?? 'database'} size={15} />
              {TABLE_LABELS[activeTable]} — المؤرشف
            </h2>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في السجلات…"
                data-testid="archive-search"
                className="h-8 w-32 min-w-0 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-brand-400 sm:w-44"
              />
              <button onClick={() => { setActiveTable(null); setSearch('') }}
                      className="text-xs text-slate-400 hover:text-slate-600">
                إغلاق
              </button>
            </div>
          </div>

          {rLoading ? (
            <LoadingSpinner label="جارٍ جلب السجلات…" />
          ) : filteredRecords && filteredRecords.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-0 sm:min-w-[640px] text-sm" data-testid="archive-table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-start font-semibold">الاسم</th>
                  <th className="px-4 py-2.5 text-start font-semibold">سبب الأرشفة</th>
                  <th className="px-4 py-2.5 text-start font-semibold">أُرشف</th>
                  <th className="px-4 py-2.5 text-start font-semibold">استعادة</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec: NonNullable<ReturnType<typeof useArchivedTable>["data"]>[number]) => (
                  <tr key={rec.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium">
                      {rec.name ?? rec.employee_number ?? rec.code ?? rec.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {rec.archive_reason ?? <span className="text-slate-300">— بلا سبب —</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {formatRelative(rec.archived_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => restore.mutate({ table: activeTable, id: rec.id })}
                        disabled={restore.isPending}
                        data-testid={`restore-${rec.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <Icon name="refresh" size={13} />
                        استعادة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : search.trim() ? (
            <EmptyState title="لا نتائج مطابقة للبحث" hint={`جرب مصطلحاً آخر — إجمالي السجلات: ${records?.length ?? 0}`} />
          ) : (
            <EmptyState title="لا سجلات مؤرشفة في هذا الجدول" />
          )}
        </div>
      )}

      {/* مبدأ الأرشيف */}
      <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
        <h2 className="mb-2 text-sm font-bold text-brand-800">مبدأ الأرشيف الهندسي</h2>
        <ul className="space-y-1 text-xs leading-5 text-brand-900">
          <li>· حذف أي بيانات = أرشفة موثقة (السبب + الزمان + المُنفّذ) — لا DELETE فعلي</li>
          <li>· الاستعادة متاحة لـ IT بنقرة — وتُسجل في سجل التدقيق</li>
          <li>· الأخطاء المغلقة تنتقل لأرشيف الأخطاء (تتبع تاريخي كامل)</li>
          <li>· كل إجراء يقوم به أي شخص يُسجل في سجل التدقيق حصرياً</li>
        </ul>
      </div>
    </section>
  )
}

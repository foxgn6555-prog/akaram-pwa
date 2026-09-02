/**
 * وارد كتب مستلزمات القواطع — معاون المدير المفوض.
 * يعرض كل الكتب المرفوعة من مسؤولي الأقسام (RLS يتيح القراءة للمعاون) مع طباعة/تصدير.
 */
import { useMemo } from 'react'
import { useSupplies, useSectors } from '@features/sector'
import { SHIFT_LABELS } from '@features/sector'
import { toSupplyWord, printSupplyBook } from '@features/sector/lib/supply-book'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function SectorSupplies() {
  const supplies = useSupplies('active')
  const sectors = useSectors()

  const sectorNames = useMemo(() => {
    const m: Record<number, string> = {}
    for (const s of sectors.data ?? []) m[s.id] = s.name
    return m
  }, [sectors.data])

  const list = supplies.data ?? []

  return (
    <div className="space-y-5" data-testid="deputy-supplies">
      <div>
        <h1 className="text-lg font-bold text-slate-800">وارد كتب مستلزمات القواطع</h1>
        <p className="text-sm text-slate-500">كتب طلبات المستلزمات المرفوعة من مسؤولي الأقسام بانتظار موافقتكم.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {supplies.isLoading ? (
          <LoadingSpinner label="جارٍ الجلب…" />
        ) : list.length === 0 ? (
          <EmptyState title="لا توجد كتب واردة" hint="ستظهر هنا كتب المستلزمات فور إرسالها من المسؤولين" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="deputy-supply-table">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">رقم الكتاب</th>
                  <th className="px-3 py-2.5 font-semibold">مقدّم الطلب</th>
                  <th className="px-3 py-2.5 font-semibold">القواطع / الشفت</th>
                  <th className="px-3 py-2.5 font-semibold">المستلزمات</th>
                  <th className="px-3 py-2.5 font-semibold">العدد</th>
                  <th className="px-3 py-2.5 font-semibold">التاريخ</th>
                  <th className="px-3 py-2.5 font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-t border-slate-50 align-middle hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-xs font-bold text-emerald-700 dir-ltr">{r.ref_no ?? '—'}</td>
                    <td className="px-3 py-2.5 font-medium">{r.manager_name || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {r.sectors.map((s) => sectorNames[s] ?? `قاطع ${s}`).join('، ')}
                      <div className="text-[11px] text-slate-400">{SHIFT_LABELS[r.shift]}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.supply_type}</div>
                      {r.notes && <div className="text-[11px] text-slate-500">{r.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold dir-ltr">{r.quantity}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{(r.created_at ?? '').slice(0, 10)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => printSupplyBook(r, sectorNames)}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100">
                          <Icon name="printer" size={13} /> طباعة
                        </button>
                        <button type="button" onClick={() => toSupplyWord(r, sectorNames)}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-brand-700 hover:bg-brand-50">
                          <Icon name="download" size={13} /> Word
                        </button>
                      </div>
                    </td>
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

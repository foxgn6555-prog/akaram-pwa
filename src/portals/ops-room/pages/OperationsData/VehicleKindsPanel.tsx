/**
 * حدود الأوزان لكل نوع آلية — تُدار حصراً من غرفة العمليات (00149).
 * القاعدة الثابتة: الأقل من الحد الأدنى = مخالفة · الأكثر مسموح (الحد الأعلى إرشادي للعرض والتحليل).
 */
import { useState } from 'react'
import { Plus, Save, SlidersHorizontal, X } from 'lucide-react'
import { useSaveVehicleKind, useVehicleKinds, type VehicleKindRow } from '@features/transfer-station'

const destinationLabel: Record<VehicleKindRow['destination'], string> = {
  press: 'المكبس',
  transfer_station: 'المحطة التحويلية',
  both: 'المكبس والمحطة',
}

type Draft = { kind: string; label: string; minTons: string; maxTons: string; destination: VehicleKindRow['destination']; sort: string; active: boolean }
const toDraft = (row?: VehicleKindRow): Draft =>
  row
    ? { kind: row.kind, label: row.label, minTons: String(row.min_tons), maxTons: row.max_tons === null ? '' : String(row.max_tons), destination: row.destination, sort: String(row.sort), active: row.active }
    : { kind: '', label: '', minTons: '', maxTons: '', destination: 'transfer_station', sort: '99', active: true }

export function VehicleKindsPanel() {
  const { rows, isLoading } = useVehicleKinds(true)
  const save = useSaveVehicleKind()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!editing) return
    const min = Number(editing.minTons)
    const max = editing.maxTons.trim() === '' ? null : Number(editing.maxTons)
    if (!/^[a-z0-9_]{2,40}$/.test(editing.kind)) return setError('رمز النوع: أحرف لاتينية صغيرة وأرقام و_ فقط (2–40)')
    if (editing.label.trim().length < 2) return setError('اسم النوع مطلوب')
    if (!Number.isFinite(min) || min <= 0 || min >= 100) return setError('الحد الأدنى يجب أن يكون بين 0.1 و99.9 طن')
    if (max !== null && (!Number.isFinite(max) || max < min || max >= 100)) return setError('الحد الأعلى يجب أن يكون ≥ الحد الأدنى وأقل من 100')
    setError(null)
    save.mutate(
      { kind: editing.kind, label: editing.label.trim(), minTons: min, maxTons: max, destination: editing.destination, sort: Number(editing.sort) || 0, active: editing.active },
      { onSuccess: () => setEditing(null), onError: (e) => setError((e as Error).message) },
    )
  }

  return (
    <section className="rounded-3xl border bg-white p-4 shadow-sm md:p-5" data-testid="vehicle-kinds-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="flex items-center gap-2 text-sm text-slate-900">
          <SlidersHorizontal size={16} className="text-orange-600" /> حدود الأوزان حسب نوع الآلية
        </b>
        <button
          type="button"
          data-testid="vehicle-kind-add"
          onClick={() => {
            setError(null)
            setEditing(toDraft())
          }}
          className="flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-[11px] font-black text-white"
        >
          <Plus size={14} /> نوع جديد
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        الأقل من الحد الأدنى يُسجَّل مخالفة تلقائياً في المحطة · الأكثر مسموح · التعديل هنا يسري فوراً على المحطة ويُحفظ في سجل التدقيق.
      </p>
      {isLoading && <p className="mt-3 text-xs text-slate-500">جارٍ التحميل…</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="bg-slate-50 text-right text-[11px] font-black text-slate-600">
              <th className="p-2">النوع</th>
              <th className="p-2">الرمز</th>
              <th className="p-2">الحد الأدنى (طن)</th>
              <th className="p-2">الحد الأعلى (طن)</th>
              <th className="p-2">الوجهة</th>
              <th className="p-2">الحالة</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.kind} className={`border-t ${row.active ? '' : 'text-slate-400'}`} data-testid={`vehicle-kind-${row.kind}`}>
                <td className="p-2 font-black text-slate-800">{row.label}</td>
                <td className="p-2 font-mono text-[11px]">{row.kind}</td>
                <td className="p-2 font-black">{Number(row.min_tons)}</td>
                <td className="p-2">{row.max_tons === null ? '—' : Number(row.max_tons)}</td>
                <td className="p-2">{destinationLabel[row.destination]}</td>
                <td className="p-2">{row.active ? 'فعّال' : 'معطّل'}</td>
                <td className="p-2 text-left">
                  <button
                    type="button"
                    data-testid={`vehicle-kind-edit-${row.kind}`}
                    onClick={() => {
                      setError(null)
                      setEditing(toDraft(row))
                    }}
                    className="rounded-lg bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-800"
                  >
                    تعديل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50/40 p-3" data-testid="vehicle-kind-form">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="text-[11px] font-black text-slate-600">
              الرمز
              <input data-testid="vehicle-kind-code" value={editing.kind} disabled={rows.some((r) => r.kind === editing.kind)} onChange={(e) => setEditing({ ...editing, kind: e.target.value.trim().toLowerCase() })} className="mt-1 h-10 w-full rounded-xl border bg-white px-2 font-mono text-xs disabled:bg-slate-100" placeholder="trailer_20" />
            </label>
            <label className="text-[11px] font-black text-slate-600">
              الاسم
              <input data-testid="vehicle-kind-label" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} className="mt-1 h-10 w-full rounded-xl border bg-white px-2 text-xs" />
            </label>
            <label className="text-[11px] font-black text-slate-600">
              الحد الأدنى (طن)
              <input data-testid="vehicle-kind-min" type="number" step={0.1} min={0.1} value={editing.minTons} onChange={(e) => setEditing({ ...editing, minTons: e.target.value })} className="mt-1 h-10 w-full rounded-xl border bg-white px-2 text-xs" />
            </label>
            <label className="text-[11px] font-black text-slate-600">
              الحد الأعلى (طن، اختياري)
              <input data-testid="vehicle-kind-max" type="number" step={0.1} min={0.1} value={editing.maxTons} onChange={(e) => setEditing({ ...editing, maxTons: e.target.value })} className="mt-1 h-10 w-full rounded-xl border bg-white px-2 text-xs" />
            </label>
            <label className="text-[11px] font-black text-slate-600">
              الوجهة
              <select data-testid="vehicle-kind-destination" value={editing.destination} onChange={(e) => setEditing({ ...editing, destination: e.target.value as VehicleKindRow['destination'] })} className="mt-1 h-10 w-full rounded-xl border bg-white px-2 text-xs">
                {(Object.keys(destinationLabel) as VehicleKindRow['destination'][]).map((d) => (
                  <option key={d} value={d}>
                    {destinationLabel[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-black text-slate-600">
              الترتيب
              <input data-testid="vehicle-kind-sort" type="number" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} className="mt-1 h-10 w-full rounded-xl border bg-white px-2 text-xs" />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-[11px] font-black text-slate-600">
              <input data-testid="vehicle-kind-active" type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              فعّال في المحطة
            </label>
          </div>
          {error && <p className="mt-2 text-[11px] font-black text-rose-600" data-testid="vehicle-kind-error">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-[11px] font-black">
              <X size={13} /> إلغاء
            </button>
            <button type="button" data-testid="vehicle-kind-save" onClick={submit} disabled={save.isPending} className="flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">
              <Save size={13} /> {save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

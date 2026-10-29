/**
 * 00377: محرر السائقين الإضافيين عند إضافة الآلية — لكل صف: شفت + دور (أساسي/احتياطي) + موظف HR أو سائق متعهد.
 * السائق الأول (أساسي الشفت الرئيسي) يبقى في حقول النموذج الأصلية؛ هنا تُدار الصفوف الإضافية فقط.
 */
import { Plus, Trash2 } from 'lucide-react'
import { ShiftSelect } from '@features/hr-shifts/ShiftSelect'
import { DRIVER_ROLE_LABELS, newExtraDriverRow, type ExtraDriverRow } from '@features/central-garage/vehicle-drivers'
import { DriverPicker } from './DriverPicker'
import { ExternalDriverPicker } from './ExternalDriverPicker'

const inputClass =
  'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'

export function VehicleDriversEditor({
  rows, onChange, mainShift, errors,
}: { rows: ExtraDriverRow[]; onChange: (rows: ExtraDriverRow[]) => void; mainShift: string; errors: Record<string, string> }) {
  const patch = (key: string, p: Partial<ExtraDriverRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-cyan-300 bg-cyan-50/30 p-3 sm:col-span-2" data-testid="vehicle-extra-drivers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-black text-slate-800">سائقون إضافيون (اختياري)</p>
          <p className="text-[11px] font-bold text-slate-500">سائق لكل شفت، أو سائق احتياطي في الشفت نفسه — الأساسي يظهر على بطاقة الآلية، والاحتياطي يُختار عند الانطلاق</p>
        </div>
        <div className="flex gap-2">
          <button type="button" data-testid="add-backup-driver" className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-black text-white" onClick={() => onChange([...rows, newExtraDriverRow(mainShift, 'backup')])}>
            <Plus size={14} /> احتياطي للشفت الرئيسي
          </button>
          <button type="button" data-testid="add-shift-driver" className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-black text-slate-800 ring-1 ring-slate-300" onClick={() => onChange([...rows, newExtraDriverRow('', 'primary')])}>
            <Plus size={14} /> سائق شفت آخر
          </button>
        </div>
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`extra-driver-row-${i}`}>
          <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto_auto]">
            <ShiftSelect testId={`extra-driver-shift-${i}`} className={inputClass} value={r.shift} onChange={(v) => patch(r.key, { shift: v })} allLabel="اختر الشفت" />
            <select data-testid={`extra-driver-role-${i}`} className={inputClass} value={r.role} onChange={(e) => patch(r.key, { role: e.target.value as ExtraDriverRow['role'] })}>
              {(Object.keys(DRIVER_ROLE_LABELS) as Array<keyof typeof DRIVER_ROLE_LABELS>).map((k) => (
                <option key={k} value={k}>{DRIVER_ROLE_LABELS[k]}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              {(['employee', 'external'] as const).map((k) => (
                <button key={k} type="button" data-testid={`extra-driver-kind-${k}-${i}`} aria-pressed={r.driverKind === k}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-black ${r.driverKind === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  onClick={() => patch(r.key, { driverKind: k, driverEmployeeId: '', driverExternalId: '' })}>
                  {k === 'employee' ? 'موظف' : 'متعهد'}
                </button>
              ))}
            </div>
            <button type="button" aria-label="حذف السائق" data-testid={`extra-driver-remove-${i}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
              <Trash2 size={16} />
            </button>
          </div>
          {r.driverKind === 'employee' ? (
            <DriverPicker testId={`extra-driver-${i}`} value={r.driverEmployeeId} onChange={(id) => patch(r.key, { driverEmployeeId: id })} />
          ) : (
            <ExternalDriverPicker testId={`extra-ext-driver-${i}`} value={r.driverExternalId} onChange={(id) => patch(r.key, { driverExternalId: id })} />
          )}
          {errors[r.key] && <p className="text-xs font-bold text-red-600" data-testid={`extra-driver-error-${i}`}>{errors[r.key]}</p>}
        </div>
      ))}
    </div>
  )
}

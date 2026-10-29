/**
 * 00377: سائقو شفتات الآلية — لوحة في صفحة تفاصيل الآلية (غرفة العمليات):
 *  · كل الإسنادات النشطة: الشفت، الدور (أساسي/احتياطي)، السائق (موظف أو متعهد)، الموقع.
 *  · إضافة/استبدال سائق شفت (أساسي أو احتياطي، موظف HR أو سائق متعهد من السجل) بسبب إلزامي.
 *  · إنهاء الاحتياطي (الأساسي يُستبدل ولا يُزال — القاعدة في الخادم FLEET_PRIMARY_CANNOT_BE_REMOVED).
 */
import { useState } from 'react'
import { Plus, UserMinus, Users, X } from 'lucide-react'
import {
  useEndGarageShiftAssignment,
  useGarageShiftAssignments,
  useSetGarageShiftAssignment,
} from '@features/central-garage/hooks'
import { DRIVER_ROLE_LABELS } from '@features/central-garage/vehicle-drivers'
import type { GarageArea, GarageVehicle, GarageVehicleShiftAssignment, VehicleDriverRole } from '@features/central-garage/types'
import { useShiftLabel } from '@features/hr-shifts/hooks'
import { ShiftSelect } from '@features/hr-shifts/ShiftSelect'
import { DriverPicker } from './DriverPicker'
import { ExternalDriverPicker } from './ExternalDriverPicker'

const inputClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100'

export function ShiftDriversPanel({ vehicle, areas, canManage }: { vehicle: GarageVehicle; areas: GarageArea[]; canManage: boolean }) {
  const assignments = useGarageShiftAssignments(vehicle.id)
  const end = useEndGarageShiftAssignment()
  const shiftName = useShiftLabel()
  const [open, setOpen] = useState<null | { shift: string; role: VehicleDriverRole }>(null)
  const [ending, setEnding] = useState<GarageVehicleShiftAssignment | null>(null)
  const [endReason, setEndReason] = useState('')
  const active = (assignments.data ?? []).filter((a) => !a.endsAt)
  const byShift = new Map<string, GarageVehicleShiftAssignment[]>()
  for (const a of active) byShift.set(a.shift, [...(byShift.get(a.shift) ?? []), a])
  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm" data-testid="shift-drivers-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-black text-slate-900">
          <Users className="text-cyan-700" />
          سائقو الشفتات
        </h2>
        {canManage && !vehicle.archivedAt && (
          <button type="button" data-testid="open-shift-driver" onClick={() => setOpen({ shift: vehicle.shift, role: 'backup' })}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-black text-white">
            <Plus size={15} /> إضافة سائق شفت / احتياطي
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] font-bold text-slate-500">لكل شفت سائق أساسي واحد وسائق احتياطي واحد كحد أقصى؛ الاحتياطي يُختار عند الانطلاق من الكراج.</p>
      <div className="mt-4 space-y-3">
        {[...byShift.entries()].map(([shift, rows]) => (
          <div key={shift} className="rounded-2xl border border-slate-200 p-3" data-testid={`shift-drivers-${shift}`}>
            <b className="text-sm">{shiftName(shift)}</b>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(['primary', 'backup'] as const).map((role) => {
                const a = rows.find((r) => r.driverRole === role)
                return (
                  <div key={role} className={`rounded-xl p-3 text-xs ${a ? (role === 'primary' ? 'bg-emerald-50' : 'bg-amber-50') : 'border border-dashed border-slate-300'}`}>
                    <span className="block text-[10px] font-black text-slate-500">{DRIVER_ROLE_LABELS[role]}</span>
                    {a ? (
                      <>
                        <b className="block">{a.driverName}</b>
                        <span className="block text-slate-600">
                          {a.contractorName ? `سائق متعهد · ${a.contractorName}` : a.driverEmployeeNumber ? `موظف · ${a.driverEmployeeNumber}` : 'غير مرتبط'} · {a.areaName}
                        </span>
                        {canManage && !vehicle.archivedAt && (
                          <span className="mt-2 flex gap-2">
                            <button type="button" className="rounded-lg bg-white px-2 py-1 font-black ring-1 ring-slate-300" onClick={() => setOpen({ shift, role })} data-testid={`replace-${role}-${shift}`}>استبدال</button>
                            {role === 'backup' && (
                              <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-black text-red-700 ring-1 ring-red-200" onClick={() => { setEnding(a); setEndReason('') }} data-testid={`end-backup-${shift}`}>
                                <UserMinus size={12} /> إنهاء
                              </button>
                            )}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="block text-slate-400">—
                        {canManage && !vehicle.archivedAt && (
                          <button type="button" className="mr-2 font-black text-cyan-700" onClick={() => setOpen({ shift, role })} data-testid={`add-${role}-${shift}`}>إضافة</button>
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {!active.length && !assignments.isLoading && <p className="py-4 text-center text-sm text-slate-400">لا إسنادات نشطة</p>}
      </div>
      {open && <ShiftDriverDialog vehicle={vehicle} areas={areas} initial={open} existing={active} onClose={() => setOpen(null)} />}
      {ending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="إنهاء السائق الاحتياطي" data-testid="end-backup-dialog">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="font-black">إنهاء إسناد الاحتياطي: {ending.driverName}</h3>
            <input className={`${inputClass} mt-4`} placeholder="السبب (إلزامي)" value={endReason} onChange={(e) => setEndReason(e.target.value)} data-testid="end-backup-reason" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="h-10 rounded-xl border px-4 text-sm font-bold" onClick={() => setEnding(null)}>إلغاء</button>
              <button type="button" data-testid="end-backup-submit" disabled={endReason.trim().length < 3 || end.isPending} className="h-10 rounded-xl bg-red-700 px-4 text-sm font-black text-white disabled:opacity-50"
                onClick={() => end.mutate({ assignmentId: ending.id, vehicleId: vehicle.id, reason: endReason }, { onSuccess: () => setEnding(null) })}>
                تأكيد الإنهاء
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ShiftDriverDialog({
  vehicle, areas, initial, existing, onClose,
}: { vehicle: GarageVehicle; areas: GarageArea[]; initial: { shift: string; role: VehicleDriverRole }; existing: GarageVehicleShiftAssignment[]; onClose: () => void }) {
  const set = useSetGarageShiftAssignment()
  const current = existing.find((a) => a.shift === initial.shift && a.driverRole === initial.role)
  const [form, setForm] = useState({
    shift: initial.shift,
    role: initial.role,
    driverKind: 'employee' as 'employee' | 'external',
    driverEmployeeId: '',
    driverExternalId: '',
    sectorId: String(current?.sectorId ?? vehicle.sectorId),
    reason: '',
  })
  const [error, setError] = useState<string | null>(null)
  const hasPrimary = existing.some((a) => a.shift === form.shift && a.driverRole === 'primary')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.shift) return setError('اختر الشفت')
    if (form.driverKind === 'employee' && !form.driverEmployeeId) return setError('اختر السائق من قائمة الموظفين')
    if (form.driverKind === 'external' && !form.driverExternalId) return setError('اختر سائق المتعهد من السجل أو أضفه')
    if (form.role === 'backup' && !hasPrimary) return setError('الاحتياطي يحتاج سائقاً أساسياً في الشفت نفسه — أضف الأساسي أولاً')
    if (!form.sectorId) return setError('اختر موقع العمل')
    if (form.reason.trim().length < 3) return setError('السبب إلزامي (3 أحرف على الأقل)')
    setError(null)
    set.mutate(
      {
        vehicleId: vehicle.id,
        shift: form.shift,
        role: form.role,
        driverEmployeeId: form.driverKind === 'employee' ? form.driverEmployeeId : null,
        driverExternalId: form.driverKind === 'external' ? form.driverExternalId : null,
        sectorId: Number(form.sectorId),
        reason: form.reason,
      },
      { onSuccess: onClose },
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="سائق شفت" data-testid="shift-driver-dialog">
      <form onSubmit={submit} className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">{current ? 'استبدال سائق الشفت' : 'إضافة سائق شفت'}</h2>
            <p className="mt-1 text-sm text-slate-500">{vehicle.vehicleName} · DB {vehicle.dbNumber}{current ? ` · الحالي: ${current.driverName}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>الشفت</span>
            <ShiftSelect testId="shift-driver-shift" className={inputClass} value={form.shift} onChange={(v) => setForm({ ...form, shift: v })} />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>الدور</span>
            <select data-testid="shift-driver-role" className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as VehicleDriverRole })}>
              <option value="primary">{DRIVER_ROLE_LABELS.primary} — يظهر على بطاقة الآلية</option>
              <option value="backup">{DRIVER_ROLE_LABELS.backup} — يُختار عند الانطلاق</option>
            </select>
          </label>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <span>نوع السائق:</span>
              {([['employee', 'موظف (HR)'], ['external', 'سائق متعهد']] as const).map(([k, label]) => (
                <button key={k} type="button" data-testid={`shift-driver-kind-${k}`} aria-pressed={form.driverKind === k}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black ${form.driverKind === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                  onClick={() => setForm({ ...form, driverKind: k, driverEmployeeId: '', driverExternalId: '' })}>{label}</button>
              ))}
            </div>
            {form.driverKind === 'employee' ? (
              <DriverPicker testId="shift-driver-employee" value={form.driverEmployeeId} onChange={(id) => setForm({ ...form, driverEmployeeId: id })} />
            ) : (
              <ExternalDriverPicker testId="shift-driver-external" value={form.driverExternalId} onChange={(id) => setForm({ ...form, driverExternalId: id })} />
            )}
          </div>
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>موقع العمل</span>
            <select data-testid="shift-driver-area" className={inputClass} value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>
              <option value="">اختر المنطقة</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-600"><span>السبب</span>
            <input data-testid="shift-driver-reason" className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="مثال: سائق احتياطي للإجازات" />
          </label>
        </div>
        {error && <p className="mt-3 text-xs font-bold text-red-600" data-testid="shift-driver-error">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-slate-300 px-5 font-bold text-slate-700">إلغاء</button>
          <button data-testid="shift-driver-submit" disabled={set.isPending} className="h-11 rounded-xl bg-cyan-700 px-6 font-bold text-white disabled:opacity-60">{set.isPending ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </div>
      </form>
    </div>
  )
}

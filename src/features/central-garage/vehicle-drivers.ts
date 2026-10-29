/**
 * 00377: سائقون متعددون عند إضافة الآلية — منطق خالص قابل للاختبار:
 *  · السائق الأول = أساسي الشفت الرئيسي (حقول النموذج الأصلية).
 *  · صفوف إضافية: شفت + دور (أساسي/احتياطي) + (موظف HR أو سائق متعهد).
 *  · القواعد (تُطابق garage_add_vehicle): خانة (شفت، دور) لا تتكرر، الاحتياطي يحتاج أساسياً في شفته،
 *    الشخص نفسه لا يكون أساسياً واحتياطياً في الشفت نفسه، وكل صف يختار سائقاً.
 */
import type { VehicleDriverRole, VehicleDriverSlot } from './types'

export type DriverKind = 'employee' | 'external'
export interface ExtraDriverRow {
  key: string
  shift: string
  role: VehicleDriverRole
  driverKind: DriverKind
  driverEmployeeId: string
  driverExternalId: string
}

export const DRIVER_ROLE_LABELS: Record<VehicleDriverRole, string> = { primary: 'أساسي', backup: 'احتياطي' }

export const newExtraDriverRow = (shift: string, role: VehicleDriverRole = 'backup'): ExtraDriverRow => ({
  key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  shift,
  role,
  driverKind: 'employee',
  driverEmployeeId: '',
  driverExternalId: '',
})

const refOf = (r: { driverKind: DriverKind; driverEmployeeId: string; driverExternalId: string }) =>
  r.driverKind === 'employee' ? (r.driverEmployeeId ? `e:${r.driverEmployeeId}` : '') : r.driverExternalId ? `x:${r.driverExternalId}` : ''

/** يتحقق من الصفوف الإضافية مقابل السائق الأول. يعيد خريطة key→رسالة (فارغة = سليم). */
export function validateExtraDrivers(
  primary: { shift: string; driverKind: DriverKind; driverEmployeeId: string; driverExternalId: string },
  rows: ExtraDriverRow[],
): Record<string, string> {
  const errors: Record<string, string> = {}
  const slots = new Map<string, string>([[`${primary.shift}/primary`, 'main']])
  const persons = new Map<string, string>()
  const pRef = refOf(primary)
  if (pRef) persons.set(`${primary.shift}/${pRef}`, 'main')
  for (const r of rows) {
    if (!r.shift) { errors[r.key] = 'اختر الشفت'; continue }
    const slot = `${r.shift}/${r.role}`
    if (slots.has(slot)) { errors[r.key] = r.role === 'primary' ? 'لهذا الشفت سائق أساسي بالفعل' : 'لهذا الشفت سائق احتياطي بالفعل'; continue }
    slots.set(slot, r.key)
    const ref = refOf(r)
    if (!ref) { errors[r.key] = r.driverKind === 'employee' ? 'اختر السائق من قائمة الموظفين' : 'اختر سائق المتعهد من السجل أو أضفه'; continue }
    const pk = `${r.shift}/${ref}`
    if (persons.has(pk)) { errors[r.key] = 'الشخص نفسه لا يكون أساسياً واحتياطياً في الشفت نفسه'; continue }
    persons.set(pk, r.key)
  }
  for (const r of rows) {
    if (errors[r.key] || r.role !== 'backup') continue
    if (!slots.has(`${r.shift}/primary`)) errors[r.key] = 'الاحتياطي يحتاج سائقاً أساسياً في الشفت نفسه — أضف الأساسي أولاً'
  }
  return errors
}

/** يبني قائمة p_drivers: الأساسي الرئيسي أولاً ثم الصفوف الإضافية (بعد التحقق). */
export function buildDriverSlots(
  primary: { shift: string; driverKind: DriverKind; driverEmployeeId: string; driverExternalId: string; sectorId?: number | null },
  rows: ExtraDriverRow[],
): VehicleDriverSlot[] {
  const toSlot = (r: { shift: string; role: VehicleDriverRole; driverKind: DriverKind; driverEmployeeId: string; driverExternalId: string }): VehicleDriverSlot => ({
    shift: r.shift,
    role: r.role,
    driverEmployeeId: r.driverKind === 'employee' ? r.driverEmployeeId || null : null,
    driverExternalId: r.driverKind === 'external' ? r.driverExternalId || null : null,
    sectorId: primary.sectorId ?? null,
  })
  return [toSlot({ ...primary, role: 'primary' }), ...rows.map(toSlot)]
}

/**
 * مرجع أنواع الآليات والأوزان المسموحة — مرآة TS لجدول ts_vehicle_kinds (ميجريشن 00130).
 *  · المكبس والمحطة: كابسة صغيرة 2–3 · وسط 4–6 · كبيرة 6–8
 *  · المحطة التحويلية أيضاً: كيا 2 · كنتر 5 · تك 7 · سكس 10 (الاستيعاب = الحد الأدنى)
 *  · القاعدة المعتمدة: الأكثر مسموح · الأقل غير مسموح ⇒ مخالفة وزن.
 */

export type WeighingDestination = 'press' | 'transfer_station'

export interface VehicleKind {
  kind: string
  label: string
  /** الحد الأدنى المسموح (طن) — دونه تُسجل مخالفة */
  minTons: number
  /** الحد الأعلى الإرشادي للمدى (طن) — الكباسات فقط */
  maxTons: number | null
  destinations: WeighingDestination[] | 'both'
  sort: number
}

export const VEHICLE_KINDS: VehicleKind[] = [
  { kind: 'compactor_small', label: 'كابسة صغيرة', minTons: 2, maxTons: 3, destinations: 'both', sort: 1 },
  { kind: 'compactor_medium', label: 'كابسة وسط', minTons: 4, maxTons: 6, destinations: 'both', sort: 2 },
  { kind: 'compactor_large', label: 'كابسة كبيرة', minTons: 6, maxTons: 8, destinations: 'both', sort: 3 },
  { kind: 'kia', label: 'كيا', minTons: 2, maxTons: null, destinations: ['transfer_station'], sort: 4 },
  { kind: 'canter', label: 'كنتر', minTons: 5, maxTons: null, destinations: ['transfer_station'], sort: 5 },
  { kind: 'tak', label: 'تك', minTons: 7, maxTons: null, destinations: ['transfer_station'], sort: 6 },
  { kind: 'six', label: 'سكس', minTons: 10, maxTons: null, destinations: ['transfer_station'], sort: 7 },
]

export const DESTINATION_LABELS: Record<WeighingDestination, string> = {
  press: 'المكبس',
  transfer_station: 'المحطة التحويلية',
}

export const kindByKey = (kind: string): VehicleKind | undefined =>
  VEHICLE_KINDS.find(entry => entry.kind === kind)

/** الأنواع المتاحة لوجهة معينة */
export const kindsForDestination = (destination: WeighingDestination): VehicleKind[] =>
  VEHICLE_KINDS.filter(entry => entry.destinations === 'both' || entry.destinations.includes(destination))

/** الأقل غير مسموح: مخالفة عندما يقل الوزن عن الحد الأدنى للنوع */
export const weighingViolation = (
  kind: string | undefined,
  weightTons: number | null,
): { violates: boolean; deficit: number | null; minTons: number | null } => {
  const meta = kind ? kindByKey(kind) : undefined
  if (!meta || weightTons === null || Number.isNaN(weightTons)) return { violates: false, deficit: null, minTons: meta?.minTons ?? null }
  const violates = weightTons < meta.minTons
  return { violates, deficit: violates ? +(meta.minTons - weightTons).toFixed(2) : null, minTons: meta.minTons }
}

/** نص المدى المسموح للعرض الاحترافي */
export const kindRangeLabel = (meta: VehicleKind): string =>
  meta.maxTons === null
    ? `الحد الأدنى المسموح ${meta.minTons} طن (الأكثر مسموح)`
    : `المدى المسموح ${meta.minTons}–${meta.maxTons} طن`

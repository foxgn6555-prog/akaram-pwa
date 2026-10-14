/**
 * بيانات المحلة والزقاق — مطابقة المحلة المكتوبة على الصورة مع سجل محلات المناطق
 * الثماني، ثم اقتراح مسؤول القسم الذي تضم مناطقه تلك المنطقة.
 * التوحيد هنا مطابق لدالة `app.normalize_arabic_name` في قاعدة البيانات.
 */
import type { ComplaintManager, ComplaintNeighborhood, ComplaintSector } from '../types'

export const COMPLAINT_AREAS: ReadonlyArray<{ id: number; name: string; parent: ComplaintSector }> = [
  { id: 1, name: 'أرخيته', parent: 'karrada' },
  { id: 2, name: 'الرياض', parent: 'karrada' },
  { id: 3, name: 'الواثق', parent: 'karrada' },
  { id: 4, name: 'الجادرية', parent: 'karrada' },
  { id: 5, name: 'السندباد', parent: 'zaafaraniya' },
  { id: 6, name: 'الزعفرانية', parent: 'zaafaraniya' },
  { id: 7, name: 'ديالى', parent: 'zaafaraniya' },
  { id: 8, name: 'الوليد', parent: 'zaafaraniya' },
]

export const areaName = (id: number) => COMPLAINT_AREAS.find(area => area.id === id)?.name ?? `منطقة ${id}`

/** صيغة موحدة للمقارنة: بلا «محلة» بادئة ولا تشكيل، همزات/تاء مربوطة/ياء موحدة، مسافات مفردة. */
export function normalizeArabicName(value: string | null | undefined): string {
  return (value ?? '')
    .trim().toLowerCase()
    .replace(/^\s*محل[ةه]\s+/, '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
}

export interface NeighborhoodMatch {
  neighborhood: ComplaintNeighborhood
  areaId: number
  areaName: string
}

/** يطابق المحلة المكتوبة مع سجل محلات القاطع نفسه (الفعّالة فقط). */
export function matchNeighborhood(value: string | null | undefined, sector: ComplaintSector, registry: ComplaintNeighborhood[]): NeighborhoodMatch | null {
  const key = normalizeArabicName(value)
  if (!key) return null
  const hit = registry.find(entry => entry.isActive && entry.parentSector === sector && normalizeArabicName(entry.name) === key)
  return hit ? { neighborhood: hit, areaId: hit.sectorId, areaName: hit.sectorName } : null
}

/** اقتراحات المحلات لقاطع معيّن مرتبة حسب المنطقة ثم الاسم (لقائمة الإكمال أثناء الفرز). */
export function neighborhoodSuggestions(sector: ComplaintSector, registry: ComplaintNeighborhood[], query = ''): ComplaintNeighborhood[] {
  const key = normalizeArabicName(query)
  return registry
    .filter(entry => entry.isActive && entry.parentSector === sector && (!key || normalizeArabicName(entry.name).includes(key)))
    .sort((a, b) => a.sectorId - b.sectorId || a.name.localeCompare(b.name, 'ar'))
}

export interface ManagerSuggestion {
  /** مسؤول واحد تضم مناطقه منطقة المحلة؛ null عند عدم وجود مسؤول أو وجود أكثر من واحد. */
  manager: ComplaintManager | null
  candidates: ComplaintManager[]
  match: NeighborhoodMatch
}

/** مسؤول القسم المقترح من المحلة: المسؤولون الذين تضم مناطقهم منطقة المحلة. */
export function suggestManager(value: string | null | undefined, sector: ComplaintSector, registry: ComplaintNeighborhood[], managers: ComplaintManager[]): ManagerSuggestion | null {
  const match = matchNeighborhood(value, sector, registry)
  if (!match) return null
  const candidates = managers.filter(manager => manager.sectorIds.includes(match.areaId))
  return { match, candidates, manager: candidates.length === 1 ? candidates[0]! : null }
}

export interface AutoAssignPlan<T extends { id: string; neighborhood: string | null; sector: ComplaintSector }> {
  batches: Array<{ manager: ComplaintManager; areaNames: string[]; itemIds: string[] }>
  unmatched: T[]
  ambiguous: Array<{ item: T; candidates: ComplaintManager[]; areaName: string }>
}

/** يوزّع التذاكر على المسؤولين حسب محلاتها: دفعة لكل مسؤول، وما لم يُطابَق أو تعدد مسؤولوه يبقى يدوياً. */
export function planAutoAssign<T extends { id: string; neighborhood: string | null; sector: ComplaintSector }>(items: T[], registry: ComplaintNeighborhood[], managers: ComplaintManager[]): AutoAssignPlan<T> {
  const byManager = new Map<string, { manager: ComplaintManager; areaNames: Set<string>; itemIds: string[] }>()
  const unmatched: T[] = []
  const ambiguous: AutoAssignPlan<T>['ambiguous'] = []
  for (const item of items) {
    const suggestion = suggestManager(item.neighborhood, item.sector, registry, managers)
    if (!suggestion) { unmatched.push(item); continue }
    if (!suggestion.manager) { ambiguous.push({ item, candidates: suggestion.candidates, areaName: suggestion.match.areaName }); continue }
    const bucket = byManager.get(suggestion.manager.userId) ?? { manager: suggestion.manager, areaNames: new Set<string>(), itemIds: [] }
    bucket.areaNames.add(suggestion.match.areaName)
    bucket.itemIds.push(item.id)
    byManager.set(suggestion.manager.userId, bucket)
  }
  return { batches: [...byManager.values()].map(bucket => ({ manager: bucket.manager, areaNames: [...bucket.areaNames], itemIds: bucket.itemIds })), unmatched, ambiguous }
}

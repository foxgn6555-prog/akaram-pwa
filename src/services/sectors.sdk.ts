/** SDK القطاعات والمناطق الديناميكية (00393) — المصدر الوحيد لشجرة القطاعات/المناطق؛ الكتابة للتطوير المركزية فقط */
import { sdkGuard, supabase } from './client'
import { setSectorNameResolver } from '@lib/pptx/complaintCovers'

export interface SectorArea { id: number; code: string; name: string; sort: number; is_active: boolean }
export interface ParentSectorNode { code: string; name: string; sort: number; is_active: boolean; areas: SectorArea[] }

// ── السجل الحيّ (00394): آخر شجرة معروفة متاحة متزامناً لكل الواجهة (كنمط سجل الشفتات) ──
export const SECTORS_FALLBACK_TREE: ParentSectorNode[] = [
  { code: 'karrada', name: 'الكرادة', sort: 1, is_active: true, areas: [
    { id: 1, code: 'S1', name: 'أرخيته', sort: 1, is_active: true }, { id: 2, code: 'S2', name: 'الرياض', sort: 2, is_active: true },
    { id: 3, code: 'S3', name: 'الواثق', sort: 3, is_active: true }, { id: 4, code: 'S4', name: 'الجادرية', sort: 4, is_active: true }] },
  { code: 'zaafaraniya', name: 'الزعفرانية', sort: 2, is_active: true, areas: [
    { id: 5, code: 'S5', name: 'السندباد', sort: 5, is_active: true }, { id: 6, code: 'S6', name: 'الزعفرانية', sort: 6, is_active: true },
    { id: 7, code: 'S7', name: 'ديالى', sort: 7, is_active: true }, { id: 8, code: 'S8', name: 'الوليد', sort: 8, is_active: true }] },
]
let snapshot: ParentSectorNode[] = SECTORS_FALLBACK_TREE
let loaded = false
const listeners = new Set<() => void>()
/** تسجيل شجرة واردة (الفعّالة والموقوفة معاً) */
export const registerSectorsTree = (tree: readonly ParentSectorNode[]): void => {
  if (!tree.length) return
  snapshot = [...tree]; loaded = true; listeners.forEach((l) => l())
}
export const subscribeSectorsRegistry = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const getSectorsRegistrySnapshot = (): ParentSectorNode[] => snapshot
export const isSectorsRegistryLoaded = (): boolean => loaded
export const resetSectorsRegistry = (): void => { snapshot = SECTORS_FALLBACK_TREE; loaded = false; listeners.forEach((l) => l()) }

/** اسم القطاع من السجل الحيّ — «الكرادة» (الموقوف يبقى له اسمه للسجلات التاريخية) */
export const parentSectorLabel = (code: string | null | undefined): string => {
  if (!code) return '—'
  return snapshot.find((p) => p.code === code)?.name ?? code
}
// 00395: أغلفة PowerPoint (ملف مشترك مع دالة الحافة بلا استيرادات) تأخذ الاسم من السجل الحيّ
setSectorNameResolver((code) => parentSectorLabel(code))
/** «قاطع الكرادة» */
export const parentSectorTitle = (code: string | null | undefined): string => (code ? `قاطع ${parentSectorLabel(code)}` : '—')
/** خريطة حيّة رمز → اسم (بديل الثوابت PARENT_AR) */
export const PARENT_SECTOR_LABELS_LIVE: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, k) => (typeof k === 'string' ? snapshot.find((p) => p.code === k)?.name : undefined),
  has: (_t, k) => typeof k === 'string' && snapshot.some((p) => p.code === k),
  ownKeys: () => snapshot.map((p) => p.code),
  getOwnPropertyDescriptor: (_t, k) => { const p = snapshot.find((x) => x.code === k); return p ? { enumerable: true, configurable: true, value: p.name } : undefined },
})
/** رموز القطاعات المميزة من قائمة عناصر لها parentSector/parent_sector — بترتيب السجل الحيّ ثم المجهولة */
export const parentCodesOf = (items: ReadonlyArray<{ parentSector?: string | null; parent_sector?: string | null }>): string[] => {
  const present = new Set<string>()
  for (const it of items) { const c = it.parentSector ?? it.parent_sector; if (c) present.add(c) }
  const ordered = snapshot.map((p) => p.code).filter((c) => present.has(c))
  for (const c of present) if (!ordered.includes(c)) ordered.push(c)
  return ordered
}
/** اسم المنطقة برقمها من السجل الحيّ */
export const areaLabel = (id: number | null | undefined): string => {
  if (id == null) return '—'
  for (const p of snapshot) { const a = p.areas.find((x) => x.id === id); if (a) return a.name }
  return `منطقة ${id}`
}

const reg = (t: ParentSectorNode[]): ParentSectorNode[] => { registerSectorsTree(t); return t }

export const sectorsSdk = {
  /** شجرة القطاعات بمناطقها (الفعّالة فقط افتراضياً؛ includeInactive للتطوير المركزية). كل جلب يغذّي السجل الحيّ. */
  async tree(includeInactive = false): Promise<ParentSectorNode[]> {
    const tree = ((await sdkGuard(supabase.rpc('sectors_tree', { p_include_inactive: includeInactive }))) as ParentSectorNode[] | null) ?? []
    // الشجرة الكاملة (مع الموقوفة) هي المرجع؛ الفعّالة فقط تُسجَّل إن لم يُحمَّل شيء بعد
    if (includeInactive || !loaded) registerSectorsTree(tree)
    return tree
  },
  async saveParent(input: { code: string; name: string; sort?: number | null; is_active?: boolean | null }): Promise<ParentSectorNode[]> {
    return reg(((await sdkGuard(supabase.rpc('it_parent_sector_save', { p_code: input.code, p_name: input.name, p_sort: input.sort ?? null, p_is_active: input.is_active ?? true }))) as ParentSectorNode[] | null) ?? [])
  },
  async setParentActive(code: string, active: boolean): Promise<ParentSectorNode[]> {
    return reg(((await sdkGuard(supabase.rpc('it_parent_sector_set_active', { p_code: code, p_is_active: active }))) as ParentSectorNode[] | null) ?? [])
  },
  async saveArea(input: { id?: number | null; parent_sector: string; name: string; sort?: number | null; is_active?: boolean | null }): Promise<ParentSectorNode[]> {
    return reg(((await sdkGuard(supabase.rpc('it_area_save', { p_id: input.id ?? null, p_parent_sector: input.parent_sector, p_name: input.name, p_sort: input.sort ?? null, p_is_active: input.is_active ?? true }))) as ParentSectorNode[] | null) ?? [])
  },
}

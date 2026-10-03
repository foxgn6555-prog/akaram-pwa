/**
 * وحدات البوابة الظاهرة لهذا الحساب (00170)
 *  · الافتراضي: كل الوحدات ظاهرة · التطوير المركزية قد تخفي وحدات محددة لحساب محدد (it_hidden_units_set)
 *  · مخزن zustand صغير (لا يعتمد على QueryClientProvider) يُحمَّل مرة من AppShell عبر `my_hidden_units()`
 *  · يُطبَّق في الشريط الجانبي والقائمة السفلية والهيدر — ولا يُطبَّق على المسارات (الأمان في RLS وليس في القائمة)
 */
import { create } from 'zustand'
import { disclosuresUnit } from '@sdk/disclosures-unit.sdk'
import type { SidebarUnit } from '@config/portals.config'

interface HiddenState { loaded: boolean; hidden: Record<string, string[]>; set: (h: Record<string, string[]>) => void; reset: () => void }
export const useHiddenUnitsStore = create<HiddenState>((set) => ({
  loaded: false, hidden: {},
  set: (hidden) => set({ hidden, loaded: true }),
  reset: () => set({ hidden: {}, loaded: false }),
}))

let inflight: Promise<void> | null = null
/** يُحمِّل الوحدات المخفية مرة واحدة (آمن للاستدعاء المتكرر) */
export function loadMyHiddenUnits(force = false): Promise<void> {
  const st = useHiddenUnitsStore.getState()
  if (st.loaded && !force) return Promise.resolve()
  if (inflight) return inflight
  inflight = disclosuresUnit.myHiddenUnits()
    .then((h) => st.set(h ?? {}))
    .catch(() => st.set({})) // فشل التحميل = لا إخفاء (لا نكسر القائمة أبداً)
    .finally(() => { inflight = null })
  return inflight
}

/** يُرشّح وحدات البوابة (وأبناءها) حسب المخفي لهذا الحساب — مع إبقاء الرئيسية دائماً */
export function filterVisibleUnits(portal: string, units: readonly SidebarUnit[], hidden: Record<string, string[]>): readonly SidebarUnit[] {
  const list = hidden[portal]
  if (!list || list.length === 0) return units
  const set = new Set(list)
  const home = `/${portal}`
  return units
    .filter((u) => u.path === home || !set.has(u.path))
    .map((u) => (u.children ? { ...u, children: u.children.filter((c) => !set.has(c.path)) } : u))
}

export function useVisibleUnits(portal: string, units: readonly SidebarUnit[]): readonly SidebarUnit[] {
  const hidden = useHiddenUnitsStore((s) => s.hidden)
  return filterVisibleUnits(portal, units, hidden)
}

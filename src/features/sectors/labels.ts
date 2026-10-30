/**
 * 00394 — القطاعات والمناطق من السجل الحيّ (قاعدة البيانات) بدل الثوابت.
 *   useParentSectors(): القطاعات الفعّالة بمناطقها للفلاتر والنماذج — بلا QueryClient (useSyncExternalStore).
 *   SectorsRegistryLoader: يُركَّب مرة في جذر التطبيق ويحمّل الشجرة بعد الدخول ويبقيها محدَّثة.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@features/auth/hooks/useAuth'
import { getSectorsRegistrySnapshot, isSectorsRegistryLoaded, parentSectorLabel, sectorsSdk, subscribeSectorsRegistry, type ParentSectorNode, type SectorArea } from '@sdk/sectors.sdk'

export interface ParentSectorOption { code: string; name: string; title: string; areas: SectorArea[] }
export interface AreaOption extends SectorArea { parent: string; parentName: string }

/** الشجرة الكاملة من السجل الحيّ (فعّالة وموقوفة) */
export function useSectorsRegistry(): { tree: ParentSectorNode[]; isLoaded: boolean } {
  const tree = useSyncExternalStore(subscribeSectorsRegistry, getSectorsRegistrySnapshot, getSectorsRegistrySnapshot)
  return { tree, isLoaded: isSectorsRegistryLoaded() }
}

/** القطاعات الفعّالة بمناطقها الفعّالة */
export function useParentSectors(): { parents: ParentSectorOption[]; areas: AreaOption[]; label: (code: string | null | undefined) => string; isLoaded: boolean } {
  const { tree, isLoaded } = useSectorsRegistry()
  return useMemo(() => {
    const parents = tree.filter((p) => p.is_active).map((p) => ({ code: p.code, name: p.name, title: `قاطع ${p.name}`, areas: p.areas.filter((a) => a.is_active) }))
    const areas = parents.flatMap((p) => p.areas.map((a) => ({ ...a, parent: p.code, parentName: p.name })))
    return { parents, areas, label: parentSectorLabel, isLoaded }
  }, [tree, isLoaded])
}

export const sectorsRegistryKey = ['sectors', 'registry'] as const
/** يُركَّب مرة في جذر التطبيق: يحمّل شجرة القطاعات (مع الموقوفة) بعد تسجيل الدخول ويحدّثها كل دقيقة/عند التركيز */
export function SectorsRegistryLoader() {
  const session = useAuth()
  const q = useQuery({ queryKey: sectorsRegistryKey, queryFn: () => sectorsSdk.tree(true), enabled: !!session.data, staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true })
  useEffect(() => { /* التسجيل يتم داخل sectorsSdk.tree */ }, [q.dataUpdatedAt])
  return null
}

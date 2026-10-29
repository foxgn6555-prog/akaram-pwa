import { useEffect, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@features/auth/hooks/useAuth'
import { getShiftRegistrySnapshot, hrShifts, isShiftRegistryLoaded, shiftLabel, shiftLabelMap, subscribeShiftRegistry, type ShiftOption } from '@sdk/hr-shifts.sdk'

export const shiftOptionsKey = ['hr-shifts', 'options'] as const

/**
 * قائمة الشفتات من HR (السجل الحيّ؛ لا يحتاج QueryClient). `includeInactive=false` يخفي الموقوفة.
 * يُحمَّل من الخادم بواسطة ShiftRegistryLoader في جذر التطبيق ويتحدث كل دقيقة/عند التركيز.
 */
export const useShiftOptions = (includeInactive = false) => {
  const all = useSyncExternalStore(subscribeShiftRegistry, getShiftRegistrySnapshot, getShiftRegistrySnapshot)
  const data = includeInactive ? all : all.filter((o) => o.is_active)
  return { data, isLoaded: isShiftRegistryLoaded() }
}

/** دالة تسمية الشفت (الاسم من HR، واحتياطياً صباحي/مسائي/ليلي) */
export const useShiftLabel = () => {
  const { data } = useShiftOptions(true)
  return (code: string | null | undefined) => shiftLabel(code, data)
}

export const useShiftLabelMap = () => shiftLabelMap(useShiftOptions(true).data)
export type { ShiftOption }

/** يُركَّب مرة في جذر التطبيق: يحمّل قائمة الشفتات بعد تسجيل الدخول ويبقيها محدَّثة (كل دقيقة/عند التركيز) */
export function ShiftRegistryLoader() {
  const session = useAuth()
  const q = useQuery({ queryKey: shiftOptionsKey, queryFn: () => hrShifts.options(true), enabled: !!session.data, staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true })
  useEffect(() => { /* التسجيل يتم داخل hrShifts.options */ }, [q.dataUpdatedAt])
  return null
}

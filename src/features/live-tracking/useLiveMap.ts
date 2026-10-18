/** استعلامات خريطة البث المباشر لغرفة العمليات (00287) — تحديث تلقائي كل دقيقة. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { liveTracking, type LiveKind } from '@sdk/live-tracking.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
import { LIVE_MAP_REFRESH_MS } from './live-map.logic'

export function useLiveMapRows() {
  return useQuery({ queryKey: ['live', 'map'], queryFn: () => liveTracking.mapCurrent(null), refetchInterval: LIVE_MAP_REFRESH_MS, refetchOnWindowFocus: true })
}
export function useLiveZones() {
  return useQuery({ queryKey: ['live', 'zones'], queryFn: () => liveTracking.zones(), staleTime: 5 * 60_000 })
}

export function useLiveSessions(x: { from: string; to: string; kind: LiveKind | null }) {
  return useQuery({ queryKey: ['live', 'sessions', x], queryFn: () => liveTracking.sessions({ from: x.from, to: x.to, kind: x.kind }), enabled: Boolean(x.from && x.to && x.to >= x.from) })
}
export function useLiveSessionPoints(sessionId: string | null) {
  return useQuery({ queryKey: ['live', 'points', sessionId], queryFn: () => liveTracking.points(sessionId!), enabled: Boolean(sessionId) })
}
export function useLiveSettings() {
  return useQuery({ queryKey: ['live', 'settings'], queryFn: () => liveTracking.settings() })
}
export function useSetLiveSettings() {
  const qc = useQueryClient(); const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (x: { intervalMinutes: number; retentionDays: number }) => liveTracking.setSettings(x),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['live', 'settings'] }); addToast({ type: 'success', message: 'تم حفظ إعدادات البث المباشر' }) },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'live-settings' }).message }),
  })
}

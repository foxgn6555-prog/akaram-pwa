import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stationFleet, stationErrorMessage, type StationExitInput, type StationExitResult } from '@sdk/station-fleet.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const stationFleetKeys = {
  all: ['station-fleet'] as const,
  categories: () => [...stationFleetKeys.all, 'categories'] as const,
  candidates: (q: string, onlyStation: boolean) => [...stationFleetKeys.all, 'candidates', q, onlyStation] as const,
  fleet: () => [...stationFleetKeys.all, 'fleet'] as const,
  destinations: (inactive: boolean) => [...stationFleetKeys.all, 'destinations', inactive] as const,
  externalDrivers: () => [...stationFleetKeys.all, 'external-drivers'] as const,
  drivers: () => [...stationFleetKeys.all, 'drivers'] as const,
  outbound: (from: string, to: string, open: boolean) => [...stationFleetKeys.all, 'outbound', from, to, open] as const,
}

const useAction = <T, R>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: stationFleetKeys.all }); toast({ type: 'success', message: typeof message === 'function' ? message(r) : message }) },
    onError: (e) => { handleAppError(e, { scope: 'station-fleet' }); toast({ type: 'error', message: stationErrorMessage(e) }) },
  })
}

export const useVehicleCategories = (includeInactive = true) =>
  useQuery({ queryKey: stationFleetKeys.categories(), queryFn: () => stationFleet.categories(includeInactive), staleTime: 60_000 })
export const useSaveVehicleCategory = () => useAction(stationFleet.saveCategory, 'حُفظت الفئة')
export const useStationFleetCandidates = (search: string, onlyStation: boolean) =>
  useQuery({ queryKey: stationFleetKeys.candidates(search, onlyStation), queryFn: () => stationFleet.candidates(search, onlyStation) })
export const useSetStationVehicle = () =>
  useAction((x: { vehicleId: string; isStation: boolean }) => stationFleet.setStationVehicle(x.vehicleId, x.isStation), 'حُدّثت علامة آلية المحطة')
export const useStationFleet = () => useQuery({ queryKey: stationFleetKeys.fleet(), queryFn: () => stationFleet.fleet(), staleTime: 60_000 })
export const useStationDestinations = (includeInactive = false) =>
  useQuery({ queryKey: stationFleetKeys.destinations(includeInactive), queryFn: () => stationFleet.destinations(includeInactive), staleTime: 60_000 })
export const useSaveStationDestination = () => useAction(stationFleet.saveDestination, 'حُفظت الوجهة')
export const useStationExternalDrivers = () =>
  useQuery({ queryKey: stationFleetKeys.externalDrivers(), queryFn: () => stationFleet.externalDrivers() })
export const useSaveExternalDriver = () => useAction(stationFleet.saveExternalDriver, 'حُفظ السائق الخارجي')
export const useStationDrivers = () => useQuery({ queryKey: stationFleetKeys.drivers(), queryFn: () => stationFleet.drivers(), staleTime: 60_000 })
export const useStationRecordExit = () =>
  useAction((x: StationExitInput) => stationFleet.recordExit(x), (r: StationExitResult) =>
    r.tracking === 'gps'
      ? `سُجّل خروج ${r.category} إلى ${r.destination} — الوصول سيُسجَّل آلياً من GPS`
      : `سُجّل خروج ${r.category} إلى ${r.destination} — بلا تتبع (لا جهاز GPS مرتبط)`)
export const useStationOutbound = (from: string, to: string, onlyOpen = false, live = false) =>
  useQuery({ queryKey: stationFleetKeys.outbound(from, to, onlyOpen), queryFn: () => stationFleet.outbound(from, to, onlyOpen), refetchInterval: live ? 30_000 : false })

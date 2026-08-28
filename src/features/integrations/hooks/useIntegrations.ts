import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { integrationsKeys } from '@lib/query-keys/integrations.keys'
import { integrations } from '@sdk/integrations.sdk'
import { API } from '@lib/constants/api.constants'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { CreateDeviceInput, CreateVehicleInput } from '../types'

export function useDevices() {
  return useQuery({
    queryKey: integrationsKeys.devices(),
    queryFn: () => integrations.listDevices(),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useProviders() {
  return useQuery({
    queryKey: integrationsKeys.providers(),
    queryFn: () => integrations.listProviders(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

export function useVehicles() {
  return useQuery({
    queryKey: integrationsKeys.vehicles(),
    queryFn: () => integrations.listVehicles(),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useLatestPositions() {
  return useQuery({
    queryKey: integrationsKeys.positions(),
    queryFn: () => integrations.latestPositions(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useIntegrationLogs(provider?: string) {
  return useQuery({
    queryKey: integrationsKeys.logs(provider),
    queryFn: () => integrations.listLogs(provider),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateDevice() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateDeviceInput) => integrations.createDevice(input),
    onSuccess: (d) => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.devices() })
      addToast({ type: 'success', message: `سُجل الجهاز: ${d.name} (${d.serial_number})` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createDevice' }).message })
    },
  })
}

export function useToggleDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      integrations.setDeviceActive(id, active),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.devices() })
    },
  })
}

export function useCreateProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; type: 'traccar' | 'osmand' | 'custom_webhook' | 'vendor_api'; apiKey?: string }) =>
      integrations.createProvider(v.name, v.type, v.apiKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.providers() })
    },
  })
}

export function useCreateVehicle() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateVehicleInput) => integrations.createVehicle(input),
    onSuccess: (v) => {
      void queryClient.invalidateQueries({ queryKey: integrationsKeys.vehicles() })
      addToast({ type: 'success', message: `سُجلت المركبة: ${v.plate}` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createVehicle' }).message })
    },
  })
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalsKeys } from '@lib/query-keys/portals.keys'
import { portals } from '@sdk/portals.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { CreatePortalInput, AddUnitInput } from '../types'

export function usePortals() {
  return useQuery({
    queryKey: portalsKeys.lists(),
    queryFn: () => portals.list(),
  })
}

export function usePortalUnits(portalId?: string) {
  return useQuery({
    queryKey: portalsKeys.units(portalId),
    queryFn: () => portals.listUnits(portalId),
  })
}

export function useCreatePortal() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: (input: CreatePortalInput) => portals.create(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: portalsKeys.all })
      addToast({ type: 'success', message: `أُنشئت البوابة: ${created.name}` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createPortal' }).message })
    },
  })
}

export function useAddUnit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddUnitInput) => portals.addUnit(input),
    onSuccess: (_d, input) => {
      void queryClient.invalidateQueries({ queryKey: portalsKeys.units(input.portal_id) })
    },
  })
}

export function useRemoveUnit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (unitId: string) => portals.removeUnit(unitId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: portalsKeys.all })
    },
  })
}

export function useTogglePortal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      portals.setActive(id, active),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: portalsKeys.lists() })
    },
  })
}

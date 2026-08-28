import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { permissionsKeys } from '@lib/query-keys/permissions.keys'
import { permissions } from '@sdk/permissions.sdk'
import type { OverrideEffect, PermissionEffect } from '../types'

export function useRolePermissions() {
  return useQuery({
    queryKey: permissionsKeys.roleMatrix(),
    queryFn: () => permissions.listRolePermissions(),
  })
}

export function useUserOverrides() {
  return useQuery({
    queryKey: permissionsKeys.userOverrides(),
    queryFn: () => permissions.listUserOverrides(),
  })
}

export function useSetRoleEffect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ role, pageKey, effect }: { role: string; pageKey: string; effect: PermissionEffect | null }) =>
      permissions.setRoleEffect(role, pageKey, effect),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: permissionsKeys.roleMatrix() })
    },
  })
}

export function useSetUserOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { userId: string; pageKey: string; effect: OverrideEffect | null; reason?: string }) =>
      permissions.setUserOverride(v.userId, v.pageKey, v.effect, v.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: permissionsKeys.userOverrides() })
    },
  })
}

export function useCanSee(pageKey: string | undefined) {
  return useQuery({
    queryKey: permissionsKeys.canSee(pageKey ?? ''),
    queryFn: () => permissions.canSee(pageKey as string),
    enabled: !!pageKey,
    staleTime: 30_000,
  })
}

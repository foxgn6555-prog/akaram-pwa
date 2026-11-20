/** الجولة ٤ — مراقبة الدخول والجلسات (بوابة تكنولوجيا المعلومات) */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { security, type SecurityEventKind } from '@sdk/security.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export const securityKeys = {
  all: ['security'] as const,
  events: (event: SecurityEventKind | null) => [...securityKeys.all, 'events', event ?? 'all'] as const,
  policies: (search: string) => [...securityKeys.all, 'policies', search] as const,
}

export function useSecurityEvents(event: SecurityEventKind | null, enabled = true) {
  return useQuery({
    queryKey: securityKeys.events(event),
    queryFn: () => security.events({ event, limit: 200 }),
    enabled,
    staleTime: 10_000,
  })
}

export function useSessionPolicies(search: string, enabled = true) {
  return useQuery({
    queryKey: securityKeys.policies(search),
    queryFn: () => security.policyList(search || null),
    enabled,
    staleTime: 20_000,
  })
}

export function useSetSessionPolicy() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (vars: { userId: string; max: number; enforce: boolean }) =>
      security.setPolicy(vars.userId, vars.max, vars.enforce),
    onSuccess: (_d, vars) => {
      addToast({
        type: 'success',
        message: vars.enforce ? `حُفظ: الحد ${vars.max} جهاز ومفروض` : 'حُفظ: بلا فرض (لا يُمنع أي دخول)',
      })
      void queryClient.invalidateQueries({ queryKey: securityKeys.all })
    },
    onError: (error) => addToast({ type: 'error', message: handleAppError(error, { scope: 'sessionPolicy' }).message }),
  })
}

/** الجولة ٤ — مراقبة الدخول والجلسات (بوابة تكنولوجيا المعلومات) */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { security, type SecurityEventKind, type TimelineSource } from '@sdk/security.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export const securityKeys = {
  all: ['security'] as const,
  events: (event: SecurityEventKind | null) => [...securityKeys.all, 'events', event ?? 'all'] as const,
  policies: (search: string) => [...securityKeys.all, 'policies', search] as const,
  overview: (days: number) => [...securityKeys.all, 'overview', days] as const,
  timeline: (user: string | null, days: number, source: TimelineSource | null) =>
    [...securityKeys.all, 'timeline', user ?? 'all', days, source ?? 'all'] as const,
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

/** الجولة ٧ — بطاقات اللوحة الأمنية */
export function useSecurityOverview(days: number, enabled = true) {
  return useQuery({
    queryKey: securityKeys.overview(days),
    queryFn: () => security.overview(days),
    enabled,
    staleTime: 30_000,
  })
}

/** الجولة ٧ — السجل الموحّد (جلسات + صلاحيات + أدوار) */
export function useSecurityTimeline(
  params: { user?: string | null; days: number; source?: TimelineSource | null },
  enabled = true,
) {
  return useQuery({
    queryKey: securityKeys.timeline(params.user ?? null, params.days, params.source ?? null),
    queryFn: () => security.timeline({ user: params.user ?? null, days: params.days, source: params.source ?? null }),
    enabled,
    staleTime: 15_000,
  })
}

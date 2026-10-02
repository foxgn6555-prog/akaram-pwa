/**
 * Console · خطافات الواجهة: الخلاصة الحية + الإحصاءات + الحل.
 * الحيّ = بث Realtime على app_errors (إبطال فوري) + استطلاع كل 10 ثوانٍ كاحتياط.
 */
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { consoleKeys } from '@lib/query-keys/system.keys'
import { system, type ConsoleFeedFilters } from '@sdk/system.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export const CONSOLE_POLL_MS = 10_000

export function useConsoleFeed(filters: ConsoleFeedFilters = {}, enabled = true) {
  return useQuery({
    queryKey: consoleKeys.feed(filters as Record<string, unknown>),
    queryFn: () => system.consoleFeed(filters),
    staleTime: 5_000,
    refetchInterval: CONSOLE_POLL_MS,
    enabled,
  })
}

export function useConsoleStats(since: string | null = null) {
  return useQuery({
    queryKey: consoleKeys.stats(since),
    queryFn: () => system.consoleStats(since ?? undefined),
    staleTime: 5_000,
    refetchInterval: CONSOLE_POLL_MS,
  })
}

/** اشتراك حي واحد لكل صفحة — يُبطل كل استعلامات Console عند أي تغيير */
export function useConsoleLive(enabled = true) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    return system.consoleSubscribe(() => {
      void queryClient.invalidateQueries({ queryKey: consoleKeys.all })
    })
  }, [enabled, queryClient])
}

export function useConsoleResolve() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, resolved, note }: { id: number; resolved: boolean; note?: string | null }) =>
      system.consoleResolve(id, resolved, note),
    onSuccess: (_row, vars) => {
      addToast({ type: 'success', message: vars.resolved ? 'وُسم الخطأ كمحلول' : 'أُعيد فتح الخطأ' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'consoleResolve' }).message })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: consoleKeys.all })
    },
  })
}

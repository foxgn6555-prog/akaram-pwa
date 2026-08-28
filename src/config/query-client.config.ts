/** إعدادات TanStack Query v5 المركزية */
import { QueryClient } from '@tanstack/react-query'
import { API } from '@lib/constants/api.constants'
import { SDKError } from '@lib/errors/SDKError'
import { isNetworkError } from '@sdk/client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: API.STALE_TIME.DEFAULT,
        gcTime: API.GC_TIME,
        retry: (failureCount, error) => {
          if (error instanceof SDKError && !API.RETRY.isRetryable(statusOf(error))) return false
          if (isNetworkError(error)) return true // offline — أعِد حتى ينجح عند العودة
          return failureCount < API.RETRY.MAX_RETRIES
        },
        retryDelay: (attempt) => API.RETRY.BASE_DELAY_MS * 2 ** attempt,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false, // الطفرات لا تُعاد آلياً — الطابور Offline يتكفل (ADR 006)
      },
    },
  })
}

function statusOf(error: SDKError): number | undefined {
  const match = /\((\d{3})\)/.exec(error.message)
  return match ? Number(match[1]) : undefined
}

/** Singleton المعتمد — يستهلكه App.tsx والحارسات */
export const queryClient = createQueryClient()

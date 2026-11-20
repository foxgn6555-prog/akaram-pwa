/** الجولة ٣ — جلساتي: قراءة الأجهزة النشطة + إنهاء جلسة أو كل الجلسات الأخرى */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sessions, type MySession } from '@sdk/sessions.sdk'
import { authKeys } from '@lib/query-keys/auth.keys'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export const mySessionsKey = [...authKeys.all, 'my-sessions'] as const

export function useMySessions(enabled = true) {
  return useQuery<MySession[]>({
    queryKey: mySessionsKey,
    queryFn: () => sessions.list(),
    enabled,
    staleTime: 15_000,
  })
}

export function useCreateDeviceCode() {
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: () => sessions.createDeviceCode(),
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'deviceCode' }).message })
    },
  })
}

export function useEndSession() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: (sessionId: string) => sessions.end(sessionId),
    onSuccess: () => {
      addToast({ type: 'success', message: 'أُنهيت الجلسة — لن يستمر ذلك الجهاز بعد الآن' })
      void queryClient.invalidateQueries({ queryKey: mySessionsKey })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'endSession' }).message })
    },
  })
}

export function useEndOtherSessions() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: () => sessions.endOthers(),
    onSuccess: (count) => {
      addToast({
        type: 'success',
        message: count > 0 ? `أُنهيت ${count} جلسة أخرى — بقي هذا الجهاز فقط` : 'لا جلسات أخرى مفتوحة',
      })
      void queryClient.invalidateQueries({ queryKey: mySessionsKey })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'endOtherSessions' }).message })
    },
  })
}

/** useAuth — الجلسة من TanStack Query (سيرفر state)، لا Zustand إطلاقاً */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authKeys } from '@lib/query-keys/auth.keys'
import { auth, type SessionUser } from '@sdk/auth.sdk'
import { AuthError } from '@lib/errors/AuthError'
import { handleAppError } from '@lib/errors/error.handler'

export function useAuth() {
  return useQuery<SessionUser | null>({
    queryKey: authKeys.session(),
    queryFn: async () => {
      try {
        return await auth.getSession()
      } catch (error) {
        handleAppError(error, { scope: 'useAuth' })
        return null
      }
    },
    staleTime: 60_000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()

  return {
    mutateAsync: async (input: { email: string; password: string }): Promise<SessionUser> => {
        try {
          const user = await auth.login(input.email, input.password)
          void queryClient.invalidateQueries({ queryKey: authKeys.all })
          return user
        } catch (error) {
          // لا نسجل أخطاء بيانات الدخول أو أجسام الطلب في السجلات.
          if (error instanceof AuthError) throw error
          throw new AuthError('تعذر تسجيل الدخول — حاول مرة أخرى', 'AUTH_FAILED')
        }
      },
  }
}

export function useLogout() {
  const queryClient = useQueryClient()

  return {
    mutateAsync: async (): Promise<void> => {
      await auth.logout()
      queryClient.clear() // إفراغ كل الكاش عند الخروج — أمان
    },
  }
}

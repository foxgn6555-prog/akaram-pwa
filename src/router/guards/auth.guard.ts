/** حارس الجلسة — يتحقق من وجود session صالحة قبل دخول أي مسار محمي */
import { auth } from '@sdk/auth.sdk'
import { authKeys } from '@lib/query-keys/auth.keys'
import { queryClient } from '@config/query-client.config'

export interface AuthGuardResult {
  authenticated: boolean
  session: Awaited<ReturnType<typeof auth.getSession>> | null
}

export async function authGuard(): Promise<AuthGuardResult> {
  const session = await auth.getSession()

  if (session) {
    // املأ كاش الجلسة حتى تستهلكه useAuth فوراً بلا وميض تحميل
    queryClient.setQueryData(authKeys.session(), session)
    return { authenticated: true, session }
  }
  return { authenticated: false, session: null }
}

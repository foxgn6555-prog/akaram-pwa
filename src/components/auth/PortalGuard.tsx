import { Navigate } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from '@features/auth/hooks/useAuth'
import { hasRole } from '@lib/utils/permissions.utils'
import type { Role } from '@lib/constants/roles.constants'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

/** يتحقق من أدوار المستخدم ضد البوابة الحالية — الحكم النهائي دائماً RLS في DB */
export function PortalGuard({ allowedRoles, children }: { allowedRoles: readonly string[]; children: ReactNode }) {
  const { data: session, isLoading } = useAuth()

  if (isLoading) return <LoadingSpinner fullScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!hasRole(session.roles as Role[], ...(allowedRoles as Role[]))) {
    return <Navigate to="/403" replace />
  }

  return children
}

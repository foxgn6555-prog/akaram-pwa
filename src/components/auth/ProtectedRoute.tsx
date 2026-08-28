import { Navigate } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from '@features/auth/hooks/useAuth'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

/** يحمي أي مسار: بلا جلسة → login. الحارس الأدق (البوابة) هو PortalGuard */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useAuth()

  if (isLoading) return <LoadingSpinner fullScreen />
  if (!session) return <Navigate to="/login" replace />

  return children
}

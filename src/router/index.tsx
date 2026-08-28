/**
 * Router المركزي — React Router v7 (createBrowserRouter) + Lazy + Guards.
 * التسلسل: authGuard (جلسة) → portalGuard (بوابة) → صفحات البوابة.
 */
import { Suspense, lazy } from 'react'
import { createBrowserRouter, redirect, Outlet, Navigate } from 'react-router'
import { PUBLIC_ROUTES, PORTAL_ROUTES } from './routes.config'
import { authGuard } from './guards/auth.guard'
import { portalGuard } from './guards/portal.guard'
import { resolvePortal } from './portal.router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { ErrorBoundary } from '@components/feedback/ErrorBoundary'

const ForbiddenPage = lazy(() => import('@portals/public/pages/Forbidden/ForbiddenPage'))

export const router = createBrowserRouter([
  // ── الجذر: موجّه ذكي حسب الجلسة ──
  {
    path: '/',
    loader: async () => {
      const { authenticated, session } = await authGuard()
      if (!authenticated) return redirect('/login')
      const resolution = resolvePortal(session?.roles ?? [])
      if (resolution.type === 'single') return redirect(resolution.path)
      return redirect('/403')
    },
  },

  // ── المسارات العامة (تسجيل دخول/استعادة) ──
  ...PUBLIC_ROUTES.map((r) => ({
    path: r.path,
    element: (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <r.component />
        </Suspense>
      </ErrorBoundary>
    ),
  })),

  // ── البوابات المحمية ──
  ...PORTAL_ROUTES.map((p) => ({
    path: p.path,
    element: (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <p.shell />
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    ),
    loader: async () => {
      const { authenticated, session } = await authGuard()
      if (!authenticated) return redirect('/login')

      const decision = portalGuard(session, p.portal as Parameters<typeof portalGuard>[1])
      if (decision.decision === 'redirect' && decision.redirectTo) {
        return redirect(decision.redirectTo)
      }
      if (decision.decision === 'denied') return redirect('/403')
      return null
    },
    children: p.children ?? [],
  })),

  // 403 — دخول بوابة غير مصرح بها
  {
    path: '/403',
    element: (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <ForbiddenPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },

  // أي مسار غير معروف → الجذر الذكي (لا يقاطع جلسة قائمة بـ login مباشرة)
  { path: '*', element: <Navigate to="/" replace /> },
])


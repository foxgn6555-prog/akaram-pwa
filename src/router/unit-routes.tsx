/**
 * مولّد مسارات الوحدات — الإصلاح الجذري لثغرة إعادة التوجيه:
 * كل وحدة في الشريط الجانبي تحصل على Route فعلياً (صفحة حقيقية أو Placeholder)،
 * فلا يبقى أي رابط يسقط في wildcard {*} → لا عودة مفاجئة لصفحة الدخول.
 * البوابات ذات الصفحات الجاهزة تمرر customRoutes فتُستخدم بدل الـ Placeholder.
 */
import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { PORTAL_UNITS } from '@config/portals.config'
import type { PortalId } from '@lib/constants/portals.constants'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const UnitPlaceholder = lazy(() => import('@components/layout/UnitPlaceholder'))

function suspense(node: ReactNode): ReactNode {
  return <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
}

export function buildPortalRoutes(
  portal: PortalId,
  customRoutes: RouteObject[] = [],
): RouteObject[] {
  const portalPath = '/' + portal
  const units = PORTAL_UNITS[portal] ?? []

  const byRel = new Map<string, RouteObject>()
  for (const route of customRoutes) {
    if (route.path) byRel.set(route.path, route)
  }

  const children: RouteObject[] = []
  const covered = new Set<string>()

  const resolve = (absPath: string): RouteObject => {
    const rel = absPath === portalPath ? '' : absPath.slice(portalPath.length + 1)
    const custom = byRel.get(rel)
    if (custom?.element) {
      return { path: rel || undefined, index: rel === '', element: custom.element }
    }
    return {
      path: rel || undefined,
      index: rel === '',
      element: suspense(<UnitPlaceholder portal={portal} unitPath={absPath} />),
    }
  }

  for (const unit of units) {
    children.push(resolve(unit.path))
    covered.add(unit.path === portalPath ? '' : unit.path.slice(portalPath.length + 1))
    for (const child of unit.children ?? []) {
      const rel = child.path.slice(portalPath.length + 1)
      children.push(resolve(child.path))
      covered.add(rel)
    }
  }

  // مسارات مخصصة خارج الشريط (مثل صفحة التفاصيل :userId) — تُضاف كما هي
  for (const route of customRoutes) {
    if (route.path && !covered.has(route.path)) children.push(route)
  }

  // فهرس البوابة: أول وحدة (إلا إن كانت الوحدة الأولى هي الجذر — عندها صارت index أعلاه)
  const first = units[0]
  if (first && first.path !== portalPath && !children.some((c) => c.index)) {
    children.push({ index: true, element: <Navigate to={first.path} replace /> })
  }

  return children
}

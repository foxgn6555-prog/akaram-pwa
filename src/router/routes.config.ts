/**
 * تعريف كل المسارات مركزياً — مولّد الوحدات يضمن أن كل رابط في الشريط الجانبي
 * له صفحة فعلية في كل البوابات (القضاء على ثغرة wildcard → login).
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { RouteObject } from 'react-router'
import { PORTALS } from '@lib/constants/portals.constants'
import { buildPortalRoutes } from './unit-routes'
import { customRoutes as employeeRoutes } from '@portals/employee/routes'
import { customRoutes as hrRoutes } from '@portals/hr/routes'
import { customRoutes as managerRoutes } from '@portals/manager/routes'
import { customRoutes as financeRoutes } from '@portals/finance/routes'
import { customRoutes as itCustomRoutes } from '@portals/it/routes'
import { customRoutes as adminRoutes } from '@portals/admin/routes'
import { customRoutes as fieldOpsRoutes } from '@portals/field-ops/routes'
import { customRoutes as adminOpsRoutes } from '@portals/admin-ops/routes'
import { customRoutes as maintenanceRoutes } from '@portals/maintenance/routes'
import { customRoutes as transferStationRoutes } from '@portals/transfer-station/routes'
import { customRoutes as executiveRoutes } from '@portals/executive/routes'
import { customRoutes as deputyRoutes } from '@portals/deputy/routes'
import { customRoutes as opsRoomRoutes } from '@portals/ops-room/routes'
import { customRoutes as disclosuresRoutes } from '@portals/disclosures/routes'
import { customRoutes as complaintsRoutes } from '@portals/complaints/routes'
import { customRoutes as mediaRoutes } from '@portals/media/routes'
import { customRoutes as centralGarageRoutes } from '@portals/central-garage/routes'

// ── Public ──
const LoginPage = lazy(() => import('@portals/public/pages/Login/LoginPage'))
const ForgotPassword = lazy(() => import('@portals/public/pages/ForgotPassword/ForgotPassword'))
const ResetPassword = lazy(() => import('@portals/public/pages/ResetPassword/ResetPassword'))
const ForbiddenPage = lazy(() => import('@portals/public/pages/Forbidden/ForbiddenPage'))

// ── Portals shells ──
const EmployeePortal = lazy(() => import('@portals/employee/EmployeePortal'))
const HRPortal = lazy(() => import('@portals/hr/HRPortal'))
const ManagerPortal = lazy(() => import('@portals/manager/ManagerPortal'))
const FinancePortal = lazy(() => import('@portals/finance/FinancePortal'))
const ITPortal = lazy(() => import('@portals/it/ITPortal'))
const AdminPortal = lazy(() => import('@portals/admin/AdminPortal'))
const FieldOpsPortal = lazy(() => import('@portals/field-ops/FieldOpsPortal'))
const AdminOpsPortal = lazy(() => import('@portals/admin-ops/AdminOpsPortal'))
const MaintenancePortal = lazy(() => import('@portals/maintenance/MaintenancePortal'))
const TransferStationPortal = lazy(() => import('@portals/transfer-station/TransferStationPortal'))
const ExecutivePortal = lazy(() => import('@portals/executive/ExecutivePortal'))
const DeputyPortal = lazy(() => import('@portals/deputy/DeputyPortal'))
const OpsRoomPortal = lazy(() => import('@portals/ops-room/OpsRoomPortal'))
const DisclosuresPortal = lazy(() => import('@portals/disclosures/DisclosuresPortal'))
const ComplaintsPortal = lazy(() => import('@portals/complaints/ComplaintsPortal'))
const MediaPortal = lazy(() => import('@portals/media/MediaPortal'))
const CentralGaragePortal = lazy(() => import('@portals/central-garage/CentralGaragePortal'))

export interface PortalRouteConfig {
  portal: string
  path: string
  shell: LazyExoticComponent<ComponentType>
  allowedRoles: readonly string[]
  children: RouteObject[]
}

export const PORTAL_ROUTES: readonly PortalRouteConfig[] = [
  {
    portal: PORTALS.EMPLOYEE, path: '/employee', shell: EmployeePortal,
    allowedRoles: ['employee', 'super_admin'],
    children: buildPortalRoutes(PORTALS.EMPLOYEE, employeeRoutes),
  },
  {
    portal: PORTALS.HR, path: '/hr', shell: HRPortal,
    allowedRoles: ['hr_officer', 'super_admin'],   // HR فقط (+ إشراف الإدارة العليا)
    children: buildPortalRoutes(PORTALS.HR, hrRoutes),
  },
  {
    portal: PORTALS.MANAGER, path: '/manager', shell: ManagerPortal,
    allowedRoles: ['department_manager', 'super_admin'],   // المدير فقط
    children: buildPortalRoutes(PORTALS.MANAGER, managerRoutes),
  },
  {
    portal: PORTALS.FINANCE, path: '/finance', shell: FinancePortal,
    allowedRoles: ['finance_officer', 'super_admin'],   // المالية فقط
    children: buildPortalRoutes(PORTALS.FINANCE, financeRoutes),
  },
  {
    portal: PORTALS.IT, path: '/it', shell: ITPortal,
    allowedRoles: ['it_admin', 'super_admin'],   // IT فقط
    children: buildPortalRoutes(PORTALS.IT, itCustomRoutes),
  },
  {
    portal: PORTALS.ADMIN, path: '/admin', shell: AdminPortal,
    allowedRoles: ['super_admin'],
    children: buildPortalRoutes(PORTALS.ADMIN, adminRoutes),
  },
  // ── البوابات السبع الجديدة (هيكل جاهز — صفحة رئيسية Placeholder فقط) ──
  {
    portal: PORTALS.FIELD_OPS, path: '/field-ops', shell: FieldOpsPortal,
    allowedRoles: ['field_ops', 'super_admin'],
    children: buildPortalRoutes(PORTALS.FIELD_OPS, fieldOpsRoutes),
  },
  {
    portal: PORTALS.ADMIN_OPS, path: '/admin-ops', shell: AdminOpsPortal,
    allowedRoles: ['admin_ops', 'super_admin'],
    children: buildPortalRoutes(PORTALS.ADMIN_OPS, adminOpsRoutes),
  },
  {
    portal: PORTALS.MAINTENANCE, path: '/maintenance', shell: MaintenancePortal,
    allowedRoles: ['maintenance', 'super_admin'],
    children: buildPortalRoutes(PORTALS.MAINTENANCE, maintenanceRoutes),
  },
  {
    portal: PORTALS.TRANSFER_STATION, path: '/transfer-station', shell: TransferStationPortal,
    allowedRoles: ['transfer_station', 'super_admin'],
    children: buildPortalRoutes(PORTALS.TRANSFER_STATION, transferStationRoutes),
  },
  {
    portal: PORTALS.EXECUTIVE, path: '/executive', shell: ExecutivePortal,
    allowedRoles: ['executive_director', 'super_admin'],
    children: buildPortalRoutes(PORTALS.EXECUTIVE, executiveRoutes),
  },
  {
    portal: PORTALS.DEPUTY, path: '/deputy', shell: DeputyPortal,
    allowedRoles: ['deputy_director', 'super_admin'],
    children: buildPortalRoutes(PORTALS.DEPUTY, deputyRoutes),
  },
  {
    portal: PORTALS.OPS_ROOM, path: '/ops-room', shell: OpsRoomPortal,
    allowedRoles: ['ops_room', 'super_admin'],
    children: buildPortalRoutes(PORTALS.OPS_ROOM, opsRoomRoutes),
  },
  {
    portal: PORTALS.DISCLOSURES, path: '/disclosures', shell: DisclosuresPortal,
    allowedRoles: ['disclosures_officer', 'super_admin'],
    children: buildPortalRoutes(PORTALS.DISCLOSURES, disclosuresRoutes),
  },
  {
    portal: PORTALS.COMPLAINTS, path: '/complaints', shell: ComplaintsPortal,
    allowedRoles: ['complaints_officer', 'super_admin'],
    children: buildPortalRoutes(PORTALS.COMPLAINTS, complaintsRoutes),
  },
  {
    portal: PORTALS.MEDIA, path: '/media', shell: MediaPortal,
    allowedRoles: ['media_officer', 'super_admin'],
    children: buildPortalRoutes(PORTALS.MEDIA, mediaRoutes),
  },
  {
    portal: PORTALS.CENTRAL_GARAGE, path: '/central-garage', shell: CentralGaragePortal,
    allowedRoles: ['central_garage_officer', 'super_admin'],
    children: buildPortalRoutes(PORTALS.CENTRAL_GARAGE, centralGarageRoutes),
  },
] as const

export const PUBLIC_ROUTES = [
  { path: '/login', component: LoginPage },
  { path: '/forgot-password', component: ForgotPassword },
  { path: '/reset-password', component: ResetPassword },
  { path: '/403', component: ForbiddenPage },
] as const

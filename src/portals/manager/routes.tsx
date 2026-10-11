/** مسارات بوابة مسؤول القسم (قواطع/شفتات) — كل صفحة ملف مستقل داخل هذا المجلد */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ManagerDashboard = lazy(() => import('./pages/Dashboard/ManagerDashboard'))
const TeamPage = lazy(() => import('./pages/Team/TeamPage'))
const NewRequestPage = lazy(() => import('./pages/Request/NewRequestPage'))
const BreakdownPage = lazy(() => import('./pages/Breakdown/BreakdownPage'))
const PhotosPage = lazy(() => import('./pages/Photos/PhotosPage'))
const ArchivePage = lazy(() => import('./pages/Archive/ArchivePage'))
const AssignedComplaintsPage = lazy(() => import('./pages/Complaints/AssignedComplaintsPage'))
const ComplaintTicketPage = lazy(() => import('./pages/Complaints/ComplaintTicketPage'))
const ComplaintsGuidancePage = lazy(() => import('./pages/Complaints/ComplaintsGuidancePage'))
const VehicleTripsPage = lazy(() => import('./pages/VehicleTrips/VehicleTripsPage'))
const GbsContainersPage = lazy(() => import('./pages/Gbs/GbsContainersPage'))
const TeamLeavesPage = lazy(() => import('./pages/Leaves/TeamLeavesPage'))
const SupportRequestsPage = lazy(() => import('./pages/Support/SupportRequestsPage'))
const ManagerCitizenComplaintsPage = lazy(() => import('./pages/CitizenComplaints/ManagerCitizenComplaintsPage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<ManagerDashboard />) },
  { path: 'team', element: s(<TeamPage />) },
  { path: 'request', element: s(<NewRequestPage />) },
  { path: 'leaves', element: s(<TeamLeavesPage />) },
  { path: 'breakdown', element: s(<BreakdownPage />) },
  { path: 'vehicle-trips', element: s(<VehicleTripsPage />) },
  { path: 'support', element: s(<SupportRequestsPage />) },
  { path: 'gbs-containers', element: s(<GbsContainersPage />) },
  { path: 'citizen-complaints', element: s(<ManagerCitizenComplaintsPage />) },
  { path: 'complaints', element: s(<AssignedComplaintsPage />) },
  { path: 'complaints/:complaintId', element: s(<ComplaintTicketPage />) },
  { path: 'complaints-guidance', element: s(<ComplaintsGuidancePage />) },
  { path: 'photos', element: s(<PhotosPage />) },
  { path: 'archive', element: s(<ArchivePage />) },
]

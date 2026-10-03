import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
const Dashboard = lazy(() => import('./pages/Dashboard/OpsRoomDashboardPage'))
const Reports = lazy(() => import('./pages/OperationsData/OperationsDataPage'))
const StationDaily = lazy(() => import('./pages/StationDaily/StationDailyReportPage'))
const Gps = lazy(() => import('./pages/Gps/GpsDataPage'))
const GbsContainers = lazy(() => import('./pages/Gbs/GbsContainersPage'))
const OpsAttendance = lazy(() => import('./pages/Attendance/OpsAttendancePage'))
const OpsStore = lazy(() => import('./pages/Store/OpsStorePage'))
const OpsCampaigns = lazy(() => import('./pages/Campaigns/OpsCampaignsPage'))   // 00164: متابعة الحملات
const OpsCitizenComplaints = lazy(() => import('./pages/CitizenComplaints/OpsCitizenComplaintsPage'))   // 00168: استقبال الشكاوى
const OpsDisclosures = lazy(() => import('./pages/Disclosures/OpsDisclosuresPage'))   // 00170: وحدة الكشوفات
const FleetDatabase = lazy(() =>
  import('@portals/central-garage/pages/VehiclesDatabasePage').then((module) => ({
    default: () => <module.default managementMode />,
  })),
)
const FleetDetail = lazy(() =>
  import('@portals/central-garage/pages/VehicleDetailPage').then((module) => ({
    default: () => <module.default managementMode />,
  })),
)
const FleetArchive = lazy(() =>
  import('@portals/central-garage/pages/GarageArchivePage').then((module) => ({
    default: () => <module.default managementMode />,
  })),
)
const load = (page: ReactNode) => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{page}</Suspense>
)
export const customRoutes: RouteObject[] = [
  { path: '', element: load(<Dashboard />) },
  { path: 'operations-data', element: load(<Reports />) },
  { path: 'station-daily', element: load(<StationDaily />) },
  { path: 'vehicles-database', element: load(<FleetDatabase />) },
  { path: 'vehicles-database/:vehicleId', element: load(<FleetDetail />) },
  { path: 'vehicles-archive', element: load(<FleetArchive />) },
  { path: 'gps', element: load(<Gps />) },
  { path: 'gbs-containers', element: load(<GbsContainers />) },
  { path: 'attendance', element: load(<OpsAttendance />) },
  { path: 'store', element: load(<OpsStore />) },
  { path: 'campaigns', element: load(<OpsCampaigns />) },
  { path: 'citizen-complaints', element: load(<OpsCitizenComplaints />) },
  { path: 'disclosures', element: load(<OpsDisclosures />) },
]

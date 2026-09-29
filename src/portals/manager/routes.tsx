/** مسارات بوابة مسؤول القسم (قواطع/شفتات) — كل صفحة ملف مستقل داخل هذا المجلد */
import type { RouteObject } from 'react-router'
import ManagerDashboard from './pages/Dashboard/ManagerDashboard'
import TeamPage from './pages/Team/TeamPage'
import NewRequestPage from './pages/Request/NewRequestPage'
import BreakdownPage from './pages/Breakdown/BreakdownPage'
import PhotosPage from './pages/Photos/PhotosPage'
import ArchivePage from './pages/Archive/ArchivePage'
import AssignedComplaintsPage from './pages/Complaints/AssignedComplaintsPage'
import ComplaintTicketPage from './pages/Complaints/ComplaintTicketPage'
import ComplaintsGuidancePage from './pages/Complaints/ComplaintsGuidancePage'
import VehicleTripsPage from './pages/VehicleTrips/VehicleTripsPage'
import GbsContainersPage from './pages/Gbs/GbsContainersPage'
import TeamLeavesPage from './pages/Leaves/TeamLeavesPage'
import SupportRequestsPage from './pages/Support/SupportRequestsPage'

export const customRoutes: RouteObject[] = [
  { path: '', element: <ManagerDashboard /> },
  { path: 'team', element: <TeamPage /> },
  { path: 'request', element: <NewRequestPage /> },
  { path: 'leaves', element: <TeamLeavesPage /> },
  { path: 'breakdown', element: <BreakdownPage /> },
  { path: 'vehicle-trips', element: <VehicleTripsPage /> },
  { path: 'support', element: <SupportRequestsPage /> },
  { path: 'gbs-containers', element: <GbsContainersPage /> },
  { path: 'complaints', element: <AssignedComplaintsPage /> },
  { path: 'complaints/:complaintId', element: <ComplaintTicketPage /> },
  { path: 'complaints-guidance', element: <ComplaintsGuidancePage /> },
  { path: 'photos', element: <PhotosPage /> },
  { path: 'archive', element: <ArchivePage /> },
]

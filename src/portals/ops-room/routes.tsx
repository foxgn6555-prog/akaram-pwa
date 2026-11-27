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
const OpsRentedAttendance = lazy(() => import('./pages/RentedAttendance/OpsRentedAttendancePage'))   // 20261203000100
const OpsStore = lazy(() => import('./pages/Store/OpsStorePage'))
const OpsCampaigns = lazy(() => import('./pages/Campaigns/OpsCampaignsPage'))   // 00164: متابعة الحملات
const OpsCitizenComplaints = lazy(() => import('./pages/CitizenComplaints/OpsCitizenComplaintsPage'))   // 00168: استقبال الشكاوى
const OpsDisclosures = lazy(() => import('./pages/Disclosures/OpsDisclosuresPage'))   // 00170: وحدة الكشوفات
const OpsAdvances = lazy(() => import('./pages/Advances/OpsAdvancesPage'))   // 00191: السلف
const OpsContractorHeadcounts = lazy(() => import('./pages/ContractorHeadcounts/OpsContractorHeadcountsPage'))   // 00262: حضوريات العمال
const OpsContractorProofs = lazy(() => import('./pages/ContractorProofs/OpsContractorPresenceProofsPage'))   // إثباتات التواجد — قراءة فقط
const OpsLeaves = lazy(() => import('./pages/Leaves/OpsLeavesPage'))   // 00239: طلبات الإجازة
const OpsLiveTracking = lazy(() => import('./pages/LiveTracking/OpsLiveTrackingPage'))   // 00287: البث المباشر
const OpsLiveData = lazy(() => import('./pages/LiveTracking/OpsLiveDataPage'))   // 00288: بيانات البث المباشر
const OpsWasteMap = lazy(() => import('./pages/WasteMap/OpsWasteMapPage'))   // 00384: خريطة النفايات (بقع التوقف)
// 20261122000600: التخطيط الجغرافي — محرّر وجدول
const MapPlanningEditor = lazy(() => import('./pages/MapPlanning/OpsMapPlanningEditorPage'))
const MapPlanningTable = lazy(() => import('./pages/MapPlanning/OpsMapPlanningTablePage'))
const MapVisits = lazy(() => import('./pages/MapPlanning/OpsMapVisitsPage'))
const MapCoverage = lazy(() => import('./pages/MapPlanning/OpsMapCoveragePage'))
const MapVehicleVisits = lazy(() => import('./pages/MapPlanning/OpsMapVehicleVisitsPage'))
const MapImport = lazy(() => import('./pages/MapPlanning/OpsMapImportPage'))   // الجولة ①: استيراد OSM
const MapGroupedReport = lazy(() => import('./pages/MapPlanning/OpsMapGroupedReportPage'))   // 20261127000200: التقرير المعتمد (الأزقة المزارة)
const OpsStationFleet = lazy(() => import('./pages/StationFleet/OpsStationFleetPage'))   // 00329: أسطول المحطة التحويلية
const OpsStationOutbound = lazy(() => import('./pages/StationFleet/OpsStationOutboundPage'))   // 00331: متابعة خروج آليات المحطة
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
  { path: 'station-fleet', element: load(<OpsStationFleet />) },
  { path: 'station-outbound', element: load(<OpsStationOutbound />) },
  { path: 'vehicles-database', element: load(<FleetDatabase />) },
  { path: 'vehicles-database/:vehicleId', element: load(<FleetDetail />) },
  { path: 'vehicles-archive', element: load(<FleetArchive />) },
  { path: 'gps', element: load(<Gps />) },
  { path: 'gbs-containers', element: load(<GbsContainers />) },
  { path: 'attendance', element: load(<OpsAttendance />) },
  { path: 'rented-attendance', element: load(<OpsRentedAttendance />) },   // 20261203000400: حضوريات الآليات المؤجرة
  { path: 'store', element: load(<OpsStore />) },
  { path: 'campaigns', element: load(<OpsCampaigns />) },
  { path: 'citizen-complaints', element: load(<OpsCitizenComplaints />) },
  { path: 'disclosures', element: load(<OpsDisclosures />) },
  { path: 'advances', element: load(<OpsAdvances />) },
  { path: 'contractor-headcounts', element: load(<OpsContractorHeadcounts />) },
  { path: 'contractor-proofs', element: load(<OpsContractorProofs />) },
  { path: 'leaves', element: load(<OpsLeaves />) },
  { path: 'live-tracking', element: load(<OpsLiveTracking />) },
  { path: 'live-tracking/data', element: load(<OpsLiveData />) },
  { path: 'waste-map', element: load(<OpsWasteMap />) },
  { path: 'map-planning', element: load(<MapPlanningEditor />) },
  { path: 'map-planning/table', element: load(<MapPlanningTable />) },
  { path: 'map-planning/visits', element: load(<MapVisits />) },
  { path: 'map-planning/coverage', element: load(<MapCoverage />) },
  { path: 'map-planning/vehicle-visits', element: load(<MapVehicleVisits />) },
  { path: 'map-planning/import', element: load(<MapImport />) },
  { path: 'map-planning/grouped-report', element: load(<MapGroupedReport />) },
]

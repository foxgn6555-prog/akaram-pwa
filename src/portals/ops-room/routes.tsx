import{lazy,Suspense,type ReactNode}from'react'
import type{RouteObject}from'react-router'
import{LoadingSpinner}from'@components/feedback/LoadingSpinner'
const Dashboard=lazy(()=>import('./pages/Dashboard/OpsRoomDashboardPage'))
const Reports=lazy(()=>import('./pages/OperationsData/OperationsDataPage'))
const load=(page:ReactNode)=><Suspense fallback={<LoadingSpinner fullScreen/>}>{page}</Suspense>
export const customRoutes:RouteObject[]=[{path:'',element:load(<Dashboard/>)},{path:'operations-data',element:load(<Reports/>)}]

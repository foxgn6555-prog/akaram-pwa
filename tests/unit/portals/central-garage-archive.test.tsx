import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h=vi.hoisted(()=>({filter:vi.fn(),restore:vi.fn(),vehicle:{id:'v9',vehicleName:'آلية مؤرشفة',dbNumber:'DB-9',plateNumber:'P9',chassisNumber:'CH-9',imagePath:'u/9.jpg',imageUrl:'https://img/9.jpg',shift:'night',driverName:'سائق سابق',sectorId:8,areaName:'الوليد',parentSector:'zaafaraniya',createdAt:'2026-01-01T08:00:00Z',updatedAt:'2026-09-08T08:00:00Z',archivedAt:'2026-09-08T08:00:00Z',archivedBy:'u1',archiveReason:'خروج من الخدمة'}}))
vi.mock('@features/central-garage/hooks',()=>({
  useGarageAreas:()=>({data:[{id:8,name:'الوليد',parentSector:'zaafaraniya',sort:8}],isLoading:false}),
  useGarageVehicles:(filter:unknown)=>{h.filter(filter);return{data:{rows:[h.vehicle],totalCount:1},isLoading:false,isError:false}},
  useGarageVehicle:()=>({data:h.vehicle,isLoading:false,isError:false}),useGarageAssignments:()=>({data:[],isLoading:false}),useGarageVehicleMovements:()=>({data:[],isLoading:false}),
  useArchiveGarageVehicle:()=>({mutate:vi.fn(),isPending:false}),useRestoreGarageVehicle:()=>({mutate:h.restore,isPending:false}),useUpdateGarageVehicle:()=>({mutate:vi.fn(),isPending:false,isError:false}),useAssignGarageDriver:()=>({mutate:vi.fn(),isPending:false}),
}))
import GarageArchivePage from '@portals/central-garage/pages/GarageArchivePage'
import VehicleDetailPage from '@portals/central-garage/pages/VehicleDetailPage'
const renderPage=(node:React.ReactNode,path='/')=>render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={node}/></Routes></MemoryRouter>)

describe('أرشيف آليات الكراج',()=>{
  beforeEach(()=>{h.filter.mockClear();h.restore.mockReset()})
  it('يعرض الآليات المؤرشفة مع السبب والتوقيت ويمرر فلاتر الأرشيف',async()=>{
    renderPage(<GarageArchivePage/>);expect(screen.getByTestId('archived-vehicle-v9')).toHaveTextContent('خروج من الخدمة');expect(h.filter).toHaveBeenCalledWith(expect.objectContaining({archived:true,pageSize:24}));fireEvent.change(screen.getByTestId('archive-search'),{target:{value:'DB-9'}});fireEvent.change(screen.getByTestId('archive-area'),{target:{value:'8'}});fireEvent.change(screen.getByTestId('archive-shift'),{target:{value:'night'}});await waitFor(()=>expect(h.filter).toHaveBeenLastCalledWith(expect.objectContaining({archived:true,search:'DB-9',sectorId:8,shift:'night'})))
  })
  it('يعرض تفاصيل المؤرشفة ويمنع الاستعادة بلا سبب ثم يعيد تفعيلها',()=>{
    renderPage(<VehicleDetailPage/>,'/central-garage/vehicles-database/v9');expect(screen.getByText('هذه الآلية مؤرشفة')).toBeInTheDocument();expect(screen.queryByTestId('detail-change-assignment')).not.toBeInTheDocument();fireEvent.click(screen.getByTestId('open-restore-vehicle'));expect(screen.getByTestId('restore-submit')).toBeDisabled();fireEvent.change(screen.getByTestId('restore-reason'),{target:{value:'إعادتها إلى الخدمة'}});fireEvent.click(screen.getByTestId('restore-submit'));expect(h.restore).toHaveBeenCalledWith({vehicleId:'v9',reason:'إعادتها إلى الخدمة'},expect.objectContaining({onSuccess:expect.any(Function)}))
  })
})

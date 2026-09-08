import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h=vi.hoisted(()=>({
  createMutate:vi.fn(),updateMutate:vi.fn(),assignMutate:vi.fn(),archiveMutate:vi.fn(),restoreMutate:vi.fn(),vehicleFilter:vi.fn(),vehicleIdParam:vi.fn(),vehicleIdParam2:vi.fn(),
  recordDeparture:vi.fn(),recordReturn:vi.fn(),
  areas:[
    {id:1,name:'أرخيته',parentSector:'karrada',sort:1},{id:2,name:'الرياض',parentSector:'karrada',sort:2},{id:3,name:'الواثق',parentSector:'karrada',sort:3},{id:4,name:'الجادرية',parentSector:'karrada',sort:4},
    {id:5,name:'السندباد',parentSector:'zaafaraniya',sort:5},{id:6,name:'الزعفرانية',parentSector:'zaafaraniya',sort:6},{id:7,name:'ديالى',parentSector:'zaafaraniya',sort:7},{id:8,name:'الوليد',parentSector:'zaafaraniya',sort:8},
  ],
  vehicle:{id:'v1',vehicleName:'كابسة نفايات',dbNumber:'DB-100',plateNumber:'بغداد 123',chassisNumber:'CH-100',imagePath:'u/v.jpg',imageUrl:'https://img/v.jpg',shift:'morning',driverName:'علي حسن',sectorId:1,areaName:'أرخيته',parentSector:'karrada',createdAt:'2026-09-08T08:00:00Z',updatedAt:'2026-09-08T08:00:00Z',archivedAt:null},
  departure:{id:'d1',vehicleId:'v1',driverName:'علي حسن',shift:'morning',sectorId:1,departedAt:'2026-09-08T07:30:00Z',returnedAt:null,notes:null,vehicleName:'كابسة نفايات',dbNumber:'DB-100',imagePath:'u/v.jpg',areaName:'أرخيته',parentSector:'karrada'},
  departures:[] as Array<Record<string, unknown>>,
}))

vi.mock('@features/central-garage/hooks',()=>({
  useGarageAreas:()=>({data:h.areas,isLoading:false}),
  useGarageVehicles:(filter:unknown)=>{h.vehicleFilter(filter);return{data:{rows:[h.vehicle],totalCount:1},isLoading:false,isError:false}},
  useCreateGarageVehicle:()=>({mutate:h.createMutate,isPending:false,isError:false}),
  useUpdateGarageVehicle:()=>({mutate:h.updateMutate,isPending:false,isError:false}),
  useRestoreGarageVehicle:()=>({mutate:h.restoreMutate,isPending:false,isError:false}),
  useAssignGarageDriver:()=>({mutate:h.assignMutate,isPending:false}),
  useArchiveGarageVehicle:()=>({mutate:h.archiveMutate,isPending:false}),
  useGarageVehicle:(id:string)=>{h.vehicleIdParam(id);return{data:h.vehicle,isLoading:false,isError:false}},
  useGarageAssignments:()=>({data:[{id:'a1',vehicleId:'v1',driverName:'علي حسن',shift:'morning',sectorId:1,startsAt:'2026-09-08T08:00:00Z',endsAt:null,changeReason:null}],isLoading:false}),
  useGarageVehicleMovements:()=>({data:[{id:'m1',tankId:'t1',vehicleId:'v1',movementType:'vehicle_fill',quantity:-40,quantityBefore:200,quantityAfter:160,nextRefillDate:'2026-09-20',notes:null,actorId:'u1',createdAt:'2026-09-08T09:00:00Z'}],isLoading:false}),
  useGarageDepartures:()=>({data:h.departures,isLoading:false}),
  useRecordGarageDeparture:()=>({mutate:h.recordDeparture,isPending:false}),
  useRecordGarageReturn:()=>({mutate:h.recordReturn,isPending:false}),
}))

import VehiclesDatabasePage from '@portals/central-garage/pages/VehiclesDatabasePage'
import DriversDispatchPage from '@portals/central-garage/pages/DriversDispatchPage'
import VehicleDetailPage from '@portals/central-garage/pages/VehicleDetailPage'

beforeEach(()=>{h.createMutate.mockReset();h.updateMutate.mockReset();h.assignMutate.mockReset();h.archiveMutate.mockReset();h.restoreMutate.mockReset();h.vehicleFilter.mockClear();h.vehicleIdParam.mockClear();h.recordDeparture.mockReset();h.recordReturn.mockReset();h.departures=[];Object.defineProperty(URL,'createObjectURL',{value:vi.fn(()=> 'blob:preview'),configurable:true});Object.defineProperty(URL,'revokeObjectURL',{value:vi.fn(),configurable:true})})
const renderPage=(node:React.ReactNode,path='/')=>render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={node}/></Routes></MemoryRouter>)
/** يعرض صفحة التفاصيل عبر المسار الحقيقي المعتمد بارامتر vehicleId — يكشف أي اختلال في اسم البارامتر. */
const renderDetail=()=>render(<MemoryRouter initialEntries={['/central-garage/vehicles-database/v1']}><Routes><Route path="/central-garage/vehicles-database/:vehicleId" element={<VehicleDetailPage/>}/></Routes></MemoryRouter>)

describe('قاعدة بيانات آليات الكراج',()=>{
  it('يعرض الآلية كتذكرة ملونة بالمعلومات الأساسية ورابط التفاصيل',()=>{
    renderPage(<VehiclesDatabasePage/>);expect(screen.getByTestId('vehicle-card-v1')).toBeInTheDocument();expect(screen.getByText('كابسة نفايات')).toBeInTheDocument();expect(screen.getByText('علي حسن')).toBeInTheDocument();expect(screen.getByText(/قاطع الكرادة/)).toBeInTheDocument();expect(screen.getByRole('link',{name:/كابسة نفايات/})).toHaveAttribute('href','/central-garage/vehicles-database/v1')
  })

  it('يوفر البحث وفلاتر المنطقة والشفت دون عرض قائمة فوضوية',async()=>{
    renderPage(<VehiclesDatabasePage/>);fireEvent.change(screen.getByTestId('vehicle-search'),{target:{value:'DB-100'}});fireEvent.change(screen.getByTestId('vehicle-area-filter'),{target:{value:'1'}});fireEvent.change(screen.getByTestId('vehicle-shift-filter'),{target:{value:'night'}});await waitFor(()=>expect(h.vehicleFilter).toHaveBeenLastCalledWith(expect.objectContaining({search:'DB-100',sectorId:1,shift:'night',pageSize:24})))
  })

  it('يتحقق من كل حقول إضافة الآلية ثم يرسل الصورة والقاطع والشفت',()=>{
    renderPage(<VehiclesDatabasePage/>);fireEvent.click(screen.getByTestId('open-add-vehicle'));fireEvent.click(screen.getByTestId('vehicle-submit'));expect(screen.getByText('اسم السيارة مطلوب')).toBeInTheDocument();expect(screen.getByText('صورة الآلية مطلوبة')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('vehicle-name'),{target:{value:'كابسة جديدة'}});fireEvent.change(screen.getByTestId('vehicle-db'),{target:{value:'DB-200'}});fireEvent.change(screen.getByTestId('vehicle-plate'),{target:{value:'بغداد 200'}});fireEvent.change(screen.getByTestId('vehicle-chassis'),{target:{value:'CH-200'}});fireEvent.change(screen.getByTestId('vehicle-driver'),{target:{value:'حسن كريم'}});fireEvent.change(screen.getByTestId('vehicle-shift'),{target:{value:'night'}});fireEvent.change(screen.getByTestId('vehicle-area'),{target:{value:'8'}});const file=new File(['x'],'vehicle.png',{type:'image/png'});fireEvent.change(screen.getByTestId('vehicle-image'),{target:{files:[file]}});fireEvent.click(screen.getByTestId('vehicle-submit'));expect(h.createMutate).toHaveBeenCalledWith(expect.objectContaining({vehicleName:'كابسة جديدة',dbNumber:'DB-200',shift:'night',sectorId:8,image:file}),expect.objectContaining({onSuccess:expect.any(Function)}))
  })
})

describe('انطلاقية السائقين وتفاصيل الآلية',()=>{
  it('تعرض الانطلاقية الحالية وتسمح بتغيير السائق والشفت والموقع',()=>{
    renderPage(<DriversDispatchPage/>);expect(screen.getByTestId('dispatch-row-v1')).toHaveTextContent('علي حسن');expect(screen.getByTestId('dispatch-row-v1')).toHaveTextContent('DB-100');fireEvent.click(screen.getByTestId('change-assignment-v1'));fireEvent.change(screen.getByTestId('assignment-driver'),{target:{value:'سائق جديد'}});fireEvent.change(screen.getByTestId('assignment-shift'),{target:{value:'evening'}});fireEvent.change(screen.getByTestId('assignment-area'),{target:{value:'6'}});fireEvent.change(screen.getByTestId('assignment-reason'),{target:{value:'تبديل موقع'}});fireEvent.click(screen.getByTestId('assignment-submit'));expect(h.assignMutate).toHaveBeenCalledWith({vehicleId:'v1',driverName:'سائق جديد',shift:'evening',sectorId:6,reason:'تبديل موقع'},expect.objectContaining({onSuccess:expect.any(Function)}))
  })

  it('بدون انطلاقات: يعرض «لم تسجل انطلاقاً» وزر تسجيل انطلاق من الكراج',()=>{
    renderPage(<DriversDispatchPage/>);expect(screen.getByTestId('departure-state-pending')).toBeInTheDocument();expect(screen.getByText('لم تنطلق بعد')).toBeInTheDocument();fireEvent.click(screen.getByTestId('depart-v1'));expect(h.recordDeparture).toHaveBeenCalledWith({vehicleId:'v1'})
  })

  it('انطلاقة مفتوحة: يظهر «في الميدان» وزر تسجيل عودة إلى الكراج',()=>{
    h.departures=[h.departure];renderPage(<DriversDispatchPage/>);expect(screen.getByTestId('departure-state-field')).toBeInTheDocument();expect(screen.getByTestId('dispatch-row-v1')).toHaveTextContent('في الميدان');expect(screen.queryByTestId('depart-v1')).not.toBeInTheDocument();fireEvent.click(screen.getByTestId('return-v1'));expect(h.recordReturn).toHaveBeenCalledWith({departureId:'d1'})
  })

  it('انطلاقة مغلقة اليوم: يعرض «عادت إلى الكراج» مع زر انطلاق جديد',()=>{
    h.departures=[{...h.departure,returnedAt:'2026-09-08T15:30:00Z'}];renderPage(<DriversDispatchPage/>);expect(screen.getByTestId('departure-state-returned')).toBeInTheDocument();expect(screen.getByTestId('depart-v1')).toBeInTheDocument()
  })

  it('يعرض الصورة وشارة DB في بطاقة الآلية',()=>{
    renderPage(<VehiclesDatabasePage/>);expect(screen.getByTestId('vehicle-card-v1')).toHaveTextContent('DB-100');expect(screen.getByTestId('vehicle-card-v1').querySelector('img')).not.toBeNull()
  })

  it('يمرر بارامتر المسار vehicleId إلى استعلام التفاصيل (عقد المسار ↔ الصفحة)',()=>{
    renderDetail();expect(h.vehicleIdParam).toHaveBeenCalledWith('v1');expect(screen.getByTestId('vehicle-detail-page')).toBeInTheDocument()
  })

  it('تعرض صفحة التفاصيل والسجل والموعد التالي للتعبئة',()=>{
    renderPage(<VehicleDetailPage/>,'/central-garage/vehicles-database/v1');expect(screen.getByTestId('vehicle-detail-page')).toHaveTextContent('CH-100');expect(screen.getByTestId('vehicle-detail-page')).toHaveTextContent('سجل الانطلاقية');expect(screen.getByTestId('vehicle-detail-page')).toHaveTextContent('2026-09-20');expect(screen.getByText('الحالي')).toBeInTheDocument()
  })

  it('يعدل بيانات الآلية الأساسية دون تغيير الإسناد التاريخي',()=>{
    renderPage(<VehicleDetailPage/>,'/central-garage/vehicles-database/v1');fireEvent.click(screen.getByTestId('open-edit-vehicle'));expect(screen.getByTestId('edit-vehicle-db')).toHaveValue('DB-100');fireEvent.change(screen.getByTestId('edit-vehicle-name'),{target:{value:'كابسة محدثة'}});fireEvent.change(screen.getByTestId('edit-vehicle-db'),{target:{value:'DB-101'}});fireEvent.click(screen.getByTestId('edit-vehicle-submit'));expect(h.updateMutate).toHaveBeenCalledWith(expect.objectContaining({id:'v1',vehicleName:'كابسة محدثة',dbNumber:'DB-101',plateNumber:'بغداد 123',chassisNumber:'CH-100'}),expect.objectContaining({onSuccess:expect.any(Function)}))
  })

  it('لا يسمح بالأرشفة بلا سبب كاف ويرسل السبب عند اكتماله',()=>{
    renderPage(<VehicleDetailPage/>,'/central-garage/vehicles-database/v1');fireEvent.click(screen.getByTestId('open-archive-vehicle'));expect(screen.getByTestId('archive-submit')).toBeDisabled();fireEvent.change(screen.getByTestId('archive-reason'),{target:{value:'خروج الآلية من الخدمة'}});expect(screen.getByTestId('archive-submit')).toBeEnabled();fireEvent.click(screen.getByTestId('archive-submit'));expect(h.archiveMutate).toHaveBeenCalledWith({vehicleId:'v1',reason:'خروج الآلية من الخدمة'},expect.objectContaining({onSuccess:expect.any(Function)}))
  })
})

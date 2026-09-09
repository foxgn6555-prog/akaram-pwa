import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h=vi.hoisted(()=>({reportFilter:vi.fn(),vehicleFilter:vi.fn(),exportMutate:vi.fn()}))
const result={totalCount:1,stockInTotal:300,consumptionTotal:50,resetTotal:10,byType:[{fuelType:'gas_oil',unit:'liter',quantity:50}],byTank:[{tankId:'t1',tankName:'الخزان الرئيسي',fuelType:'gas_oil',unit:'liter',stockIn:300,consumption:50}],byVehicle:[{unit:'liter',vehicleId:'v1',vehicleName:'كابسة',dbNumber:'DB-1',quantity:50}],byUnit:[{unit:'liter',stockIn:100,consumption:20,reset:0}],rows:[{id:'m1',tankId:'t1',vehicleId:'v1',movementType:'vehicle_fill',quantity:-50,quantityBefore:300,quantityAfter:250,nextRefillDate:'2026-09-20',notes:'تعبئة',actorId:'u1',actorName:'مسؤول الكراج',createdAt:'2026-09-08T09:00:00Z',tankName:'الخزان الرئيسي',fuelType:'gas_oil',unit:'liter',vehicleName:'كابسة',dbNumber:'DB-1',areaName:'الوليد',parentSector:'zaafaraniya'}],from:'2026-09-01',to:'2026-09-08'}
vi.mock('@features/central-garage/hooks',()=>({
  useGarageAreas:()=>({data:[{id:8,name:'الوليد',parentSector:'zaafaraniya',sort:8}]}),useGarageTanks:()=>({data:[{id:'t1',tankName:'الخزان الرئيسي',fuelType:'gas_oil'}]}),
  useGarageVehicles:(filter:unknown)=>{h.vehicleFilter(filter);return{data:{rows:[{id:'v1',vehicleName:'كابسة',dbNumber:'DB-1',driverName:'علي'}],totalCount:1}}},
  useGarageReport:(filter:unknown)=>{h.reportFilter(filter);return{data:result,isLoading:false,isError:false}},useExportGarageReport:()=>({mutate:h.exportMutate,isPending:false}),
}))
import GarageReportsPage from '@portals/central-garage/pages/GarageReportsPage'

describe('مركز تقارير الكراج',()=>{
  beforeEach(()=>{vi.clearAllMocks()})
  it('يعرض الملخصات والتجميعات وسجل الحركات',()=>{render(<MemoryRouter><GarageReportsPage/></MemoryRouter>);expect(screen.getByText('تقارير الكراج المركزي')).toBeInTheDocument();expect(screen.getAllByText('استهلاك الآليات')).toHaveLength(1);expect(screen.getAllByText('الخزان الرئيسي').length).toBeGreaterThan(0);expect(screen.getByText('لا ينطبق')).toBeInTheDocument();expect(screen.getAllByText(/٥٠/).length).toBeGreaterThan(0)})
  it('يطبق فلاتر المنطقة والمادة والخزان والحركة والآلية',async()=>{render(<MemoryRouter><GarageReportsPage/></MemoryRouter>);fireEvent.change(screen.getByTestId('report-area'),{target:{value:'8'}});fireEvent.change(screen.getByTestId('report-fuel'),{target:{value:'gas_oil'}});fireEvent.change(screen.getByTestId('report-tank'),{target:{value:'t1'}});fireEvent.change(screen.getByTestId('report-movement'),{target:{value:'vehicle_fill'}});fireEvent.change(screen.getByTestId('report-vehicle-search'),{target:{value:'DB-1'}});fireEvent.click(screen.getByTestId('report-vehicle-v1'));await waitFor(()=>expect(h.reportFilter).toHaveBeenLastCalledWith(expect.objectContaining({sectorId:8,fuelType:'gas_oil',tankId:'t1',movementType:'vehicle_fill',vehicleId:'v1',page:1})))})
  it('يصدر Excel وCSV بكامل الفلاتر دون تقييد بصفحة العرض',()=>{render(<MemoryRouter><GarageReportsPage/></MemoryRouter>);fireEvent.click(screen.getByRole('button',{name:/CSV/}));expect(h.exportMutate).toHaveBeenCalledWith(expect.objectContaining({format:'csv',filter:expect.not.objectContaining({page:expect.anything(),pageSize:expect.anything()})}));fireEvent.click(screen.getByRole('button',{name:/Excel/}));expect(h.exportMutate).toHaveBeenLastCalledWith(expect.objectContaining({format:'xlsx'}))})
})

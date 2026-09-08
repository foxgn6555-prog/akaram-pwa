import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h=vi.hoisted(()=>({dashboard:vi.fn(),areas:vi.fn()}))
vi.mock('@features/central-garage/hooks',()=>({useGarageDashboard:(filter:unknown)=>h.dashboard(filter),useGarageAreas:()=>h.areas()}))
import CentralGarageDashboardPage from '@portals/central-garage/pages/CentralGarageDashboardPage'

const data={vehiclesTotal:8,driversTotal:7,dispatchesTotal:8,vehiclesByShift:{morning:4,evening:3,night:1},vehiclesByArea:[{sectorId:5,sector:'karrada',area:'الجادرية',total:3}],tankStock:[{id:'t1',fuelType:'gas_oil',name:'خزان الكاز',capacity:1000,quantity:150,percent:15,lowStock:true}],consumptionByType:{gas_oil:500},dailyConsumption:[{date:'2026-09-07',quantity:200},{date:'2026-09-08',quantity:300}],monthlyConsumption:[{month:'2026-09',quantity:500}],topConsumers:[{vehicleId:'v1',vehicleName:'كابسة',dbNumber:'DB-1',quantity:500}],recentFills:[{id:'m1',vehicleName:'كابسة',dbNumber:'DB-1',tankName:'خزان الكاز',fuelType:'gas_oil',quantity:50,nextRefillDate:'2026-09-20',createdAt:'2026-09-08T09:00:00Z'}],pendingZeroItems:[{id:'r1',tankName:'خزان الكاز',fuelType:'gas_oil',requestedQuantity:150,reason:'مطابقة رصيد الخزان',requestedAt:'2026-09-08T10:00:00Z'}],pendingZeroRequests:2,from:'2026-09-01',to:'2026-09-08',sectorId:null,fuelType:null}

describe('لوحة قيادة الكراج المركزي',()=>{
  beforeEach(()=>{vi.clearAllMocks();h.areas.mockReturnValue({data:[{id:5,name:'الجادرية',parentSector:'karrada',sort:4}]});h.dashboard.mockReturnValue({data,isLoading:false,isError:false})})
  it('يعرض المؤشرات والخزانات والاستهلاك وآخر التعبئات',()=>{
    render(<MemoryRouter><CentralGarageDashboardPage/></MemoryRouter>)
    expect(screen.getByText('إجمالي الآليات')).toBeInTheDocument()
    expect(screen.getByText('الانطلاقات')).toBeInTheDocument()
    expect(screen.getByText('أكثر الآليات استهلاكاً')).toBeInTheDocument()
    expect(screen.getAllByText('كابسة')).toHaveLength(2)
    expect(screen.getByText('خزان الكاز')).toBeInTheDocument()
    expect(screen.getByText(/2 طلب تصفير معلق/)).toBeInTheDocument()
    expect(screen.getByText('مطابقة رصيد الخزان')).toBeInTheDocument()
  })
  it('يمرر فلاتر المنطقة والمادة والفترة عبر hook طبقة SDK',()=>{
    render(<MemoryRouter><CentralGarageDashboardPage/></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('القاطع والمنطقة'),{target:{value:'5'}})
    expect(h.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({sectorId:5}))
    fireEvent.change(screen.getByLabelText('نوع المادة'),{target:{value:'gas_oil'}})
    expect(h.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({sectorId:5,fuelType:'gas_oil'}))
    fireEvent.change(screen.getByLabelText('من تاريخ'),{target:{value:'2026-09-01'}})
    expect(h.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({from:'2026-09-01'}))
  })
  it('يعرض حالتي التحميل والخطأ',()=>{
    h.dashboard.mockReturnValueOnce({data:undefined,isLoading:true,isError:false})
    const view=render(<MemoryRouter><CentralGarageDashboardPage/></MemoryRouter>)
    expect(screen.getByText(/جارٍ تجهيز/)).toBeInTheDocument()
    view.unmount();h.dashboard.mockReturnValueOnce({data:undefined,isLoading:false,isError:true})
    render(<MemoryRouter><CentralGarageDashboardPage/></MemoryRouter>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

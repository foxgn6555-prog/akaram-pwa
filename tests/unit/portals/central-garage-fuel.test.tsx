import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h=vi.hoisted(()=>({
  addTank:vi.fn(),addStock:vi.fn(),fill:vi.fn(),requestZero:vi.fn(),decide:vi.fn(),
  vehicle:{id:'11111111-1111-4111-8111-111111111111',vehicleName:'كابسة',dbNumber:'DB-1',driverName:'علي',imagePath:'x',imageUrl:'x',plateNumber:'P1',chassisNumber:'C1',shift:'morning',sectorId:1,areaName:'أرخيته',parentSector:'karrada',createdAt:'2026-09-08T08:00:00Z',updatedAt:'2026-09-08T08:00:00Z',archivedAt:null},
  tank:{id:'t1',fuelType:'gas_oil',unit:'liter',tankName:'خزان الكاز',capacity:1000,currentQuantity:150,lowStockThreshold:20,createdAt:'2026-09-08T08:00:00Z',updatedAt:'2026-09-08T08:00:00Z',archivedAt:null},
  tanks:[] as Array<Record<string,unknown>>,
  request:{id:'r1',tankId:'t1',requestedQuantity:150,reason:'مطابقة فعلية',status:'pending',requestedBy:'u1',requestedAt:'2026-09-08T09:00:00Z',decidedBy:null,decidedAt:null,decisionNote:null},
}))
vi.mock('@features/central-garage/hooks',()=>({
  useGarageTanks:()=>({data:h.tanks,isLoading:false}),
  useGarageTankMovements:()=>({data:[{id:'m1',tankId:'t1',vehicleId:h.vehicle.id,movementType:'vehicle_fill',quantity:-20,quantityBefore:170,quantityAfter:150,nextRefillDate:'2026-09-20',notes:null,actorId:'u1',createdAt:'2026-09-08T09:00:00Z'}],isLoading:false}),
  useGarageVehicles:()=>({data:{rows:[h.vehicle],totalCount:1},isLoading:false}),
  useAddGarageTank:()=>({mutate:h.addTank,isPending:false}),
  useAddGarageTankStock:()=>({mutate:h.addStock,isPending:false}),
  useFillGarageVehicle:()=>({mutate:h.fill,isPending:false}),
  useRequestGarageTankZero:()=>({mutate:h.requestZero,isPending:false}),
  useGarageZeroRequests:()=>({data:[h.request],isLoading:false}),
  useDecideGarageTankZero:()=>({mutate:h.decide,isPending:false}),
}))
import FuelHubPage from '@portals/central-garage/pages/FuelHubPage'
import FuelTypePage from '@portals/central-garage/pages/FuelTypePage'
import CentralGarageApprovalsPage from '@portals/it/pages/CentralGarage/CentralGarageApprovalsPage'

const show=(node:React.ReactNode)=>render(<MemoryRouter>{node}</MemoryRouter>)
beforeEach(()=>{h.tank.fuelType='gas_oil';h.tank.unit='liter';h.tanks=[h.tank];h.addTank.mockReset();h.addStock.mockReset();h.fill.mockReset();h.requestZero.mockReset();h.decide.mockReset()})

describe('واجهات وقود الكراج',()=>{
  it('يعرض مركز الأنواع الأربعة مع ملخص الخزانات',()=>{show(<FuelHubPage/>);expect(screen.getByText('الكاز')).toBeInTheDocument();expect(screen.getByText('الهيدروليك')).toBeInTheDocument();expect(screen.getByText('الدهن')).toBeInTheDocument();expect(screen.getByText('C-Oil')).toBeInTheDocument();expect(screen.getByText('١٥٠ / ١٬٠٠٠')).toBeInTheDocument()})
  it('يفصل أرصدة النوع نفسه حسب الوحدة ولا يجمع وحدات غير متجانسة',()=>{h.tanks=[h.tank,{...h.tank,id:'t2',tankName:'خزان دهن',unit:'kilogram',currentQuantity:30,capacity:100}];show(<FuelHubPage/>);expect(screen.getByText('لتر')).toBeInTheDocument();expect(screen.getByText('كيلوغرام')).toBeInTheDocument();expect(screen.getByText('٣٠ / ١٠٠')).toBeInTheDocument()})
  it('يعرض عداد الخزان وتنبيه انخفاض المخزون وكل العمليات',()=>{show(<FuelTypePage fuelType="gas_oil"/>);expect(screen.getByTestId('tank-t1')).toHaveTextContent('15.0%');expect(screen.getByText(/وصل المخزون إلى حد الانخفاض/)).toBeInTheDocument();expect(screen.getByTestId('stock-t1')).toBeInTheDocument();expect(screen.getByTestId('fill-t1')).toBeInTheDocument();expect(screen.getByTestId('zero-t1')).toBeInTheDocument()})
  it('يتحقق من السعة والكمية الابتدائية ثم يضيف خزاناً',()=>{show(<FuelTypePage fuelType="gas_oil"/>);fireEvent.click(screen.getByTestId('open-add-tank'));fireEvent.change(screen.getByTestId('tank-name'),{target:{value:'خزان جديد'}});fireEvent.change(screen.getByTestId('tank-capacity'),{target:{value:'100'}});fireEvent.change(screen.getByTestId('tank-initial'),{target:{value:'120'}});fireEvent.click(screen.getByTestId('tank-submit'));expect(screen.getByText('الكمية الابتدائية تتجاوز سعة الخزان')).toBeInTheDocument();fireEvent.change(screen.getByTestId('tank-initial'),{target:{value:'50'}});fireEvent.click(screen.getByTestId('tank-submit'));expect(h.addTank).toHaveBeenCalledWith({fuelType:'gas_oil',tankName:'خزان جديد',unit:'liter',capacity:100,initialQuantity:50,lowStockThreshold:20},expect.objectContaining({onSuccess:expect.any(Function)}))})
  it('يضيف كمية وملاحظة إلى الخزان',()=>{show(<FuelTypePage fuelType="gas_oil"/>);fireEvent.click(screen.getByTestId('stock-t1'));fireEvent.change(screen.getByTestId('stock-quantity'),{target:{value:'75.5'}});fireEvent.change(screen.getByTestId('stock-notes'),{target:{value:'وصول صهريج'}});fireEvent.click(screen.getByTestId('stock-submit'));expect(h.addStock).toHaveBeenCalledWith({tankId:'t1',quantity:75.5,notes:'وصول صهريج'},expect.objectContaining({onSuccess:expect.any(Function)}))})
  it('يلغي موعد التعبئة التالي للكاز ولا يرسله',()=>{show(<FuelTypePage fuelType="gas_oil"/>);fireEvent.click(screen.getByTestId('fill-t1'));expect(screen.queryByTestId('fill-next-date')).not.toBeInTheDocument();fireEvent.click(screen.getByTestId(`select-fill-vehicle-${h.vehicle.id}`));fireEvent.change(screen.getByTestId('fill-quantity'),{target:{value:'40'}});fireEvent.change(screen.getByTestId('fill-notes'),{target:{value:'تعبئة دورية'}});fireEvent.click(screen.getByTestId('fill-submit'));expect(h.fill).toHaveBeenCalledWith({tankId:'t1',vehicleId:h.vehicle.id,quantity:40,nextRefillDate:undefined,notes:'تعبئة دورية'},expect.objectContaining({onSuccess:expect.any(Function)}))})
  it('يبقي موعد التعبئة إلزامياً للمواد الأخرى',()=>{h.tank.fuelType='hydraulic';show(<FuelTypePage fuelType="hydraulic"/>);fireEvent.click(screen.getByTestId('fill-t1'));fireEvent.click(screen.getByTestId(`select-fill-vehicle-${h.vehicle.id}`));fireEvent.change(screen.getByTestId('fill-quantity'),{target:{value:'10'}});fireEvent.click(screen.getByTestId('fill-submit'));expect(screen.getByText(/موعد التعبئة التالية مطلوب/)).toBeInTheDocument();fireEvent.change(screen.getByTestId('fill-next-date'),{target:{value:'2026-09-20'}});fireEvent.click(screen.getByTestId('fill-submit'));expect(h.fill).toHaveBeenCalledWith(expect.objectContaining({nextRefillDate:'2026-09-20'}),expect.any(Object))})
  it('لا يرسل طلب التصفير بلا سبب كاف ثم يرسله للتطوير',()=>{show(<FuelTypePage fuelType="gas_oil"/>);fireEvent.click(screen.getByTestId('zero-t1'));fireEvent.change(screen.getByTestId('zero-reason'),{target:{value:'قصير'}});fireEvent.click(screen.getByTestId('zero-submit'));expect(h.requestZero).not.toHaveBeenCalled();expect(screen.getByText(/5 أحرف/)).toBeInTheDocument();fireEvent.change(screen.getByTestId('zero-reason'),{target:{value:'مطابقة الرصيد الفعلي'}});fireEvent.click(screen.getByTestId('zero-submit'));expect(h.requestZero).toHaveBeenLastCalledWith({tankId:'t1',reason:'مطابقة الرصيد الفعلي'},expect.objectContaining({onSuccess:expect.any(Function)}))})
  it('يخفي الموعد التالي من سجل الكاز',()=>{show(<FuelTypePage fuelType="gas_oil"/>);fireEvent.click(screen.getByTestId('history-t1'));expect(screen.getAllByText('تعبئة آلية')).toHaveLength(2);expect(screen.queryByText(/2026-09-20/)).not.toBeInTheDocument()})
})

describe('موافقة التطوير المركزية',()=>{
  it('تعرض الطلب والرصيد وتنفذ الموافقة',()=>{show(<CentralGarageApprovalsPage/>);expect(screen.getByTestId('zero-request-r1')).toHaveTextContent('مطابقة فعلية');expect(screen.getByTestId('zero-request-r1')).toHaveTextContent('لتر');fireEvent.click(screen.getByTestId('approve-zero-r1'));fireEvent.change(screen.getByTestId('decision-note'),{target:{value:'تمت المطابقة'}});fireEvent.click(screen.getByTestId('decision-submit'));expect(h.decide).toHaveBeenCalledWith({requestId:'r1',approved:true,note:'تمت المطابقة'},expect.objectContaining({onSuccess:expect.any(Function)}))})
  it('يتطلب سبباً عند رفض الطلب',()=>{show(<CentralGarageApprovalsPage/>);fireEvent.click(screen.getByTestId('reject-zero-r1'));expect(screen.getByTestId('decision-submit')).toBeDisabled();fireEvent.change(screen.getByTestId('decision-note'),{target:{value:'الرصيد غير مطابق'}});expect(screen.getByTestId('decision-submit')).toBeEnabled();fireEvent.click(screen.getByTestId('decision-submit'));expect(h.decide).toHaveBeenCalledWith({requestId:'r1',approved:false,note:'الرصيد غير مطابق'},expect.objectContaining({onSuccess:expect.any(Function)}))})
})

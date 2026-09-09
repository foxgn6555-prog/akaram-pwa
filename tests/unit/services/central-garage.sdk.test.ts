/** اختبارات SDK الكراج المركزي — كل عملية بيانات تمر عبر SDK/RPC. */
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })

type Result = { data: unknown; error: { message: string; code?: string } | null }
type MockFn = ReturnType<typeof vi.fn>
interface Bucket { upload: MockFn; remove: MockFn; createSignedUrl: MockFn; createSignedUrls: MockFn }

const h = vi.hoisted(() => {
  const state = { result: { data: [], error: null } as Result }
  const buckets: Bucket[] = []
  function chain() {
    const value: Record<string, unknown> = {}
    for (const method of ['select','eq','is','order','limit','single','returns']) value[method] = vi.fn(() => value)
    value.then = (resolve: (result: Result) => void) => resolve(state.result)
    return value
  }
  return {
    state, buckets,
    rpc: vi.fn(async () => state.result),
    from: vi.fn(() => chain()),
    getUser: vi.fn(async () => ({ data: { user: { id: 'garage-user' } }, error: null })),
    storageFrom: vi.fn(() => {
      const bucket: Bucket = {
        upload: vi.fn(async () => ({ data: { path: 'ok' }, error: null })),
        remove: vi.fn(async () => ({ data: [], error: null })),
        createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null })),
        createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })), error: null })),
      }
      h.buckets.push(bucket)
      return bucket
    }),
  }
})

vi.mock('@sdk/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, supabase: {
    auth: { getUser: h.getUser }, rpc: h.rpc, from: h.from,
    storage: { from: h.storageFrom },
  } }
})

import { centralGarage } from '@sdk/central-garage.sdk'
import { SDKError } from '@lib/errors/SDKError'

function imageFile(type = 'image/jpeg', valid = true): File {
  const raw = valid
    ? type === 'image/png' ? Uint8Array.from([0x89,0x50,0x4e,0x47,0,0,0,0]) : Uint8Array.from([0xff,0xd8,0xff,1])
    : new TextEncoder().encode('not-image')
  const file = new File([raw], 'vehicle.jpg', { type })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => raw })
  return file
}

beforeEach(() => {
  h.state.result = { data: [], error: null }
  h.rpc.mockClear(); h.from.mockClear(); h.getUser.mockClear(); h.storageFrom.mockClear(); h.buckets.length = 0
})

describe('SDK الكراج — الآليات والانطلاقية', () => {
  it('يبحث ويفلتر الآليات بصفحات ويوقع روابط الصور', async () => {
    h.state.result = { data: [{ id:'v1',vehicle_name:'كابسة',db_number:'DB-1',plate_number:'P1',chassis_number:'C1',image_path:'u/v.jpg',shift:'night',driver_name:'علي',sector_id:8,area_name:'الوليد',parent_sector:'zaafaraniya',created_at:'2026-09-08T10:00:00Z',updated_at:'2026-09-08T10:00:00Z',archived_at:null,total_count:71 }], error:null }
    const result = await centralGarage.vehicles({ search:' علي ',sectorId:8,shift:'night',page:2,pageSize:24 })
    expect(h.rpc).toHaveBeenCalledWith('garage_search_vehicles',{p_search:'علي',p_sector_id:8,p_shift:'night',p_limit:24,p_offset:24,p_archived:false})
    expect(result.totalCount).toBe(71)
    expect(result.rows[0]).toMatchObject({ dbNumber:'DB-1',driverName:'علي',areaName:'الوليد',imageUrl:'https://signed/u/v.jpg' })
  })

  it('يجلب تفاصيل آلية واحدة مع المنطقة ورابط صورة موقّع', async () => {
    h.state.result = { data: { id:'v1',vehicle_name:'كابسة',db_number:'DB-1',plate_number:'P1',chassis_number:'CH-1',image_path:'u/v.jpg',shift:'morning',driver_name:'علي',sector_id:1,sectors:{name:'أرخيته',parent_sector:'karrada'},created_at:'now',updated_at:'now',archived_at:null }, error:null }
    const vehicle=await centralGarage.vehicle('v1')
    expect(h.from).toHaveBeenCalledWith('garage_vehicles')
    expect(vehicle).toMatchObject({id:'v1',areaName:'أرخيته',parentSector:'karrada',imageUrl:'https://signed/u/v.jpg'})
  })

  it('يرفض نوع الصورة أو توقيعها المزيف قبل الشبكة', async () => {
    await expect(centralGarage.createVehicle({vehicleName:'كابسة',dbNumber:'1',plateNumber:'2',chassisNumber:'333',image:imageFile('text/plain'),shift:'morning',driverName:'علي',sectorId:1})).rejects.toMatchObject({code:'GARAGE_IMAGE_INVALID'})
    await expect(centralGarage.createVehicle({vehicleName:'كابسة',dbNumber:'1',plateNumber:'2',chassisNumber:'333',image:imageFile('image/jpeg',false),shift:'morning',driverName:'علي',sectorId:1})).rejects.toMatchObject({code:'GARAGE_IMAGE_SIGNATURE_INVALID'})
    expect(h.storageFrom).not.toHaveBeenCalled()
  })

  it('يرفع صورة الآلية ثم ينشئها عبر RPC وينظف الصورة عند فشل التسجيل', async () => {
    const input={vehicleName:'كابسة',dbNumber:'DB-1',plateNumber:'P1',chassisNumber:'CH-1',image:imageFile(),shift:'morning' as const,driverName:'علي',sectorId:1}
    h.state.result={data:{id:'v1',vehicle_name:'كابسة',db_number:'DB-1',plate_number:'P1',chassis_number:'CH-1',image_path:'garage-user/x.jpg',shift:'morning',driver_name:'علي',sector_id:1,created_at:'now',updated_at:'now'},error:null}
    await centralGarage.createVehicle(input)
    expect(h.storageFrom).toHaveBeenCalledWith('garage-vehicles')
    expect(h.buckets[0]?.upload).toHaveBeenCalledWith(expect.stringMatching(/^garage-user\/[0-9a-f-]+\.jpg$/),input.image,{contentType:'image/jpeg'})
    expect(h.rpc).toHaveBeenCalledWith('garage_add_vehicle',expect.objectContaining({p_db_number:'DB-1',p_driver_name:'علي',p_sector_id:1}))

    h.state.result={data:null,error:{message:'duplicate',code:'23505'}}
    await expect(centralGarage.createVehicle(input)).rejects.toBeInstanceOf(SDKError)
    expect(h.buckets.at(-1)?.remove).toHaveBeenCalledWith([expect.stringMatching(/^garage-user\//)])
  })

  it('يعدل حقول الآلية ويرفع الصورة الاختيارية عبر RPC', async () => {
    const image=imageFile();h.state.result={data:{id:'v1',vehicle_name:'كابسة معدلة',db_number:'DB-2',plate_number:'P2',chassis_number:'CH-2',image_path:'garage-user/new.jpg',shift:'morning',driver_name:'علي',sector_id:1,created_at:'now',updated_at:'now'},error:null}
    const result=await centralGarage.updateVehicle('v1',{vehicleName:'كابسة معدلة',dbNumber:'DB-2',plateNumber:'P2',chassisNumber:'CH-2',image})
    expect(h.rpc).toHaveBeenCalledWith('garage_update_vehicle',expect.objectContaining({p_vehicle_id:'v1',p_db_number:'DB-2',p_image_path:expect.stringMatching(/^garage-user\//)}));expect(result.vehicleName).toBe('كابسة معدلة')
  })

  it('يغير السائق والشفت والموقع عبر RPC تاريخي ويؤرشف ويستعيد بسبب', async () => {
    h.state.result={data:{id:'a1',vehicle_id:'v1',driver_name:'حسن',shift:'evening',sector_id:5,starts_at:'now',ends_at:null,change_reason:'نقل'},error:null}
    const assignment=await centralGarage.assignDriver('v1','حسن','evening',5,' نقل ')
    expect(h.rpc).toHaveBeenCalledWith('garage_assign_driver',{p_vehicle_id:'v1',p_driver_name:'حسن',p_shift:'evening',p_sector_id:5,p_reason:'نقل'})
    expect(assignment).toMatchObject({driverName:'حسن',sectorId:5})
    await centralGarage.archiveVehicle('v1',' انتهاء الخدمة ')
    expect(h.rpc).toHaveBeenLastCalledWith('garage_archive_vehicle',{p_vehicle_id:'v1',p_reason:'انتهاء الخدمة'})
    h.state.result={data:{id:'v1',vehicle_name:'كابسة',db_number:'DB-1',plate_number:'P1',chassis_number:'CH-1',image_path:'u/v.jpg',shift:'morning',driver_name:'علي',sector_id:1,created_at:'now',updated_at:'now',archived_at:null},error:null}
    await centralGarage.restoreVehicle('v1',' عودة للخدمة ')
    expect(h.rpc).toHaveBeenLastCalledWith('garage_restore_vehicle',{p_vehicle_id:'v1',p_reason:'عودة للخدمة'})
  })
})

describe('SDK الكراج — الخزانات والتعبئة والموافقات', () => {
  const movement={id:'m1',tank_id:'t1',vehicle_id:'v1',movement_type:'vehicle_fill',quantity:-40,quantity_before:200,quantity_after:160,next_refill_date:'2026-09-20',notes:null,actor_id:'u1',created_at:'2026-09-08T10:00:00Z'}

  it('يدعم الخزانات الأربعة وإضافة الكمية عبر RPC', async () => {
    h.state.result={data:{id:'t1',fuel_type:'c_oil',tank_name:'C1',unit:'liter',capacity:500,current_quantity:100,low_stock_threshold:20,created_at:'now',updated_at:'now',archived_at:null},error:null}
    const tank=await centralGarage.addTank('c_oil','C1','liter',500,100,20)
    expect(h.rpc).toHaveBeenCalledWith('garage_add_tank',{p_fuel_type:'c_oil',p_tank_name:'C1',p_unit:'liter',p_capacity:500,p_initial_quantity:100,p_low_stock_threshold:20})
    expect(tank).toMatchObject({fuelType:'c_oil',currentQuantity:100})
    h.state.result={data:{...movement,vehicle_id:null,movement_type:'stock_in',quantity:50,quantity_after:150,next_refill_date:null},error:null}
    await centralGarage.addTankStock('t1',50,' وجبة ')
    expect(h.rpc).toHaveBeenLastCalledWith('garage_add_tank_stock',{p_tank_id:'t1',p_quantity:50,p_notes:'وجبة'})
  })

  it('يجلب حركة الآلية مع وحدة الخزان ونوع المادة لعرض السجل بدقة', async () => {
    h.state.result={data:[{...movement,garage_tanks:{fuel_type:'hydraulic',unit:'gallon',tank_name:'خزان الهيدروليك'}}],error:null}
    const rows=await centralGarage.movements({vehicleId:'v1'})
    expect(rows[0]).toMatchObject({fuelType:'hydraulic',unit:'gallon',tankName:'خزان الهيدروليك'})
  })

  it('يرسل موعد التعبئة التالي ولا يرسل وقت العملية من العميل', async () => {
    h.state.result={data:movement,error:null}
    const result=await centralGarage.fillVehicle('t1','v1',40,'2026-09-20',' تعبئة ')
    expect(h.rpc).toHaveBeenCalledWith('garage_fill_vehicle',{p_tank_id:'t1',p_vehicle_id:'v1',p_quantity:40,p_next_refill_date:'2026-09-20',p_notes:'تعبئة'})
    const payload=(h.rpc.mock.calls as unknown as Array<[string,Record<string,unknown>]>)[0]?.[1] ?? {}
    expect(Object.keys(payload).some((key)=>key.includes('time')||key.includes('created'))).toBe(false)
    expect(result).toMatchObject({quantity:-40,quantityAfter:160,nextRefillDate:'2026-09-20'})
  })

  it('يرسل طلب التصفير ثم القرار حصراً عبر RPC', async () => {
    h.state.result={data:{id:'r1',tank_id:'t1',requested_quantity:160,reason:'مطابقة',status:'pending',requested_by:'u1',requested_at:'now'},error:null}
    await centralGarage.requestTankZero('t1',' مطابقة فعلية ')
    expect(h.rpc).toHaveBeenCalledWith('garage_request_tank_zero',{p_tank_id:'t1',p_reason:'مطابقة فعلية'})
    h.state.result={data:{id:'r1',tank_id:'t1',requested_quantity:160,reason:'مطابقة',status:'executed',requested_by:'u1',requested_at:'now',decided_by:'it1',decided_at:'now'},error:null}
    await centralGarage.decideTankZero('r1',true,' موافق ')
    expect(h.rpc).toHaveBeenLastCalledWith('garage_decide_tank_zero',{p_request_id:'r1',p_approved:true,p_note:'موافق'})
  })

  it('يجلب تقرير الحركات بصفحات وفلاتر ويسترجع كامل الصفوف للتصدير', async () => {
    const base={stockInTotal:300,consumptionTotal:50,resetTotal:0,byType:[],byTank:[],byVehicle:[],from:'2026-09-01',to:'2026-09-08'}
    h.state.result={data:{...base,totalCount:1,rows:[{id:'m1'}]},error:null}
    await centralGarage.report({from:'2026-09-01',to:'2026-09-08',sectorId:8,fuelType:'gas_oil',tankId:'t1',vehicleId:'v1',movementType:'vehicle_fill',page:2,pageSize:50})
    expect(h.rpc).toHaveBeenCalledWith('garage_consumption_report',{p_from:'2026-09-01',p_to:'2026-09-08',p_sector_id:8,p_fuel_type:'gas_oil',p_tank_id:'t1',p_vehicle_id:'v1',p_movement_type:'vehicle_fill',p_limit:50,p_offset:50})
    h.rpc.mockResolvedValueOnce({data:{...base,totalCount:101,rows:Array.from({length:100},(_,i)=>({id:`m${i}`}))},error:null}).mockResolvedValueOnce({data:{...base,totalCount:101,rows:[{id:'m100'}]},error:null})
    const all=await centralGarage.reportAll({fuelType:'gas_oil'});expect(all.rows).toHaveLength(101)
  })

  it('يجلب ملخص التقارير بالفترة المحددة', async () => {
    h.state.result={data:{vehiclesTotal:8,driversTotal:7,vehiclesByShift:{morning:4},vehiclesByArea:[],tankStock:[],consumptionByType:{gas_oil:500},pendingZeroRequests:1,from:'2026-09-01',to:'2026-09-08'},error:null}
    const summary=await centralGarage.dashboard({from:'2026-09-01',to:'2026-09-08',sectorId:8,fuelType:'gas_oil'})
    expect(h.rpc).toHaveBeenCalledWith('garage_dashboard_summary',{p_from:'2026-09-01',p_to:'2026-09-08',p_sector_id:8,p_fuel_type:'gas_oil'})
    expect(summary).toMatchObject({vehiclesTotal:8,pendingZeroRequests:1})
  })

  it('يجلب انطلاقات اليوم ويوقع روابط الصور', async () => {
    h.state.result={data:[{id:'d1',vehicle_id:'v1',driver_name:'علي',shift:'morning',sector_id:1,departed_at:'2026-09-08T07:30:00Z',returned_at:null,notes:null,vehicle_name:'كابسة',db_number:'DB-1',image_path:'u/v.jpg',area_name:'أرخيته',parent_sector:'karrada'}],error:null}
    const departures=await centralGarage.todayDepartures()
    expect(h.rpc).toHaveBeenCalledWith('garage_today_departures')
    expect(departures).toHaveLength(1)
    expect(departures[0]).toMatchObject({vehicleId:'v1',returnedAt:null,imageUrl:'https://signed/u/v.jpg'})
  })

  it('يسجل انطلاق السائق وعودته عبر RPC حصراً (وقت الخادم)', async () => {
    h.state.result={data:{id:'d1',vehicle_id:'v1',driver_name:'علي',shift:'morning',sector_id:1,departed_at:'2026-09-08T07:30:00Z',returned_at:null,notes:null,vehicle_name:'كابسة',db_number:'DB-1',image_path:'u/v.jpg',area_name:'أرخيته',parent_sector:'karrada'},error:null}
    await centralGarage.recordDeparture('v1',' خروج للوردية ')
    expect(h.rpc).toHaveBeenCalledWith('garage_record_departure',{p_vehicle_id:'v1',p_notes:'خروج للوردية'})
    h.state.result={data:{...(h.state.result.data as Record<string, unknown>),returned_at:'2026-09-08T15:30:00Z'},error:null}
    const returned=await centralGarage.recordReturn('d1')
    expect(h.rpc).toHaveBeenLastCalledWith('garage_record_return',{p_departure_id:'d1'})
    expect(returned.returnedAt).toBe('2026-09-08T15:30:00Z')
  })
})

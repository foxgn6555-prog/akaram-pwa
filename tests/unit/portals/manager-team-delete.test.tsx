import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h=vi.hoisted(()=>({archiveWorker:vi.fn(),archiveVehicle:vi.fn()}))
vi.mock('@features/sector',async(importOriginal)=>{
 const actual=await importOriginal<Record<string,unknown>>()
 return {...actual,
  useSectors:()=>({data:[{id:1,code:'S1',name:'أرخيته',sort:1,parent_sector:'karrada'}]}),
  useManagerProfile:()=>({data:{user_id:'manager-1',shift:'morning',sectors:[1]}}),
  useWorkers:()=>({data:[{id:'worker-1',full_name:'عامل الاختبار',phone:null,sector_id:1,shift:'morning',job_title:null}],isLoading:false}),
  useVehicles:()=>({data:[{id:'vehicle-1',db_number:'DB-10',vehicle_type:'كابسة',sector_id:1,shift:'morning',driver_name:null}],isLoading:false}),
  useCreateWorker:()=>({mutate:vi.fn(),isPending:false}),useCreateVehicle:()=>({mutate:vi.fn(),isPending:false}),
  useArchiveWorker:()=>({mutate:h.archiveWorker,isPending:false}),useArchiveVehicle:()=>({mutate:h.archiveVehicle,isPending:false}),
 }
})

import TeamPage from '@portals/manager/pages/Team/TeamPage'

describe('حذف العامل والآلية لدى مسؤول القسم',()=>{
 beforeEach(()=>{h.archiveWorker.mockReset();h.archiveVehicle.mockReset()})
 it('يعرض زر حذف واضحاً وينقل العامل إلى الأرشيف بسبب إلزامي',()=>{
  render(<TeamPage/>);fireEvent.click(screen.getByRole('button',{name:'حذف العامل'}))
  expect(screen.getByRole('dialog')).toHaveTextContent('لن يُحذف سجله التاريخي')
  const confirm=screen.getByRole('button',{name:'تأكيد الحذف إلى الأرشيف'});expect(confirm).toBeDisabled()
  fireEvent.change(screen.getByLabelText('سبب الحذف'),{target:{value:'انتهاء العمل'}});fireEvent.click(confirm)
  expect(h.archiveWorker).toHaveBeenCalledWith({id:'worker-1',reason:'انتهاء العمل'},expect.any(Object))
 })
 it('ينقل الآلية إلى الأرشيف ولا يستعمل حذفاً فعلياً',()=>{
  render(<TeamPage/>);fireEvent.click(screen.getByRole('button',{name:/الآليات/}));fireEvent.click(screen.getByRole('button',{name:'حذف الآلية'}))
  fireEvent.change(screen.getByLabelText('سبب الحذف'),{target:{value:'خارج الخدمة'}});fireEvent.click(screen.getByRole('button',{name:'تأكيد الحذف إلى الأرشيف'}))
  expect(h.archiveVehicle).toHaveBeenCalledWith({id:'vehicle-1',reason:'خارج الخدمة'},expect.any(Object))
 })
})

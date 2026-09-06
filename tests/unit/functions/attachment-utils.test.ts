import{describe,expect,it,vi}from'vitest'
import{attachmentMime,mapConcurrent}from'../../../supabase/functions/_shared/attachment-utils'
const named=(name:string)=>({name})
describe('تشخيص ومعالجة مرفقات البريد',()=>{
 it('يتعرف على المحتوى الحقيقي حتى إن كان نوع البريد العام غير دقيق',()=>{
  expect(attachmentMime(named('x.bin'),new Uint8Array([0xff,0xd8,0xff]))).toBe('image/jpeg')
  expect(attachmentMime(named('x.bin'),new Uint8Array([0x89,0x50,0x4e,0x47]))).toBe('image/png')
  expect(attachmentMime(named('x.pdf'),new Uint8Array([0x25,0x50,0x44,0x46]))).toBe('application/pdf')
  expect(attachmentMime(named('x.pptx'),new Uint8Array([0x50,0x4b]))).toContain('presentationml')
  expect(attachmentMime(named('x.zip'),new Uint8Array([0x50,0x4b]))).toBeNull()
 })
 it('لا يتجاوز حد التوازي ويحافظ على فهرس كل مرفق',async()=>{
  let active=0,max=0;const seen:number[]=[]
  await mapConcurrent([0,1,2,3,4,5],2,async(_,index)=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));seen.push(index);active--})
  expect(max).toBe(2);expect(seen.sort((a,b)=>a-b)).toEqual([0,1,2,3,4,5])
 })
 it('ينتظر انتهاء بقية المرفقات ثم يعيد أول خطأ',async()=>{
  const finished=vi.fn()
  await expect(mapConcurrent([0,1,2],2,async value=>{await new Promise(resolve=>setTimeout(resolve,value===0?1:8));if(value===0)throw new Error('first');finished(value)})).rejects.toThrow('first')
  expect(finished).toHaveBeenCalledTimes(2)
 })
 it('يرفض حد توازٍ غير صالح',async()=>{await expect(mapConcurrent([1],0,async()=>undefined)).rejects.toThrow('CONCURRENCY_LIMIT_INVALID')})
})

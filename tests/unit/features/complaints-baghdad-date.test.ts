import{describe,expect,it}from'vitest'
import{baghdadDateKey,baghdadDayRange}from'@features/complaints/lib/baghdad-date'
describe('تصفية أيام الشكاوى بتوقيت بغداد',()=>{
 it('يحول الوقت قرب منتصف الليل إلى يوم بغداد الصحيح',()=>{expect(baghdadDateKey('2026-09-06T22:30:00Z')).toBe('2026-09-07')})
 it('ينشئ حدود UTC ليوم بغداد دون خلط اليوم السابق أو التالي',()=>{expect(baghdadDayRange('2026-09-07')).toEqual({from:'2026-09-06T21:00:00.000Z',to:'2026-09-07T21:00:00.000Z'})})
})

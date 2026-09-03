import { describe, expect, it } from 'vitest'
import { inferLocationFromArabicText } from '../../../src/features/complaints/lib/ocr'

describe('تحليل بيانات الشكوى المساعد',()=>{
  it('يستخرج المحلة والزقاق من النص العربي',()=>{
    expect(inferLocationFromArabicText('الموقع: محلة ٩٠١ - زقاق 12')).toEqual({neighborhood:'٩٠١',alley:'12'})
  })
  it('لا يخترع بيانات عند غياب الأنماط',()=>{
    expect(inferLocationFromArabicText('صورة شكوى عامة')).toEqual({neighborhood:undefined,alley:undefined})
  })
})

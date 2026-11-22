/**
 * اختبارات الدوال الحرة في SDK تخطيط الخريطة — منطق نقي بلا شبكة.
 *
 * هذه الدوال تُنتج ما يراه المشغّل على الشاشة: أكواد الشوارع، مدّة المكوث،
 * حالة الزيارة، وتحذير مصدر الشفت. وكانت **٠–٣٪ تغطية فروع** وهي مشمولة في
 * بوابة التغطية. تغطيتها ترفع البوابة وتحمي صيغاً يعتمد عليها التصدير.
 */
import { describe, expect, it } from 'vitest'
import {
  formatDwell,
  nextCode,
  placeCoverageState,
  shiftCaveat,
  visitDisplayStatus,
} from '@sdk/map-planning.sdk'
import type { MapVisit } from '@sdk/map-planning.sdk'

describe('nextCode — توليد الكود التسلسلي', () => {
  it('قائمة فارغة ⇒ 0001', () => {
    expect(nextCode([], 'STR')).toBe('STR-0001')
  })

  it('يأخذ الأكبر لا الأول ولا الأخير', () => {
    // الترتيب في القاعدة غير مضمون — الأكبر هو المرجع
    expect(nextCode(['STR-0003', 'STR-0001', 'STR-0007'], 'STR')).toBe('STR-0008')
  })

  it('يتجاهل بادئة أخرى (SEC لا يُفسد STR)', () => {
    expect(nextCode(['SEC-0100', 'STR-0002'], 'STR')).toBe('STR-0003')
  })

  it('يتجاهل الأكواد غير المطابقة للنمط', () => {
    // «STR-0002-ب» لا يطابق ^STR-\d+$ ⇒ لا يُحسب، والنتيجة من STR-xxxx فقط
    expect(nextCode(['STR-xx', 'STR-', 'STR-0002-ب', 'MHL-0001'], 'STR')).toBe('STR-0001')
  })

  it('يوسّع العرض عند تجاوز ٩٩٩٩ بلا قصّ', () => {
    expect(nextCode(['STR-9999'], 'STR')).toBe('STR-10000')
  })

  it('يبدأ من جديد لبادئة جديدة', () => {
    expect(nextCode(['STR-0042'], 'ALY')).toBe('ALY-0001')
  })

  it('البادئة تُهرب في التعبير النمطي (نقطة لا تُطابق أي حرف)', () => {
    // لو لم تُهرب «.» لطابق «X-0005» و«Y-0001» فتُعطي .-0006
    expect(nextCode(['X-0005', 'Y-0001'], '.')).toBe('.-0001')
  })

  it('البادئة فاضية تعمل بلا انفجار', () => {
    expect(nextCode([], '')).toBe('-0001')
  })

  it('العدد في الكود يُقرأ كرقم لا كنص', () => {
    expect(nextCode(['STR-0010', 'STR-0009'], 'STR')).toBe('STR-0011')
  })
})

describe('formatDwell — مدّة المكوث', () => {
  it('null ⇒ شرطة لا «0 ث» (غياب القياس ليس صفراً)', () => {
    expect(formatDwell(null)).toBe('—')
  })

  it('أقل من دقيقة ⇒ ثوانٍ فقط', () => {
    expect(formatDwell(45)).toBe('45 ث')
  })

  it('صفر ⇒ 0 ث', () => {
    expect(formatDwell(0)).toBe('0 ث')
  })

  it('دقيقة تامة ⇒ «1 د 0 ث» — لا يختفي الصفر', () => {
    expect(formatDwell(60)).toBe('1 د 0 ث')
  })

  it('دقيقة و٣٥ ثانية', () => {
    expect(formatDwell(95)).toBe('1 د 35 ث')
  })

  it('سالب يُقصّ إلى صفر — القاعدة لا تُنتج سالباً', () => {
    expect(formatDwell(-30)).toBe('0 ث')
  })

  it('كسور تُقرَّب (لا «45.7 ث»)', () => {
    expect(formatDwell(45.7)).toBe('46 ث')
  })

  it('ساعة كاملة تُعرض بالدقائق لا تُقصّ', () => {
    expect(formatDwell(3600)).toBe('60 د 0 ث')
  })
})

describe('visitDisplayStatus — ثلاث حالات صريحة', () => {
  it('لا زيارة ⇒ not_entered لا «صفر تغطية»', () => {
    expect(visitDisplayStatus(null)).toBe('not_entered')
  })

  it('undefined ⇒ not_entered', () => {
    expect(visitDisplayStatus(undefined)).toBe('not_entered')
  })

  it('زيارة مؤكدة', () => {
    expect(visitDisplayStatus({ status: 'confirmed' } as MapVisit)).toBe('confirmed')
  })

  it('زيارة غير مؤكدة', () => {
    expect(visitDisplayStatus({ status: 'uncertain' } as MapVisit)).toBe('uncertain')
  })
})

describe('shiftCaveat — وسم مصدر الشفت', () => {
  it('من سجل الآلية ⇒ تحذير صريح', () => {
    expect(shiftCaveat({ shift_source: 'vehicle' })).toBe('لم تُسجَّل انطلاقية — الشفت من سجل الآلية')
  })

  it('من الانطلاقية ⇒ لا تحذير (المصدر دقيق)', () => {
    expect(shiftCaveat({ shift_source: 'departure' })).toBeNull()
  })

  it('لا مصدر ⇒ لا تحذير (لا ادّعاء بلا دليل)', () => {
    expect(shiftCaveat({ shift_source: 'none' })).toBeNull()
  })
})

describe('placeCoverageState — حالة تغطية المحل', () => {
  it('لم يُزر ⇒ not_entered', () => {
    expect(placeCoverageState({ visited: false, confirmed: false })).toBe('not_entered')
  })

  it('زاره آلياً فقط ⇒ uncertain لا confirmed', () => {
    expect(placeCoverageState({ visited: true, confirmed: false })).toBe('uncertain')
  })

  it('زاره موظف وأكّده ⇒ confirmed', () => {
    expect(placeCoverageState({ visited: true, confirmed: true })).toBe('confirmed')
  })

  it('confirmed بلا visited لا ينقلب confirmed (الزيارة شرط)', () => {
    // حقل confirmed وحده لا يكفي — لا زيارة = لم يُدخَل
    expect(placeCoverageState({ visited: false, confirmed: true })).toBe('not_entered')
  })
})

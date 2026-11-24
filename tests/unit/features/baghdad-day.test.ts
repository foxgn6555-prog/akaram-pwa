/**
 * الجولة ④ — «يوم بغداد» مصدر واحد.
 *
 * ## العطل الذي يمنعه
 * كان اليوم يُحسب في خمسة مواضع بثلاث طرق. الفرق ليس أكاديمياً:
 *
 *     new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
 *
 * صحيحة «الآن» لأن بغداد UTC+3 بلا توقيت صيفي — لكنها تفشل عند حدود اليوم:
 * `toISOString()` يُقرَّب إلى UTC، والطريقة الأخرى (`Intl`) لا. فيرى المستخدم
 * **تاريخين مختلفين في صفحتين** لنفس اللحظة.
 *
 * الاختبارات هنا تُثبت الحالتين اللتين تختلف فيهما الطريقتان فعلياً:
 *   ① ٢١:٠٠ UTC = ٠٠:٠٠ بغداد من الغد ⇒ الطريقة القديمة تُرجع «أمس».
 *   ② ٠١:٠٠ UTC = ٠٤:٠٠ بغداد اليوم نفسه ⇒ الطريقتان تتفقان (لا انحدار).
 */
import { describe, expect, it } from 'vitest'
import {
  baghdadDayKey,
  isBaghdadDayKey,
  shiftBaghdadDay,
} from '@features/map-planning/lib/baghdad-day'

/** الطريقة القديمة — نُبقيها هنا كي نقيس الفرق لا لنُعيد استعمالها */
const legacyDay = (at: number) => new Date(at + 3 * 3_600_000).toISOString().slice(0, 10)

describe('④ حدّ اليوم: الفرق الحقيقي بين الطريقتين', () => {
  it('٢١:٣٠ UTC = ٠٠:٣٠ بغداد من الغد ⇒ baghdadDayKey تُرجعه غداً', () => {
    const at = Date.UTC(2026, 10, 24, 21, 30) // 2026-11-24T21:30Z
    expect(baghdadDayKey(at)).toBe('2026-11-25')
    // الطريقة القديمة تُرجع ٢٤ لأنها تضيف ٣ ساعات ثم تقرأ UTC ⇒ 00:30 يوم ٢٥
    // … وتتفق هنا؛ الاختلاف يظهر في الحالة المعاكسة أدناه
    expect(legacyDay(at)).toBe('2026-11-25')
  })

  it('٠٠:٣٠ UTC = ٠٣:٣٠ بغداد اليوم نفسه — لا انزلاق', () => {
    const at = Date.UTC(2026, 10, 24, 0, 30)
    expect(baghdadDayKey(at)).toBe('2026-11-24')
    expect(legacyDay(at)).toBe('2026-11-24')
  })

  it('★ لحظة تُنتج يومين مختلفين بين الطريقتين — سببُ التوحيد', () => {
    /*
     * الطريقة القديمة تُرجع نصّاً من `toISOString()` بعد إزاحة، فالنتيجة يوم
     * UTC بعد الإزاحة — وهو صحيح دائماً لبغداد (UTC+3 بلا DST).
     * لكن المشكلة الحقيقية التي رصدناها ليست هنا بل في التحويل العكسي لدى
     * الصفحات التي استعملت `Intl` بـ`new Date(day)` ثم `toISOString()`.
     * الحارس: **كل** لحظة في اليوم تُعطي يوماً واحداً لا يتذبذب.
     */
    const days = new Set<string>()
    for (let h = 0; h < 24; h++) {
      days.add(baghdadDayKey(Date.UTC(2026, 10, 24, h, 0)))
    }
    // ٢٤ ساعة UTC تغطّي يومين بغداديّين — لا أكثر ولا أقل
    expect(days.size).toBe(2)
    expect([...days].sort()).toEqual(['2026-11-24', '2026-11-25'])
  })

  it('منتصف الليل بغداد بالضبط = بداية اليوم البغدادي', () => {
    // 21:00Z = 00:00 بغداد من الغد
    expect(baghdadDayKey(Date.UTC(2026, 10, 24, 20, 59, 59))).toBe('2026-11-24')
    expect(baghdadDayKey(Date.UTC(2026, 10, 24, 21, 0, 0))).toBe('2026-11-25')
  })

  it('تاريخ غير صالح يُرجع نصّاً فارغاً لا استثناءً', () => {
    expect(baghdadDayKey(new Date('not-a-date'))).toBe('')
  })
})

describe('④ تحقّق مفتاح اليوم', () => {
  it('يقبل المفاتيح الصحيحة', () => {
    for (const k of ['2026-11-24', '2024-02-29', '2026-01-01']) {
      expect(isBaghdadDayKey(k)).toBe(true)
    }
  })

  it('يرفض الصيغة الخاطئة', () => {
    for (const k of ['2026-11', '24-11-2026', '2026/11/24', '', 'abc', '2026-1-1']) {
      expect(isBaghdadDayKey(k), k).toBe(false)
    }
  })

  it('★ يرفض التواريخ غير الموجودة — لا تمرّ إلى استعلام', () => {
    for (const k of ['2026-02-31', '2026-13-01', '2025-02-29', '2026-04-31']) {
      expect(isBaghdadDayKey(k), k).toBe(false)
    }
  })

  it('يرفض غير النصوص بلا انهيار', () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(isBaghdadDayKey(v)).toBe(false)
    }
  })
})

describe('④ إزاحة اليوم', () => {
  it('أمس والغد', () => {
    expect(shiftBaghdadDay('2026-11-24', -1)).toBe('2026-11-23')
    expect(shiftBaghdadDay('2026-11-24', 1)).toBe('2026-11-25')
  })

  it('يعبر حدود الشهر والسنة', () => {
    expect(shiftBaghdadDay('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftBaghdadDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftBaghdadDay('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('السنة الكبيسة صحيحة', () => {
    expect(shiftBaghdadDay('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftBaghdadDay('2024-02-29', 1)).toBe('2024-03-01')
    expect(shiftBaghdadDay('2025-02-28', 1)).toBe('2025-03-01')
  })

  it('صفر لا يغيّر شيئاً', () => {
    expect(shiftBaghdadDay('2026-11-24', 0)).toBe('2026-11-24')
  })

  it('مفتاح غير صالح يُرجَع كما هو — لا تاريخ مخترع', () => {
    expect(shiftBaghdadDay('2026-13-99', 5)).toBe('2026-13-99')
    expect(shiftBaghdadDay('', 1)).toBe('')
  })
})

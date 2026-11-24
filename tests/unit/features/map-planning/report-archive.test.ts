/**
 * دوال الأرشيف النقية — بلا Supabase ولا شبكة.
 *
 * ما يُختبر هنا هو ما لو فسد لن يُكتشف إلا في أسوأ لحظة:
 *  · `sha256Hex` — لو حسبت غلطاً، كل بصمة في الأرشيف كاذبة.
 *  · `archiveFileName` — لو أنتجت محرفاً ممنوعاً، يفشل الرفع في Storage.
 *  · `archivePath` — لو خالف سياسة RLS، يُرفض الرفع بـ42501 بعد أن ضاع الوقت.
 *  · `bytesText` — لو عرض «0 م.ب» لملف 1 ك.ب، يظن المستخدم أن الملف فارغ.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_BYTES,
  archiveFileName,
  archivePath,
  bytesText,
  sha256Hex,
} from '@features/map-planning/report-archive'
import { buildExcelReport } from '@lib/export/excel-report'
import { GROUPED_COLUMNS, groupedReportColumns, toGroupedRows, type GroupedContext } from '@features/map-planning/grouped-export'
import type { GroupedVisitRow } from '@sdk/map-planning.sdk'

describe('① sha256Hex — البصمة التي يقوم عليها الإثبات', () => {
  it('«abc» = ba7816bf… (قيمة معيارية من FIPS 180-4)', async () => {
    const bytes = new TextEncoder().encode('abc')
    expect(await sha256Hex(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('النص الفارغ له بصمة معروفة — لا «خطأ» ولا undefined', async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('64 حرفاً سداسياً صغيراً دائماً — لا أحرف كبيرة ولا مسافات', async () => {
    const out = await sha256Hex(new Uint8Array([1, 2, 3]))
    expect(out).toMatch(/^[0-9a-f]{64}$/)
  })

  it('يقبل ArrayBuffer كما يقبل Uint8Array — نفس البصمة', async () => {
    const arr = new Uint8Array([9, 8, 7, 6])
    const asBuffer = arr.buffer.slice(0) as ArrayBuffer
    expect(await sha256Hex(asBuffer)).toBe(await sha256Hex(arr))
  })

  it('بايت واحد مختلف ⇒ بصمة مختلفة تماماً (لا انفجار تصادم)', async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]))
    const b = await sha256Hex(new Uint8Array([1, 2, 4]))
    expect(a).not.toBe(b)
    // مقياس تقريبي: أقل من نصف الأحرف متطابقة في الموضع نفسه
    const same = [...a].filter((c, i) => c === b[i]).length
    expect(same).toBeLessThan(24)
  })
})

describe('② archiveFileName — اسم يمرّ في Storage وفي أنظمة الملفات', () => {
  const at = new Date('2026-11-24T09:05:00Z')

  it('ينتهي بـ .xlsx دائماً', () => {
    expect(archiveFileName('sheet', 'أرخيتة', '2026-11-24', at)).toMatch(/\.xlsx$/)
  })

  it('يبدأ بمعرّف النوع — البحث في الأرشيف يقفز للنوع مباشرة', () => {
    expect(archiveFileName('full', 'أرخيتة', '2026-11-24', at)).toMatch(/^full__/)
  })

  it('لا محارف ممنوعة في أنظمة الملفات ولا مسافات', () => {
    const name = archiveFileName('sheet', 'الكرادة / شارع ٦٠ #٢', '2026-11-24', at)
    expect(name).not.toMatch(/[\\/:*?"<>|#%\s]/)
  })

  it('اسم زون فارغ لا يُنتج شرطتين متتاليتين', () => {
    expect(archiveFileName('sheet', '', '2026-11-24', at)).toMatch(/^sheet__زون__/)
  })

  it('اسم زون طويل جداً يُقصّ ولا ينفجر', () => {
    const name = archiveFileName('sheet', 'ا'.repeat(200), '2026-11-24', at)
    expect(name.length).toBeLessThan(120)
  })

  it('الطابع الزمني يمنع التصادم بين تصديرين في نفس اليوم', () => {
    const a = archiveFileName('sheet', 'أرخيتة', '2026-11-24', new Date('2026-11-24T09:05:00Z'))
    const b = archiveFileName('sheet', 'أرخيتة', '2026-11-24', new Date('2026-11-24T14:37:00Z'))
    expect(a).not.toBe(b)
  })

  it('اليوم في الاسم يطابق يوم التقرير لا تاريخ الجهاز', () => {
    expect(archiveFileName('sheet', 'أرخيتة', '2026-10-01', at)).toContain('2026-10-01')
  })
})

describe('③ archivePath — مطابقة سياسة RLS حرفياً', () => {
  const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('يبدأ بـ reports/ — شرط `like reports/%` في القاعدة', () => {
    expect(archivePath(uid, '2026-11-24', 'x.xlsx')).toMatch(/^reports\//)
  })

  it('يحتوي مجلد المستخدم مباشرة بعد reports/', () => {
    // السياسة: name like 'reports/' || auth.uid()::text || '/%'
    expect(archivePath(uid, '2026-11-24', 'x.xlsx')).toContain(`reports/${uid}/`)
  })

  it('شكل المسار: reports/<uid>/<yyyy-mm>/<day>/<file>', () => {
    expect(archivePath(uid, '2026-11-24', 'f.xlsx')).toBe(
      `reports/${uid}/2026-11/2026-11-24/f.xlsx`,
    )
  })

  it('مجلد الشهر مشتق من اليوم — لا من تاريخ التشغيل', () => {
    expect(archivePath(uid, '2026-03-09', 'f.xlsx')).toContain('/2026-03/2026-03-09/')
  })
})

describe('④ bytesText — رقم صادق لا «0 م.ب»', () => {
  it('ملف صغير بالبايتات', () => {
    expect(bytesText(512)).toBe('512 بايت')
  })

  it('الكيلوبايتات بلا كسور — 1.4 ك.ب يُقرأ «1 ك.ب»', () => {
    expect(bytesText(1434)).toBe('1 ك.ب')
  })

  it('الميجابايت بكسور — الدقة هنا مفيدة (٢٤.٧ م.ب)', () => {
    expect(bytesText(25900000)).toBe('24.7 م.ب')
  })

  it('صفر أو سالب أو NaN ⇒ شرطة لا «0»', () => {
    expect(bytesText(0)).toBe('—')
    expect(bytesText(-5)).toBe('—')
    expect(bytesText(Number.NaN)).toBe('—')
  })

  it('الحد الأقصى يُعرض بميجابايت صحيحة', () => {
    expect(bytesText(MAX_BYTES)).toBe('25.0 م.ب')
  })
})

describe('⑤ ملف Excel فعلي — الأعمدة الـ٢٦ تصل إلى الخلايا', () => {
  /** صفّ تجريبي يحمل قيمة مميزة في **كل** حقل من حقول GroupedVisitRow */
  const row: GroupedVisitRow = {
    placeday: '2026-11-24',
    vehicle_id: 'v-1',
    zone_id: 'z-1',
    db_number: 'DB-101',
    plate_number: '12345',
    vehicle_name: 'كابسة كبيرة',
    driver_name: 'علي حسين',
    zone_name: 'أرخيتة',
    mahalla_number: '321',
    mahalla_code: 'MHL-321',
    mahalla_name: 'محطة',
    alley_week_or_num: '12,15,18',
    alley_names: 'زقاق ١٢، زقاق ١٥',
    street_names: 'شارع ٦٠',
    street_mahalla_source: 'street',
    visits_count: 7,
    total_dwell_seconds: 1830,
    shift: 'morning',
    alleys_count: 3,
    streets_count: 1,
    confirmed_count: 5,
    uncertain_count: 2,
    first_entered_at: '2026-11-24T06:12:00Z',
    last_exited_at: '2026-11-24T09:41:00Z',
    avg_dwell_seconds: 261,
    max_depth_m: 145,
  }

  const ctx: GroupedContext = { zoneName: 'أرخيتة', shiftLabel: () => 'صباحي', day: '2026-11-24' }

  it('كل الأعمدة الـ٢٦ تُنتج قيمة — لا عمود فارغ في الملف الرسمي', () => {
    for (const col of GROUPED_COLUMNS) {
      if (col.id === 'seq' || col.id === 'mahalla_source') continue
      const v = col.value(row, ctx)
      expect(v, `${col.id} رجع null`).not.toBeNull()
    }
  })

  it('الترويسات فريدة — لا عمودان بنفس العنوان في الورقة', () => {
    const headers = GROUPED_COLUMNS.map((c) => c.header)
    expect(new Set(headers).size).toBe(headers.length)
  })

  it('المصنف يُبنى بـ٢٦ عموداً وصفّ واحد، والاسم مطبَّع', async () => {
    const wb = await buildExcelReport({
      sheetName: 'كل/الأعمدة ٢٦',
      title: 'تدقيق',
      columns: groupedReportColumns(),
      rows: toGroupedRows([row], ctx),
      fileName: 'x.xlsx',
      deferSave: true,
    })
    const ws = wb.worksheets[0]!
    expect(ws.name).toBe('كل–الأعمدة ٢٦')   // الشرطة المائلة استُبدلت
    expect(ws.name.length).toBeLessThanOrEqual(31)
    const header = ws.getRow(5)
    expect(header.cellCount).toBe(26)
    // قيم الصفّ الأول: الرقم التسلسلي 1 ثم DB-101
    expect(ws.getRow(6).getCell(1).value).toBe(1)
    expect(String(ws.getRow(6).getCell(2).value)).toBe('DB-101')
  })

  it('التاريخ في الخلية بصيغة يوم بغداد لا UTC', async () => {
    const wb = await buildExcelReport({
      sheetName: 'ت', title: 'ت', columns: groupedReportColumns(['first_entered']),
      rows: toGroupedRows([row], ctx), fileName: 'x.xlsx', deferSave: true,
    })
    // 06:12Z ⇒ 09:12 بغداد (UTC+3)
    expect(String(wb.worksheets[0]!.getRow(6).getCell(1).value)).toBe('09:12')
  })
})

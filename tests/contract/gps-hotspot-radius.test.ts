/**
 * 00389 — عقد «نصف قطر البقعة» القابل للتخصيص (الجولة 32).
 *
 * الخلل/الميزة: نصف القطر كان ثابتاً 80 م (wh_settings.hotspot_radius_m) بلا أي واجهة لتغييره،
 * فتُدمج بقع متباعدة 60–79 م في بقعة واحدة كبيرة. الآن: قائمة 20/30/40/50/60/80/100،
 * زر في بوابة IT فقط، وإعادة بناء الأشهر داخل النافذة في المستودع ثم نسخها.
 *
 * يمنع هذا الملف: (أ) إضافة الخيارات في الواجهة دون دالة في المستودع، (ب) قبول قيمة خارج 20..500،
 * (ج) نسخ شهر فارغ أثناء إعادة التجميع فيمسح نسخة المشروع الأول، (د) توسيع الصلاحيات.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const warehouseSql = readFileSync(join(ROOT, 'gps-warehouse/supabase/migrations/0008_hotspot_radius.sql'), 'utf8')
const bridge = readFileSync(join(ROOT, 'supabase/functions/gps-warehouse/index.ts'), 'utf8')
const card = readFileSync(join(ROOT, 'src/features/gps-warehouse/GpsWarehouseCard.tsx'), 'utf8')
const sdk = readFileSync(join(ROOT, 'src/services/gps-warehouse.sdk.ts'), 'utf8')
const page = readFileSync(join(ROOT, 'src/portals/ops-room/pages/WasteMap/OpsWasteMapPage.tsx'), 'utf8')

describe('⚙️ نصف قطر البقعة القابل للتخصيص (00389)', () => {
  it('المستودع: دالة إعداد واحدة تتحقق 20..500 وتُعيد القديم/الجديد وتُعيد بناء الأشهر', () => {
    expect(warehouseSql).toMatch(/wh_hotspots_set_radius\(\s*p_radius_m int,\s*p_months date\[\]/)
    expect(warehouseSql).toContain('p_radius_m < 20 or p_radius_m > 500')
    expect(warehouseSql).toContain("'old_radius_m', old_r")
    expect(warehouseSql).toContain('perform public.wh_hotspots_rebuild(m)')
    // نسخة ٢: رفع مهلة التنفيذ داخل الدالة (إصلاح statement timeout) + ضبط القيمة بلا إعادة بناء
    expect(warehouseSql).toContain("perform set_config('statement_timeout'")
    expect(warehouseSql).toContain('p_rebuild boolean default true')
    expect(warehouseSql).toContain('wh_hotspots_rebuild_status')
    // لا تمسّ بيانات خام ولا نافذة شهرية
    expect(warehouseSql).not.toMatch(/delete from public\.wh_stops/i)
    expect(warehouseSql).not.toMatch(/drop table/i)
    // المالك فقط
    expect(warehouseSql).toContain('revoke all on function public.wh_hotspots_set_radius(int, date[], boolean) from public, anon, authenticated')
    expect(warehouseSql).toContain('revoke all on function public.wh_hotspots_rebuild_status() from public, anon, authenticated')
  })

  it('الجسر: إجراء set_hotspot_radius يرفض القيم غير الصالحة ويستدعي المستودع', () => {
    expect(bridge).toContain("'set_hotspot_radius'")
    expect(bridge).toContain("GPS_HOTSPOT_RADIUS_INVALID")
    expect(bridge).toContain("'wh_hotspots_set_radius'")
    // على الإجراءات الكتابية فقط (لا قراءة)
    expect(bridge).toContain("const READ_ROLES = ['ops_room', 'it_admin', 'super_admin'], WRITE_ROLES = ['it_admin', 'super_admin']")
  })

  it('الجسر: لا يُنسخ شهر فارغ (حماية نسخة المشروع الأول أثناء إعادة التجميع)', () => {
    expect(bridge).toContain('skipped_empty_months')
    // 00389-ب: مهلة أطول للعملية الثقيلة + رمز مهلة واضح + رد 504 بدل 502 المبهم
    expect(bridge).toContain('180_000')
    expect(bridge).toContain('GPS_WAREHOUSE_STATEMENT_TIMEOUT')
    expect(bridge).toContain('GPS_WAREHOUSE_TIMEOUT')
    expect(bridge).toContain('? 504 : 502')
    expect(bridge).toContain("'hotspots_status'")
    expect(bridge).toMatch(/if \(!\(probe\.total > 0\)\) \{\s*\n\s*skipped\.push/)
  })

  it('الواجهة: قائمة القيم + زر التحكم في بوابة IT فقط، والـ SDK يعرف الإجراء', () => {
    expect(card).toContain('RADIUS_OPTIONS = [20, 30, 40, 50, 60, 80, 100]')
    expect(card).toContain('data-testid="gps-warehouse-radius-select"')
    expect(card).toContain('data-testid="gps-warehouse-radius-apply"')
    expect(card).toContain('window.confirm')
    expect(sdk).toContain("'set_hotspot_radius'")
    expect(sdk).toContain('radius_m?: number')
  })

  it('الخريطة: تُظهر نصف القطر المعتمد وتُخفي أزرار القواطع بلا بقع', () => {
    expect(page).toContain('visibleSectorOptions(sectorOptions, sectorCoverage.counts, filters.sectorIds)')
    expect(page).toContain('{shownSectors.map(')
    expect(page).toContain('radiusLabel(thresholds)')
    expect(page).toContain('data-testid="waste-map-sectors-hidden"')
  })

  // 00389-د: منع بدء إعادة بناء ثانية أثناء الجريان (تؤدي لتصفير الحسابات ويبدو النظام معطلاً)
  it('الجسر يرفض إعادة بناء جديدة أثناء جريان واحدة (409 + رمز واضح)', () => {
    expect(bridge).toContain('GPS_HOTSPOT_REBUILD_IN_PROGRESS')
    expect(bridge).toMatch(/if \(st && \(\(st\.stops_pending \?\? 0\) > 0 \|\| \(st\.hotspots_dirty \?\? 0\) > 0\)\)/)
    expect(sdk).toContain('skipped_empty_months?: string[]')
    expect(sdk).toContain('months?: string[]')
    const errors = readFileSync(join(ROOT, 'src/features/gps-lvn/lvn-errors.ts'), 'utf8')
    expect(errors).toContain('GPS_HOTSPOT_REBUILD_IN_PROGRESS')
  })
})

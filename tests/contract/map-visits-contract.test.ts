/**
 * عقد الزيارات والتغطية (المرحلة ⑤) — يُثبّت المبدأ الحاكم:
 *   «لا صفر كاذب» — كل مكان إما مؤكد أو غير مؤكد بسببه أو لم تُدخل.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatDwell,
  VISIT_STATUS_LABEL_AR,
  visitDisplayStatus,
  type MapVisit,
} from '@sdk/map-planning.sdk'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/**
 * قراءة «الكود الحيّ» فقط: نُسقط أسطر التعليق كي لا يُطابق النص الذي **يوثّق** العيب
 * (مثل «كان هنا T00:00:00Z») فيبدو كأنه ما زال قائماً.
 */
const codeOnly = (p: string) => read(p)
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('--') && !t.startsWith('*') && !t.startsWith('/*')
  })
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n')

const visit = (over: Partial<MapVisit> = {}): MapVisit => ({
  id: 'v1', zone_id: 'z1', vehicle_id: 'veh', device_id: 'dev',
  place_kind: 'street', place_id: 'p1', place_code: 'STR-0001', place_name: 'شارع',
  placeday: '2026-11-22', seq: 1, entered_at: '2026-11-22T09:00:00Z',
  exited_at: '2026-11-22T09:07:00Z', dwell_seconds: 420, points_count: 8,
  max_depth_m: 2.1, status: 'confirmed', reason: null,
  created_at: '2026-11-22T09:10:00Z', ...over,
})

describe('① الحالات الثلاث صريحة', () => {
  it('المؤكد يُعرض «مؤكد»', () => {
    expect(visitDisplayStatus(visit())).toBe('confirmed')
    expect(VISIT_STATUS_LABEL_AR[visitDisplayStatus(visit())]).toBe('مؤكد')
  })

  it('غير المؤكد يُعرض «غير مؤكد» ويحمل سبباً', () => {
    const v = visit({ status: 'uncertain', dwell_seconds: 40, reason: 'مكوث 40ث أقل من الحد 60ث' })
    expect(visitDisplayStatus(v)).toBe('uncertain')
    expect(VISIT_STATUS_LABEL_AR[visitDisplayStatus(v)]).toBe('غير مؤكد')
    expect(v.reason).toBeTruthy()
  })

  it('غياب الزيارة = «لم تُدخل» وليس صفراً', () => {
    expect(visitDisplayStatus(null)).toBe('not_entered')
    expect(visitDisplayStatus(undefined)).toBe('not_entered')
    expect(VISIT_STATUS_LABEL_AR.not_entered).toBe('لم تُدخل')
  })
})

describe('② تنسيق المكوث', () => {
  it('أقل من دقيقة بالثواني', () => expect(formatDwell(40)).toBe('40 ث'))
  it('دقيقة وأكثر', () => expect(formatDwell(90)).toBe('1 د 30 ث'))
  it('سبع دقائق', () => expect(formatDwell(420)).toBe('7 د 0 ث'))
  it('مجهول = شرطة لا صفر', () => expect(formatDwell(null)).toBe('—'))
})

describe('③ الثوابت تطابق قيود القاعدة', () => {
  it('حالة الزيارة محصورة في confirmed|uncertain', () => {
    const sql = read('supabase/migrations/20261122000700_map_visits_engine.sql')
    expect(sql).toMatch(/check \(status in \('confirmed','uncertain'\)\)/)
    expect(Object.keys(VISIT_STATUS_LABEL_AR).filter((k) => k !== 'not_entered')).toEqual([
      'confirmed', 'uncertain',
    ])
  })

  it('map_visits جدول دائم لا يُحذف بتفريغ النقاط', () => {
    const sql = read('supabase/migrations/20261122000700_map_visits_engine.sql')
    expect(sql).not.toMatch(/delete from public\.map_visits[^;]*placeday < /)
    // التفريغ اليومي يخصّ gps_device_position_history وحده
    const cron = read('supabase/migrations/00328_gps_history_daily_purge.sql')
    expect(cron).toMatch(/gps_device_position_history/)
    expect(cron).not.toMatch(/map_visits/)
  })

  it('المحرّك idempotent عبر مفتاح فريد', () => {
    const sql = read('supabase/migrations/20261122000700_map_visits_engine.sql')
    expect(sql).toMatch(/unique index if not exists map_visits_uk/)
    expect(sql).toMatch(/on conflict \(vehicle_id, place_kind, place_id, entered_at\) do nothing/)
  })
})

describe('④ الصفحة والمسار', () => {
  it('المسار مسجَّل في بوابة العمليات', () => {
    expect(read('src/portals/ops-room/routes.tsx')).toMatch(/'map-planning\/visits'/)
  })

  it('الصفحة تستخدم ExecPageHeader بلا h1', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx')
    expect(src).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
    expect(src).not.toMatch(/<h1\b/)
  })

  it('زر التشغيل معطَّل أثناء الانتظار', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx')
    expect(src).toMatch(/disabled=\{build\.isPending/)
  })

  it('الواجهة لا تستورد supabase مباشرة (RLS عند الحد)', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx')
    expect(src).not.toMatch(/from '.*\/client'/)
    expect(src).toMatch(/@features\/map-planning\/hooks\/useMapPlanning/)
  })
})

/**
 * 20261128000100 — عقد «الشهادة قبل الحذف».
 *
 * العطل الأصلي: التفريغ اليومي كان `truncate` شاملاً بلا شرط عمر ولا بناء ⇒ فقدان يوم كامل
 * إذا لم يضغط أحد «استخراج». هذه الاختبارات تثبّت أن الواجهة لا تستطيع إعادة إدخال الخلل:
 *   · لا نافذة UTC يدوية في أي صفحة
 *   · البناء يمرّ بالدالة المسجَّلة (التي تمنح الشهادة)
 *   · حالة الشهادة ظاهرة للمستخدم قبل أي حذف
 */
describe('① الشهادة قبل الحذف (20261128000100)', () => {
  const PAGES = [
    'src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx',
    'src/portals/ops-room/pages/MapPlanning/OpsMapVehicleVisitsPage.tsx',
  ]

  it('لا توجد نافذة T00:00:00Z–T23:59:59Z في أي صفحة زيارات', () => {
    for (const p of PAGES) {
      const src = codeOnly(p)
      expect(src, `${p} ما زال يرسل نافذة UTC`).not.toMatch(/T00:00:00Z/)
      expect(src, `${p} ما زال يرسل نافذة UTC`).not.toMatch(/T23:59:59Z/)
    }
  })

  it('البناء يُمرَّر بتاريخ يوم بغداد لا بنافذة زمنية', () => {
    for (const p of PAGES) {
      const src = codeOnly(p)
      // إمّا سطر واحد `build.mutate({ zoneId: ..., day })` أو بلوك ينتهي بـ `day })`
      expect(src, p).toMatch(/build\.mutate\(/)
      expect(src, p).not.toMatch(/build\.mutate\([^)]*\bfrom:/s)
      expect(src, p).toMatch(/\bday\b[^)]*\)\s*\}/s)
    }
  })

  it('صفحة الزيارات تعرض شارة الحماية (محميّ / غير محميّ)', () => {
    const src = read('src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx')
    expect(src).toMatch(/useDayCertified/)
    expect(src).toMatch(/data-testid="visits-certification"/)
    expect(src).toMatch(/محميّ/)
    expect(src).toMatch(/غير محميّ/)
  })

  it('الـSDK يستدعي الدالة المسجَّلة map_visit_build_logged (لا map_build_visits)', () => {
    const src = read('src/services/map-planning.sdk.ts')
    const block = src.slice(src.indexOf('async buildVisits'), src.indexOf('async buildVisits') + 900)
    expect(block).toMatch(/'map_visit_build_logged'/)
    expect(block).not.toMatch(/'map_build_visits'/)
    expect(block).toMatch(/p_day: input\.day/)
  })

  it('الترحيل لا يحذف بلا شهادة ولا يستعمل truncate', () => {
    const sql = read('supabase/migrations/20261128000100_gps_retention_build_ledger.sql')
    const live = codeOnly('supabase/migrations/20261128000100_gps_retention_build_ledger.sql')
    expect(live).toMatch(/gps_day_is_certified/)
    // الكود الحيّ (بلا تعليقات) لا يحذف الجدول كاملاً بأي صيغة
    expect(live).not.toMatch(/truncate\s+table\s+public\.gps_device_position_history/i)
    expect(live).not.toMatch(/truncate\s+table/i)
    expect(sql).toMatch(/keep_hours/)
    // الترتيب: البناء قبل التفريغ في نفس الجدولة
    expect(sql.indexOf('gps-visits-build-nightly')).toBeLessThan(sql.indexOf("cron.schedule('gps-history-purge-midnight'"))
  })

  it('map_visits في كتالوج الاحتفاظ بشهر واحد وتصدير إلزامي', () => {
    const sql = read('supabase/migrations/20261128000100_gps_retention_build_ledger.sql')
    expect(sql).toMatch(/\('map_visits',\s*'ops'/)
    expect(sql).toMatch(/'map_visits',\s*'entered_at',\s*null,/)
    expect(sql).toMatch(/true,\s*1,\s*true\)/)
  })
})

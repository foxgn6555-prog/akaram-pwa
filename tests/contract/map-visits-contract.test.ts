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

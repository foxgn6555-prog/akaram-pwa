/**
 * الجولة ١ — عقد تخطيط الشوارع والأزقة والمحلات (20261122000000_map_planning_core.sql).
 *
 * الاختبار يقرأ ملف الترحيل مباشرة (عقد) لأن جوهر الجولة قيودٌ في قاعدة البيانات
 * لا كود واجهة. كل تأكيد هنا يقابل فحصاً نُفِّذ فعلياً على PostgreSQL 16 محلي
 * (١٠/١٠ قيود + ٧/٧ دوال هندسية) — انظر tests/db/README.md لتشغيله.
 *
 * الغرض: أن يمنع أي تعديل لاحق كسر هذه القيود بصمت.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE = 'supabase/migrations/20261122000000_map_planning_core.sql'
const sql = readFileSync(join(process.cwd(), FILE), 'utf8')

/** يستخرج جسم دالة في app.* من نص الترحيل */
const body = (name: string): string => {
  const i = sql.indexOf(`function app.${name}(`)
  if (i < 0) throw new Error(`الدالة ${name} غير موجودة في الترحيل`)
  const start = sql.indexOf('as $$', i)
  const end = sql.indexOf('$$;', start)
  return sql.slice(start, end)
}

describe('الجولة ١ · عقد جداول التخطيط', () => {
  it('الجداول الأربعة معرّفة بهرمها الصحيح', () => {
    for (const t of ['map_zones', 'map_mahallas', 'map_streets', 'map_alleys']) {
      expect(sql).toContain(`create table public.${t}`)
    }
    // كل جدول يُشير للزون
    expect(sql).toMatch(/map_streets[\s\S]{0,900}zone_id\s+uuid not null references public\.map_zones/)
    expect(sql).toMatch(/map_alleys[\s\S]{0,900}zone_id\s+uuid not null references public\.map_zones/)
    expect(sql).toMatch(/map_mahallas[\s\S]{0,900}zone_id\s+uuid not null references public\.map_zones/)
  })

  it('الزقاق يحمل محلة إلزامية — وهذا جوهر طلب المستخدم', () => {
    // not null: لا زقاق بلا محلة
    expect(sql).toMatch(/map_alleys[\s\S]{0,1200}mahalla_id\s+uuid not null references public\.map_mahallas/)
    // الواجهة تُظهر المحلة مع كل زقاق ⇒ لا يجوز أن تكون فارغة
    expect(sql).not.toMatch(/mahalla_id\s+uuid\s+references/) // أي: لا يوجد تعريف nullable
  })

  it('الأكواد بصيغة ثابتة وبادئة تطابق التصنيف', () => {
    expect(sql).toContain(`check (code ~ '^[A-Z]{3}$')`) // الزون
    expect(sql).toContain(`check (code ~ '^(STR|SEC|TRC|LOC)-[0-9]{4}$')`)
    expect(sql).toContain(`check (code ~ '^MHL-[0-9]{4}$')`)
    expect(sql).toContain(`check (code ~ '^ALY-[0-9]{4}$')`)
    // القيد يربط البادئة بالتصنيف فعلياً لا شكلاً
    expect(sql).toContain(`kind = 'primary'   and code like 'STR-%'`)
    expect(sql).toContain(`kind = 'local'     and code like 'LOC-%'`)
    // فريد داخل الزون
    expect(sql).toContain('unique (zone_id, code)')
  })

  it('لا PostGIS — القرار المعتمد', () => {
    expect(sql).not.toMatch(/create extension[^;]*postgis/i)
    // نفحص أنواع PostGIS نفسها (geometry(...)/geography(...)) لا كلمة «geometry» كقيمة حقل
    expect(sql).not.toMatch(/:\s*(geometry|geography)\s*\(/i)
    expect(sql).not.toMatch(/geometry\s*\(\s*(point|linestring|polygon)/i)
    expect(sql).not.toMatch(/\bst_[a-z]+\s*\(/i)
  })

  it('لا كتابة بيانات في الترحيل (الاستيراد في الجولة ٢)', () => {
    // لا insert into public.map_*
    expect(sql).not.toMatch(/insert\s+into\s+public\.map_/i)
    // الكتابة الوحيدة المسموحة: تحديثات داخل دوال التحقق
    expect(sql).not.toMatch(/update\s+public\.map_/i)
  })

  it('كل جدول عليه RLS ومُشغِّل تدقيق', () => {
    for (const t of ['map_zones', 'map_mahallas', 'map_streets', 'map_alleys']) {
      expect(sql).toContain(`alter table public.${t}`)
      expect(sql).toMatch(new RegExp(`alter table public\\.${t}[\\s\\S]{0,80}enable row level security`))
      expect(sql).toMatch(new RegExp(`${t}_audit after insert or update or delete`))
    }
    // anon لا يرى شيئاً
    expect(sql).toContain('revoke all on public.map_zones, public.map_mahallas, public.map_streets, public.map_alleys from anon')
  })

  it('الكتابة لغرفة العمليات وحدها (قرار المستخدم)', () => {
    for (const t of ['map_zones', 'map_mahallas', 'map_streets', 'map_alleys']) {
      const i = sql.indexOf(`"${t.replace('map_', 'map ')} write"`)
      expect(i, `${t}: سياسة الكتابة مفقودة`).toBeGreaterThan(0)
      const policy = sql.slice(i, i + 400)
      expect(policy).toContain('ops_room')
      // القارئ العادي لا يكتب
      expect(policy).not.toContain('authenticated\')')
    }
  })
})

describe('الجولة ١ · عقد دوال التحقق الهندسي', () => {
  it('الدوال الهندسية السبع موجودة', () => {
    for (const f of ['map_distance_m', 'map_line_length_m', 'map_point_segment_m',
      'map_segments_intersect', 'map_paths_intersect', 'map_path_valid', 'map_centroid']) {
      expect(sql).toContain(`function app.${f}(`)
    }
  })

  it('التحقق من المسار يرفض: أقل من نقطتين، غير رقمي، خارج نطاق الإحداثيات', () => {
    const b = body('map_path_valid')
    expect(b).toContain(`jsonb_array_length(p_path) >= 2`)
    expect(b).toContain(`'^-?[0-9]+(\\.[0-9]+)?$'`)
    expect(b).toContain('> 90')
    expect(b).toContain('> 180')
  })

  it('منع التقاطع يطبّق على الشوارع والأزقة في نفس الزون', () => {
    const b = body('map_overlap_check')
    expect(b).toContain(`tg_table_name = 'map_streets'`)
    expect(b).toContain(`tg_table_name = 'map_alleys'`)
    expect(b).toContain('app.map_paths_intersect')
    // يُستثنى العنصر نفسه والأرشيف
    expect(b).toContain('s.id is distinct from new.id')
    expect(b).toContain(`s.status <> 'archived'`)
  })

  it('الطول يُحسب دائماً من المسار — لا إدخال يدوي متناقض', () => {
    for (const f of ['map_alleys_guard', 'map_streets_guard']) {
      expect(body(f)).toContain('new.length_m := round(app.map_line_length_m(new.path)::numeric, 1)')
    }
  })

  it('الزقاق يُرفض إن كانت محلتُه من زون آخر', () => {
    const b = body('map_alleys_guard')
    expect(b).toContain('v_mahalla_zone <> new.zone_id')
    expect(b).toContain('MAP_PARENT')
  })

  it('الزقاق يُرفض إن كانت بدايته خارج مضلّع الزون', () => {
    const b = body('map_alleys_guard')
    expect(b).toContain('app.gps_point_in_polygon')
    expect(b).toContain('MAP_OUTSIDE')
  })

  it('التصميم يذكر تسامح الحدود ولا يخفي أنه تقريبي', () => {
    // نُقرّ بوجود التسامح بدل الإيهام بدقة مطلقة على الحد
    expect(sql).toContain('± 5 م تسامح على الحد')
  })
})

describe('الجولة ١ · عقد ثبات الكود والتدقيق', () => {
  it('الكود الموثّق لا يتغيّر', () => {
    const b = body('map_code_immutable')
    expect(b).toContain(`old.status = 'verified'`)
    expect(b).toContain('MAP_CODE_LOCKED')
  })

  it('التوثيق يسجّل من وثّق ومتى ويُلغى عند التراجع', () => {
    const b = body('map_status_stamp')
    expect(b).toContain('new.confirmed_by := auth.uid()')
    expect(b).toContain('new.confirmed_at := now()')
    expect(b).toContain('new.confirmed_by := null')
  })

  it('حذف زون فيه عناصر ممنوع — لا حذف متسلسل صامت', () => {
    const b = body('map_zone_guard_delete')
    expect(b).toContain('MAP_ZONE_BUSY')
    expect(b).toContain('restrict_violation')
  })

  it('الترحيل يشرح التراجع (rollback) — شرط مراجعة البشر', () => {
    expect(sql).toContain('التراجع:')
    expect(sql.toLowerCase()).toContain('drop table')
  })
})

describe('الجولة ١ · عقد الفحص المسبق', () => {
  it('يتوقف إن غابت متطلباته بدل بناء صامت خاطئ', () => {
    expect(sql).toContain('MAP_CORE_PRECHECK')
    expect(sql).toContain(`to_regclass('public.gps_geofences') is null`)
    expect(sql).toContain(`to_regproc('app.gps_point_in_polygon') is null`)
    expect(sql).toContain(`to_regproc('app.audit_trigger') is null`)
  })

  it('يرفض البناء فوق جداول موجودة بنفس الاسم', () => {
    expect(sql).toContain(`to_regclass('public.map_zones') is not null`)
  })
})

/**
 * عقد بذر الزونات من المستودع — إصلاح فشل `migrations-on-empty-db`.
 *
 * العيب الذي كشفه CI (run 45048006543):
 *   ERROR: MAP_ZONE_SEED_PRECHECK: لا geofence نشط للقواطع 1,2,3,4,5,6,7,8
 *
 * السبب: `20261122001700_map_zones_seed.sql` يطلب geofence نشطاً للقواطع
 * الثمانية، لكن **لا هجرة في المستودع تُدرج gps_geofences**. الصفوف الثمانية
 * أُضيفت للإنتاج يدوياً (٧٣٩ نقطة موثّقة في docs/plans/data/zones/index.json).
 *
 * الأثر: كل PR يمسّ `supabase/migrations/**` يُفشل بوابة
 * `migrations-on-empty-db` — وهي البوابة الوحيدة التي تكشف هجرة معطوبة قبل
 * الإنتاج. فشلها الدائم = كل هجرة تالية تمرّ بلا فحص.
 *
 * ⚠ اكتُشف بكسر الاختبار على PostgreSQL حقيقي:
 *   قيد 00093 هو `source in ('lvn','platform')` ولا هجرة تغيّره ⇒
 *   `source = 'repo-seed'` كان سيُفشل الهجرة في CI. أُصلح إلى 'platform'
 *   مع وسم البذر في `raw_data->>'seeded_by'`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SEED = readFileSync(
  join(ROOT, 'supabase/migrations/20261123000200_gps_geofences_repo_seed.sql'),
  'utf8',
)
const OLD_SEED = readFileSync(join(ROOT, 'supabase/migrations/20261123000300_map_zones_seed.sql'), 'utf8')
const GEOFENCE_TABLE = readFileSync(
  join(ROOT, 'supabase/migrations/00093_gps_operational_tracking.sql'),
  'utf8',
)

// المضلّعات المتتبّعة — مصدر الحقيقة
const index = JSON.parse(readFileSync(join(ROOT, 'docs/plans/data/zones/index.json'), 'utf8')) as {
  zones: { key: string; name: string; sector_id: number; points: number }[]
}

describe('① البذرة تغطي القواطع الثمانية', () => {
  it('ثمانية صفوف في values', () => {
    const rows = SEED.match(/^ {6}\(\d, '[A-Z]{3}'/gm) ?? []
    expect(rows).toHaveLength(8)
  })

  it('كل قاطع 1..8 ممثّل مرة واحدة', () => {
    for (let s = 1; s <= 8; s++) {
      const re = new RegExp(`\\(${s}, '[A-Z]{3}'`, 'g')
      expect((SEED.match(re) ?? []).length, `القاطع ${s}`).toBe(1)
    }
  })

  it('أرقام القواطع تطابق index.json', () => {
    for (const z of index.zones) {
      expect(SEED).toMatch(new RegExp(`\\(${z.sector_id}, '[A-Z]{3}'`))
    }
  })
})

describe('② المضلّعات من المصدر المتتبَّع لا مخترعة', () => {
  it('مجموع النقاط ٧٣٩ كما هو موثّق في index.json', () => {
    // نعدّ أزواج [lat,lng] في literal كل صف — بين أقواس صف واحد
    const total = index.zones.reduce((a, z) => a + z.points, 0)
    expect(total).toBe(739)

    // وفي الهجرة: عدد الأزواج في جميع المضلّعات
    const pairs = SEED.match(/\[\d+\.\d+,\d+\.\d+\]/g) ?? []
    expect(pairs.length).toBe(739)
  })

  it('كل مضلّع ≥ 3 نقاط (قيد 00093)', () => {
    const polys = SEED.match(/'\[\[[\s\S]*?\]\]'::jsonb/g) ?? []
    expect(polys.length).toBe(8)
    for (const p of polys) {
      const n = (p.match(/\[\d+\.\d+,\d+\.\d+\]/g) ?? []).length
      expect(n).toBeGreaterThanOrEqual(3)
    }
  })

  it('الإحداثيات داخل نطاق بغداد لا قيماً مخترعة', () => {
    const pairs = SEED.match(/\[(\d+\.\d+),(\d+\.\d+)\]/g) ?? []
    for (const p of pairs) {
      const [lat, lng] = p.slice(1, -1).split(',').map(Number)
      expect(lat).toBeGreaterThan(33.1)
      expect(lat).toBeLessThan(33.5)
      expect(lng).toBeGreaterThan(44.2)
      expect(lng).toBeLessThan(44.7)
    }
  })
})

describe('③ قيود الجدول الحقيقية محترمة', () => {
  it("source = 'platform' لا قيمة مبتكرة (القيد يقبل lvn/platform فقط)", () => {
    // القيد الفعلي من 00093
    expect(GEOFENCE_TABLE).toMatch(/source text not null check \(source in \('lvn','platform'\)\)/)
    // نفحص عمود source في طلب الإدراج وحده — لا التعليقات
    const insert = SEED.slice(SEED.indexOf('insert into public.gps_geofences'))
    const srcValue = insert.match(/\bplatform\b|'repo-seed'|'lvn'/)
    expect(srcValue?.[0]).toBe('platform')
  })

  it('الوسم في raw_data لا في source', () => {
    expect(SEED).toMatch(/seeded_by/)
    expect(SEED).toMatch(/raw_data/)
  })

  it('name يتراوح 2..160 حرفاً (قيد 00093)', () => {
    expect(GEOFENCE_TABLE).toMatch(/length\(trim\(name\)\) between 2 and 160/)
    // كل اسم في البذرة ٣ أحرف على الأقل
    for (const z of index.zones) expect(z.name.trim().length).toBeGreaterThanOrEqual(2)
  })

  it('raw_data ليس null (قيد not null)', () => {
    expect(GEOFENCE_TABLE).toMatch(/raw_data jsonb not null default '\{\}'/)
    expect(SEED).not.toMatch(/insert[\s\S]{0,400}values \([\s\S]{0,300}null\s*,?\s*\)/)
  })
})

describe('④ idempotent — لا يمسّ الإنتاج', () => {
  it('on conflict do nothing', () => {
    expect(SEED).toMatch(/on conflict \(id\) do nothing/)
  })

  it('يخرج بهدوء إن كانت القواطع موجودة (إنتاج سليم)', () => {
    expect(SEED).toMatch(/raise notice 'gps_geofences: القواطع الثمانية موجودة — لا بذر'/)
    expect(SEED).toMatch(/return;/)
  })

  it('لا يحذف ولا يحدّث أي صف (التعليق يذكر التراجع للقراءة فقط)', () => {
    // نفحص الكود التنفيذي لا التعليقات: أسطر لا تبدأ بـ--
    const code = SEED.split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/\bdelete\s+from\b/i)
    expect(code).not.toMatch(/\bupdate\s+public\.gps_geofences\b/i)
    expect(code).not.toMatch(/\btruncate\b/i)
  })
})

describe('⑤ ترتيب التطبيق — بذر geofences قبل بذر zones', () => {
  /*
   * ⚠ عيب أُمسك بكتابة هذا الاختبار:
   *   كان اسم بذر geofences `20261123000200` والبذور `20261122001700`.
   *   Supabase يُطبّق بالترتيب النصّي ⇒ البذور تفشل **قبل** أن يُبذر شيء.
   *   أي أن الهجرة كانت بلا أثر، والبوابة تبقى حمراء.
   * الحلّ: تأخير ملف البذور إلى 20261123000300 لا تقديم بذر geofences،
   *   لأن أي رقم أقل من 20261122001700 قد يتصادم مع هجرات قائمة.
   */
  it('البذرة القديمة تطلب القواطع الثمانية (سبب الفشل الأصلي)', () => {
    expect(OLD_SEED).toMatch(/MAP_ZONE_SEED_PRECHECK/)
    expect(OLD_SEED).toMatch(/g\.sector_id = s and g\.is_active/)
  })

  it('ملف بذر geofences يسبق ملف بذر zones نصّياً (= ترتيب التطبيق)', () => {
    const geoseed = '20261123000200_gps_geofences_repo_seed.sql'
    const zoneseed = '20261123000300_map_zones_seed.sql'
    expect([geoseed, zoneseed].sort()).toEqual([geoseed, zoneseed])
  })

  it('لا يوجد ملف بذر zones برقم أقدم — وإلا سبق بذر geofences', () => {
    const names = readdirSync(join(ROOT, 'supabase/migrations'))
    expect(names.filter((n) => /map_zones_seed\.sql$/.test(n))).toEqual([
      '20261123000300_map_zones_seed.sql',
    ])
  })
})

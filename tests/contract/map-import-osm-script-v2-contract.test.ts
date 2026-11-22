/**
 * عقد المرحلة ① — سكربت Overpass الذي يُنتج بيانات مطابقة للشكل.
 *
 * القياس الذي دفع إلى هذا الاختبار (docs/plans/map-import-shape-mismatch-diagnosis.md):
 *   · الملف المستورد: 132 عقدة/كم² مقابل 2000–8000 في بغداد الكثيفة
 *   · 32% من الأشواط بعقدتين فقط ⇒ خطوط مستقيمة لا منحنيات
 *   · أقصى فجوة بين عقدتين: 1135 متراً
 *
 * السبب في السكربت المولَّد (لا في خوارزمية القصّ):
 *   ① maxsize = 1 ج.ب ⇒ Overpass يقتطع **بصمت** (XML صالح، بيانات ناقصة)
 *   ② لا إرشاد للمشغّل عند الاقتطاع ⇒ يعيد بنفس الملف الناقص
 *   ③ لا حلّ جذري ⇒ يجب تصدير أرباع لا يتجاوز أيها الحدّ
 *
 * يُحرس هنا أيضاً عيب أُمسك **بالتنفيذ على PostgreSQL حقيقي** لا بقراءة الكود:
 * `v_pts text;` يبدأ NULL، و`NULL || 'نص'` = NULL إلى الأبد ⇒ سكربت `poly:""`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MIG = readFileSync(join(ROOT, 'supabase/migrations/20261123000100_map_osm_script_v2.sql'), 'utf8')
const OLD = readFileSync(join(ROOT, 'supabase/migrations/20261122001200_map_osm_script.sql'), 'utf8')
const SDK = readFileSync(join(ROOT, 'src/services/map-import.sdk.ts'), 'utf8')
const PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx'),
  'utf8',
)

describe('① maxsize: 2 ج.ب لا 1', () => {
  it('السكربت الجديد يستخدم 2147483648', () => {
    expect(MIG).toContain('maxsize:2147483648')
  })

  it('لا 1073741824 في السكربت الجديد (كان سبب الاقتطاع)', () => {
    // قد يظهر في تعليق يشرح السبب — لكن لا في نص الاستعلام نفسه
    const scriptBlocks = MIG.match(/\[out:xml\][^\n]*/g) ?? []
    expect(scriptBlocks.length).toBeGreaterThan(0)
    for (const b of scriptBlocks) expect(b).not.toContain('maxsize:1073741824')
  })

  it('الهجرة القديمة تبقى كما كانت (لا نعدّل تاريخاً مطبَّقاً)', () => {
    expect(OLD).toContain('maxsize:1073741824')
  })
})

describe('② out meta بدل out body', () => {
  it('السكربت الجديد يستخدم out meta', () => {
    expect(MIG).toMatch(/out meta;/)
  })

  it('out body اختفى من الاستعلامات الجديدة (التعليق يذكره للشرح فقط)', () => {
    // نستخرج الاستعلامات من داخل $$...$$ لا التعليقات
    const blocks = MIG.match(/\[out:xml\][\s\S]*?out (body|meta);/g) ?? []
    expect(blocks.length).toBe(2)
    for (const b of blocks) {
      expect(b).toContain('out meta;')
      expect(b).not.toContain('out body;')
    }
  })

  it('التعليق يشرح لماذا لا يغيّر الشكل', () => {
    expect(MIG).toMatch(/لا يغيّر الشكل[\s\S]{0,120}نفس العقد/)
  })
})

describe('③ إرشاد الاقتطاع للمشغّل', () => {
  it('يذكر كلمات تحذير Overpass التي يجب الانتباه لها', () => {
    for (const kw of ['runtime error', 'out of memory', 'maxsize', 'timeout']) {
      expect(MIG).toContain(kw)
    }
  })

  it('يوجّه إلى حلّ الأرباع صراحةً', () => {
    expect(MIG).toMatch(/تصدير ربع|الأرباع|أربعة أرباع/)
  })

  it('يعطي مرجعاً رقمياً لكشف النقص', () => {
    expect(MIG).toMatch(/1500[–-]4000|بالمئات|بالآلاف/)
  })
})

describe('④ الأرباع — الحلّ الجذري', () => {
  it('دالة الربع موجودة وتتحقق من المدى', () => {
    expect(MIG).toMatch(/map_osm_script_quarter/)
    expect(MIG).toMatch(/p_quarter not between 1 and 4/)
  })

  it('الرُبع يُبنى من منتصف نطاق المضلّع (لا تقدير ثابت)', () => {
    expect(MIG).toMatch(/v_mlat := \(v_lat1 \+ v_lat0\) \/ 2/)
    expect(MIG).toMatch(/v_mlng := \(v_lng1 \+ v_lng0\) \/ 2/)
  })

  it('كل ربع يستخدم maxsize 2ج.ب أيضاً', () => {
    const scriptBlocks = MIG.match(/\[out:xml\][^\n]*/g) ?? []
    expect(scriptBlocks.length).toBe(2) // الأساسي + الربع
    for (const b of scriptBlocks) expect(b).toContain('maxsize:2147483648')
  })

  it('يشرح للمشغّل أن الإدراج يدمج (on conflict)', () => {
    expect(MIG).toMatch(/on conflict/)
  })
})

describe('⑤ عيب NULL || نص — أُمسك بالتنفيذ لا بالقراءة', () => {
  it('v_pts يبدأ بسلسلة فارغة لا NULL', () => {
    expect(MIG).toMatch(/v_pts\s+text\s*:=\s*''/)
  })

  it('دالة الربع تهيّئ v_pts — لا `v_pts text;` فيها', () => {
    // ⚠ في الدالة الأساسية `v_pts text;` سليم: تُسند من app.map_zone_polygon
    //   فوراً. العيب كان في دالة الربع التي تبني النص بالحلقة من الصفر.
    const quarterFn = MIG.slice(MIG.indexOf('map_osm_script_quarter(p_zone uuid, p_quarter int)'))
    expect(quarterFn).toMatch(/v_pts\s+text := ''/)
    expect(quarterFn.slice(0, quarterFn.indexOf('begin'))).not.toMatch(/v_pts\s+text\s*;/)
  })

  it('التعليق يوثّق العيب كي لا يُعاد', () => {
    expect(MIG).toMatch(/NULL \|\| 'نص'\) = NULL|NULL \|\|[\s\S]{0,40}NULL/)
  })
})

describe('⑥ الأغلفة والصلاحيات', () => {
  it('أغلفة public موجودة للدالتين (PostgREST)', () => {
    expect(MIG).toMatch(/create or replace function public\.map_osm_script_v2/)
    expect(MIG).toMatch(/create or replace function public\.map_osm_script_quarter/)
  })

  it('سُحبت الصلاحيات عن anon', () => {
    expect(MIG).toMatch(/revoke all on function public\.map_osm_script_v2\(uuid\) from public, anon/)
    expect(MIG).toMatch(/revoke all on function public\.map_osm_script_quarter\(uuid, int\) from public, anon/)
  })

  it('مُنحت لـauthenticated', () => {
    expect(MIG).toMatch(/grant execute on function public\.map_osm_script_v2\(uuid\) to authenticated/)
  })
})

describe('⑦ الـSDK يستعمل الجديد مع تراجع آمن', () => {
  it('ينادي map_osm_script_v2 أولاً', () => {
    expect(SDK).toMatch(/rpc\('map_osm_script_v2'/)
  })

  it('يتراجع إلى الدالة القديمة إن لم تُطبَّق المهاجرة', () => {
    expect(SDK).toMatch(/catch[\s\S]{0,200}map_osm_script'/)
  })

  it('دالة الربع موجودة في SDK', () => {
    expect(SDK).toMatch(/zoneScriptQuarter/)
    expect(SDK).toMatch(/map_osm_script_quarter/)
  })
})

describe('⑧ الواجهة تُتيح اختيار الربع', () => {
  it('أزرار الأرباع الأربعة والزون الكامل', () => {
    expect(PAGE).toMatch(/تصدير الأرباع|صدّر[\s\S]{0,40}أربعة أرباع/)
    expect(PAGE).toMatch(/quarter === q/)
  })

  it('الحالة quarter تبدأ null (الزون كاملاً افتراضاً)', () => {
    expect(PAGE).toMatch(/useState<1 \| 2 \| 3 \| 4 \| null>\(null\)/)
  })

  it('يُعلَن للمشغّل أن الإدراج يدمج', () => {
    expect(PAGE).toMatch(/يدمج تلقائياً ولا يتكرّر/)
  })

  it('فشل جلب الربع لا يُعطّل الصفحة', () => {
    expect(PAGE).toMatch(/setQuarter\(null\)/)
  })
})

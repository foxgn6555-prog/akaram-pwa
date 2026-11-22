/**
 * عقد الجولة ⑤ — الأشواط اليتيمة تُكشف وتُنظَّف بأمان.
 *
 * ## العيب الذي وُجد بالتشغيل لا بالقراءة
 *
 * `map_import_batch` تُطابق بـ`osm_way_id` فلا تُكرّر ولا تُبدّل الأكواد،
 * لكنها **لا تحذف** ما اختفى من OSM. أُثبت على القاعدة الحقيقية:
 *
 *   4 شوارع ⇒ حُذف way 3001 من OSM ⇒ استيراد ثانٍ ⇒ **5 صفوف**
 *   (`LOC-0001→3001` صف يتيم لا وجود له في OSM).
 *
 * ## ما يحرسه هذا الملف
 *
 * البنية والنصوص والقيود — لا السلوك التشغيلي (ذلك أُثبت بمحاولات SQL
 * على القاعدة: التقرير، الحذف، رفض الدفعة المزيفة، وحماية الصفوف اليدوية).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MIG = readFileSync(
  join(ROOT, 'supabase/migrations/20261124000200_map_orphan_cleanup.sql'),
  'utf8',
)
const SDK = readFileSync(join(ROOT, 'src/services/map-import.sdk.ts'), 'utf8')

/** يُزيل تعليقات SQL (`--`) — وإلا التقطت الشروحُ العباراتِ نفسها */
const CODE = MIG.replace(/--[^\n]*/g, '')

describe('⑤ التقرير قراءة فقط', () => {
  it('`map_orphan_report` لا تحتوي حرفاً حذفاً', () => {
    const start = CODE.indexOf('create or replace function app.map_orphan_report')
    expect(start).toBeGreaterThan(-1)
    const end = CODE.indexOf('$fn$;', start)
    const body = CODE.slice(start, end)
    expect(body).not.toMatch(/\bdelete\s+from\b/i)
    expect(body).not.toMatch(/\bupdate\s+public\./i)
    expect(body).not.toMatch(/\btruncate\b/i)
  })

  it('التقرير يستبعد الصفوف المصحَّحة يدوياً', () => {
    const start = CODE.indexOf('create or replace function app.map_orphan_report')
    const body = CODE.slice(start, CODE.indexOf('$fn$;', start))
    expect(body).toContain("name_source is distinct from 'manual'")
    // مرّتان: للشوارع والأزقة
    expect(body.match(/name_source is distinct from 'manual'/g)).toHaveLength(2)
  })

  it('التقرير لا يمسّ الصفوف بلا معرّف OSM', () => {
    const start = CODE.indexOf('create or replace function app.map_orphan_report')
    const body = CODE.slice(start, CODE.indexOf('$fn$;', start))
    expect(body).toContain('osm_way_id is not null')
  })
})

describe('⑤ الحذف محكوم بخمسة شروط', () => {
  it('يتحقق أن الدفعة لهذا الزون ويرفض غيرها', () => {
    expect(CODE).toContain('MAP_PURGE_BATCH_INVALID')
    expect(CODE).toMatch(/b\.id = p_batch and b\.zone_id = p_zone/)
  })

  it('يستعمل وقت الدفعة حاجزاً — لا يحذف ما أُنشئ بعدها', () => {
    expect(CODE).toMatch(/created_at <= v_created/g)
    // ثلاث كتل حذف: زيارات + شوارع + أزقة
    expect(CODE.match(/created_at <= v_created/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('لا يحذف الصفوف اليدوية ولا المصحَّحة', () => {
    expect(CODE).toContain("name_source is distinct from 'manual'")
    expect(CODE).toContain('osm_way_id is not null')
  })

  it('لا يُقرّر بالكود — يقول صراحةً إن الكود ترقيم محلي', () => {
    expect(MIG).toContain('الكود ترقيم محلي يتغيّر')
    // الحذف كله بمعرّف OSM
    expect(CODE).not.toMatch(/delete from public\.map_streets[\s\S]{0,400}code = /)
  })

  it('يحذف الزيارات المعلّقة قبل الصفوف (لا FK على place_id)', () => {
    const visitsAt = CODE.indexOf('delete from public.map_visits v')
    const streetsAt = CODE.indexOf('delete from public.map_streets s')
    expect(visitsAt).toBeGreaterThan(-1)
    expect(streetsAt).toBeGreaterThan(visitsAt)
  })

  it('يُبلّغ عن المحميّ بدل إخفائه', () => {
    expect(CODE).toContain('kept_protected')
  })
})

describe('⑤ الحرّاس والصلاحيات', () => {
  it('التقرير يتطلب قراءة، والحذف يتطلب تحريراً', () => {
    expect(CODE).toMatch(/map_require_reader\(\)[\s\S]{0,200}map_orphan_report/)
    expect(CODE).toMatch(/map_require_editor\(\)[\s\S]{0,200}map_orphan_purge/)
  })

  it('anon ممنوع من الدالتين في المخططين', () => {
    const revokes = CODE.match(/revoke all on function [a-z]+\.[a-z_]+\([^)]*\) from public, anon/g)
    expect(revokes?.length).toBe(4)
  })

  it('كلتاهما security definer — الحذف لا يعتمد على RLS الصفوف', () => {
    expect(CODE.match(/security definer/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

describe('⑤ الـSDK', () => {
  it('يستدعي الـRPC العامة بالاسم الصحيح', () => {
    expect(SDK).toContain("supabase.rpc('map_orphan_report'")
    expect(SDK).toContain("supabase.rpc('map_orphan_purge'")
  })

  it('يمرّر `p_batch` — لا معرّفاً عشوائياً', () => {
    expect(SDK).toMatch(/p_batch:\s*batchId/)
    expect(SDK).toContain('batchId: string')
  })

  it('يُصفّي روابط الطرق كما يفعل sendBatch', () => {
    expect(SDK).toMatch(/orphanReport[\s\S]{0,300}excludeFromImport/)
    expect(SDK).toMatch(/orphanPurge[\s\S]{0,300}excludeFromImport/)
  })

  it('النوع يوثّق `kept_protected` وسببه', () => {
    expect(SDK).toContain('kept_protected')
    expect(SDK).toMatch(/name_source = 'manual'/)
  })
})

describe('⑤ لا حذف صامت في الهجرة', () => {
  it('الهجرة نفسها لا تحذف بيانات — الحذف داخل الدالة فقط', () => {
    // لا `delete from public.` في مستوى الهجرة (خارج جسم الدوال)
    const outsideFunctions = CODE.replace(
      /create or replace function[\s\S]*?(?=\n(?:create|comment|revoke|grant|notify|$))/g,
      '',
    )
    expect(outsideFunctions).not.toMatch(/delete\s+from\s+public\./i)
  })

  it('توثّق التراجع صراحةً', () => {
    expect(MIG).toContain('التراجع')
    expect(MIG).toContain('drop function app.map_orphan_purge')
  })
})

/**
 * عقد الجولة ② — تنظيم التنقّل: وحدة الخريطة كأب واحد · إعادة تسمية «مواقع الحاويات».
 *
 * ## المشكلة الأولى (التجميع)
 * سبعة مدخلات كانت **مسطّحة** في شريط غرفة العمليات بمستوى واحد:
 *
 *     محرّر الخريطة · جدول الأزقة · زيارات الأزقة · تغطية الأزقة
 *     زيارات الآليات · الأزقة المزارة (المعتمد) · استيراد الخريطة
 *
 * فتُقرأ كأنها سبع وحدات مستقلة، لا وحدة واحدة بسبع صفحات. وهي الوحيدة في
 * البوابة بلا أب — كل وحدة أخرى (المستخدمون، قاعدة البيانات، المخزن…) لها Hub
 * وأبناؤها يظهرون تحته.
 *
 * ## المشكلة الثانية (التسمية)
 * وحدة الحاويات كانت باسمين مختلفين في بوابتين:
 *     غرفة العمليات  «GBS الحاويات»
 *     مسؤول القسم    «حاويات GBS»
 * أي أن المستخدم نفسه يرى اسمين لوحدة واحدة. المطلوب: **«مواقع الحاويات»**.
 *
 * ## قاعدة التحقق
 * لا يكتفي الاختبار بوجود `children`، بل يفرض:
 *   · الأب نفسه يبقى قابلاً للنقر (صفحة المحرّر لا تختفي بعد التجميع)
 *   · الترتيب المنطقي والأخير = الاستيراد
 *   · لا تكرار مسار داخل المجموعة
 *   · كل مفتاح مترجم وغير فارغ وغير مكرّر ضد بقية الوحدة
 *   · الاسم الجديد موحّد في البوابتين **وفي صفحتيهما** (لا تضارب شريط/عنوان)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PORTAL_UNITS, type SidebarUnit } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')
const config = read('src/config/portals.config.ts')
const arSidebar = JSON.parse(read('src/i18n/ar/sidebar.json')) as { nav: Record<string, string> }

const MAP_PARENT = '/ops-room/map-planning'
const units = PORTAL_UNITS[PORTALS.OPS_ROOM] as readonly SidebarUnit[]
const findUnit = (path: string): SidebarUnit | undefined => units.find((u) => u.path === path)

describe('② — وحدة الخريطة أبٌ واحد لا سبعة أسطر مسطّحة', () => {
  it('لا يظهر أي مسار map-planning مسطّحاً في الجذر', () => {
    const flatMap = units.filter((u) => u.path.startsWith(MAP_PARENT))
    expect(flatMap.map((u) => u.path)).toEqual([MAP_PARENT])
  })

  it('الأب موجود وله exact:true حتى لا يلتقط أبناءه', () => {
    const parent = findUnit(MAP_PARENT)
    expect(parent, 'وحدة محرّر الخريطة مفقودة').toBeTruthy()
    expect(parent?.exact).toBe(true)
  })

  it('له children — الصفحات الستّ التابعة', () => {
    const parent = findUnit(MAP_PARENT)
    const children = parent?.children ?? []
    expect(children.length).toBe(6)
    for (const p of [
      `${MAP_PARENT}/table`,
      `${MAP_PARENT}/visits`,
      `${MAP_PARENT}/coverage`,
      `${MAP_PARENT}/vehicle-visits`,
      `${MAP_PARENT}/grouped-report`,
      `${MAP_PARENT}/import`,
    ]) {
      expect(children.map((c) => c.path), `مفقود من المجموعة: ${p}`).toContain(p)
    }
  })

  it('⛔ الأب ليس ابناً لنفسه — كسر كتالوج الصلاحيات', () => {
    /*
     * جُرِّب «الأب ابنٌ لنفسه» لضمان بقاء مدخل المحرّر بعد الطيّ، وسقط:
     * `unitKeyFromPath` يشتقّ المفتاح من المسار، فالابن بنفس مسار الأب
     * يُنتج `ops-room.map-planning` مرتين ⇒ PERMISSION_CATALOG بلا مفاتيح
     * فريدة ⇒ `my_permissions` ومزامنة الصلاحيات تُكسَر.
     *
     * تغطية صفحة المحرّر تأتي من الأب نفسه: النقر عليه يفتح `/ops-room/map-planning`.
     */
    const parent = findUnit(MAP_PARENT)
    const selfChild = (parent?.children ?? []).find((c) => c.path === MAP_PARENT)
    expect(selfChild, 'الأب مكرَّر كابن لنفسه — يُنتج مفتاح صلاحية مكرّراً').toBeUndefined()
  })

  it('مسارات المجموعة كلها مفاتيح صلاحيات فريدة', () => {
    const paths = [MAP_PARENT, ...((findUnit(MAP_PARENT)?.children ?? []) as readonly SidebarUnit[]).map((c) => c.path)]
    const keys = paths.map((p) => p.replace(/^\/+/, '').split('/').join('.'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('لا تكرار مسار داخل المجموعة', () => {
    const paths = ((findUnit(MAP_PARENT)?.children ?? []) as readonly SidebarUnit[]).map((c) => c.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('الاستيراد آخر خطوة — وبعد جدول الأزقة', () => {
    const paths = ((findUnit(MAP_PARENT)?.children ?? []) as readonly SidebarUnit[]).map((c) => c.path)
    expect(paths.at(-1)).toBe(`${MAP_PARENT}/import`)
    expect(paths.indexOf(`${MAP_PARENT}/import`)).toBeGreaterThan(paths.indexOf(`${MAP_PARENT}/table`))
  })
})

describe('② — مفاتيح الترجمة للمجموعة', () => {
  it('كل ابن له مفتاح موجود في العربية', () => {
    for (const child of findUnit(MAP_PARENT)?.children ?? []) {
      const key = child.labelKey.replace(/^nav\./, '')
      expect(arSidebar.nav[key], `بلا ترجمة: ${child.labelKey}`).toBeTruthy()
      expect(arSidebar.nav[key]?.trim().length).toBeGreaterThan(0)
    }
  })

  it('الأب «محرّر الخريطة» بمفتاح واحد لا مفتاحين', () => {
    expect(findUnit(MAP_PARENT)?.labelKey).toBe('nav.map_editor')
    expect(arSidebar.nav.map_editor).toBe('محرّر الخريطة')
    // لا يبقى مفتاح يتيم من محاولة «الأب ابنٌ لنفسه»
    expect(arSidebar.nav.map_editor_page).toBeUndefined()
  })
})

describe('② — «مواقع الحاويات» موحّد في البوابتين وفي صفحتيهما', () => {
  it('المفتاحان يقولان «مواقع الحاويات» بالضبط', () => {
    expect(arSidebar.nav.ops_gbs_containers).toBe('مواقع الحاويات')
    expect(arSidebar.nav.mgr_gbs_containers).toBe('مواقع الحاويات')
  })

  it('لا يبقى الاسم القديم في أي ترجمة تنقّل', () => {
    const offenders = Object.entries(arSidebar.nav).filter(
      ([, v]) => v.includes('GBS الحاويات') || v.includes('حاويات GBS'),
    )
    expect(offenders.map(([k]) => k), `تسميات قديمة: ${offenders.map(([, v]) => v).join(' | ')}`).toEqual([])
  })

  it('عنوان صفحة غرفة العمليات «مواقع الحاويات» لا الاسم القديم', () => {
    const src = read('src/portals/ops-room/pages/Gbs/GbsContainersPage.tsx')
    expect(src).toMatch(/<ExecPageHeader\b/)
    expect(src).toContain('title="مواقع الحاويات"')
    expect(src).not.toContain('title="GBS الحاويات"')
  })

  it('عنوان صفحة مسؤول القسم «مواقع الحاويات» لا الاسم القديم', () => {
    const src = read('src/portals/manager/pages/Gbs/GbsContainersPage.tsx')
    expect(src).toContain('title="مواقع الحاويات"')
    expect(src).not.toContain('title="حاويات GBS"')
  })

  it('المدخلان ما زالا في البوابتين (إعادة تسمية لا حذف)', () => {
    const opsNav = config.slice(config.indexOf('  [PORTALS.OPS_ROOM]: ['))
    const mgrNav = config.slice(config.indexOf('  [PORTALS.MANAGER]: ['))
    expect(opsNav).toContain("path: '/ops-room/gbs-containers', labelKey: 'nav.ops_gbs_containers'")
    expect(mgrNav).toContain("path: '/manager/gbs-containers', labelKey: 'nav.mgr_gbs_containers'")
  })
})

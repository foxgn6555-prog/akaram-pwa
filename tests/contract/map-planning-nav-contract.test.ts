/**
 * عقد الجولة ⑫ — وحدة التخطيط الجغرافي ظاهرة في التنقّل.
 *
 * ## المشكلة
 *
 * ستة مسارات كانت تعمل في `routes.tsx` منذ `20261122000600`:
 *
 * ```
 * map-planning                 محرّر الخريطة
 * map-planning/table           جدول الأزقة
 * map-planning/visits          زيارات الأزقة
 * map-planning/coverage        تغطية الأزقة
 * map-planning/vehicle-visits  زيارات الآليات
 * map-planning/import          استيراد الخريطة
 * ```
 *
 * لكن `portals.config.ts` كان يُظهر **واحداً فقط** (`import`). الخمسة الأخرى
 * **لا مدخل لها** ⇒ لا يمكن الوصول إليها إلا بكتابة العنوان يدوياً.
 *
 * ## قاعدة التحقق هنا
 *
 * لا يكتفي الاختبار بوجود المدخلات، بل يفرض **تطابقاً تاماً** بين ما يعمل
 * وما يظهر — فالثغرة الأصلية كانت «يعمل لكن مخفيّ»، والاختبار الضعيف
 * (يعدّ المدخلات) كان سيمرّ عليها.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const routes = read('src/portals/ops-room/routes.tsx')
const config = read('src/config/portals.config.ts')
const arSidebar = JSON.parse(read('src/i18n/ar/sidebar.json')) as {
  nav: Record<string, string>
}

/** مسارات البوابة النسبية كما تعمل فعلاً */
function routeRelPaths(): Set<string> {
  const body = routes.slice(routes.indexOf('export const customRoutes'))
  const all = [...body.matchAll(/path: '([^']*)'/g)].map((m) => m[1] ?? '')
  const out: string[] = []
  for (const p of all) if (p.length > 0 && !p.includes(':')) out.push(p)
  return new Set(out)
}

/** ما يعرضه الشريط الجانبي لغرفة العمليات */
function navRelPaths(): Set<string> {
  const start = config.indexOf('  [PORTALS.OPS_ROOM]: [')
  const block = config.slice(start, config.indexOf('\n  ],', start))
  return new Set(
    [...block.matchAll(/path: '\/ops-room\/([^']*)'/g)].map((m) => m[1] ?? ''),
  )
}

describe('⑫ — لا مسار يعمل بلا مدخل تنقّل', () => {
  it('كل مسار في routes.tsx له مدخل في portals.config.ts', () => {
    const missing = [...routeRelPaths()].filter((p) => !navRelPaths().has(p))
    expect(missing, `مسارات مخفيّة: ${missing.join(', ')}`).toEqual([])
  })

  it('لا مدخل تنقّل بلا مسار (نقرة ⇒ 404)', () => {
    /*
     * `approvals` مستثنى **بقاعدة موثّقة** لا بتجاهل: `buildPortalRoutes`
     * في src/router/unit-routes.tsx:43-45 يحقن مسار الموافقات لكل بوابة
     * غير عامة تلقائياً (يحتاجه أي حساب داخل سلسلة موافقات). فهو يعمل
     * فعلاً رغم غيابه عن routes.tsx.
     */
    const INJECTED = new Set(['approvals'])
    const extra = [...navRelPaths()].filter((p) => !routeRelPaths().has(p) && !INJECTED.has(p))
    expect(extra, `مدخلات ميّتة: ${extra.join(', ')}`).toEqual([])
  })

  it('الحقن التلقائي لـ approvals ما زال قائماً (لو أُزيل، صار المدخل ميتاً)', () => {
    const unitRoutes = read('src/router/unit-routes.tsx')
    expect(unitRoutes).toMatch(/byRel\.set\('approvals'/)
    expect(unitRoutes).toMatch(/portal !== 'public'/)
  })

  it('المسارات السبعة كلها ظاهرة', () => {
    const nav = navRelPaths()
    for (const p of [
      'map-planning',
      'map-planning/table',
      'map-planning/visits',
      'map-planning/coverage',
      'map-planning/vehicle-visits',
      'map-planning/import',
      'map-planning/grouped-report',   // 20261127000200: التقرير المعتمد
    ]) {
      expect(nav.has(p), `مفقود: ${p}`).toBe(true)
    }
  })
})

describe('⑫ — المفاتيح موجودة ومترجمة', () => {
  it('كل labelKey في التنقّل له ترجمة عربية', () => {
    const start = config.indexOf('  [PORTALS.OPS_ROOM]: [')
    const block = config.slice(start, config.indexOf('\n  ],', start))
    const keys = [...block.matchAll(/labelKey: 'nav\.([^']+)'/g)].map((m) => m[1] ?? '')
    const missing = keys.filter((k) => !(k in arSidebar.nav))
    expect(missing, `بلا ترجمة: ${missing.join(', ')}`).toEqual([])
  })

  it('المفاتيح الخمسة الجديدة لها نصوص عربية غير فارغة', () => {
    for (const k of [
      'map_editor',
      'map_table',
      'map_visits',
      'map_coverage',
      'map_vehicle_visits',
      'map_grouped_report',   // 20261127000200: التقرير المعتمد
    ]) {
      const text = arSidebar.nav[k] ?? ''
      expect(text, `ناقص: ${k}`).toBeTruthy()
      expect(text.trim().length).toBeGreaterThan(0)
      // ليس مفتاحاً نسخة من آخر
      expect(text).not.toMatch(/^nav\./)
    }
  })

  it('⛔ لا تكرار نصوص (شكوى المستخدم «تكرر نفس النص»)', () => {
    const six = [
      'map_editor',
      'map_table',
      'map_visits',
      'map_coverage',
      'map_vehicle_visits',
      'map_import',
    ].map((k) => arSidebar.nav[k] ?? '')
    expect(new Set(six).size, `نصوص مكرّرة: ${six.join(' | ')}`).toBe(six.length)
  })
})

describe('⑫ — ترتيب منطقي وعدم تعارض البادئات', () => {
  it('محرّر الخريطة له exact:true (وإلا التقط كل ما تحته)', () => {
    const start = config.indexOf("path: '/ops-room/map-planning'")
    const line = config.slice(start, config.indexOf('\n', start))
    expect(line).toContain('exact: true')
  })

  it('الاستيراد يبقى بعد بقية مسارات التخطيط (آخر خطوة عملياً)', () => {
    const body = config.slice(config.indexOf('  [PORTALS.OPS_ROOM]: ['))
    const importIdx = body.indexOf('/ops-room/map-planning/import')
    const tableIdx = body.indexOf('/ops-room/map-planning/table')
    expect(importIdx).toBeGreaterThan(tableIdx)
  })

  it('المجموعة المكانية متجاورة — waste-map ثم map-planning', () => {
    const body = config.slice(config.indexOf('  [PORTALS.OPS_ROOM]: ['))
    const waste = body.indexOf('/ops-room/waste-map')
    const mapFirst = body.indexOf('/ops-room/map-planning')
    expect(waste).toBeGreaterThan(-1)
    expect(mapFirst).toBeGreaterThan(waste)
  })
})

describe('⑫ — الفحص الشامل: لا بوابة فيها مسار مخفيّ', () => {
  /*
   * الفجوة الأصلية لم تكن خاصة بغرفة العمليات. فحصٌ شامل وجد حالتين
   * أخريين بنفس النمط:
   *
   *   /complaints/guidance  دليل موظف الشكاوى  (دليل تشغيلي كامل)
   *   /media/designs        وحدة التصاميم       (وحدة كاملة بقاعدة بيانات)
   *
   * كلتاهما كانت تعمل بلا أي مدخل — تُفتح بكتابة العنوان فقط.
   * هذا الاختبار يمنع تكرار النمط في أي بوابة مستقبلاً.
   */
  const PORTALS: Array<{ portal: string; dir: string; base: string }> = [
    { portal: 'OPS_ROOM', dir: 'ops-room', base: '/ops-room' },
    { portal: 'DEPUTY', dir: 'deputy', base: '/deputy' },
    { portal: 'EXECUTIVE', dir: 'executive', base: '/executive' },
    { portal: 'HR', dir: 'hr', base: '/hr' },
    { portal: 'FINANCE', dir: 'finance', base: '/finance' },
    { portal: 'IT', dir: 'it', base: '/it' },
    { portal: 'MANAGER', dir: 'manager', base: '/manager' },
    { portal: 'COMPLAINTS', dir: 'complaints', base: '/complaints' },
    { portal: 'MEDIA', dir: 'media', base: '/media' },
    { portal: 'CENTRAL_GARAGE', dir: 'central-garage', base: '/central-garage' },
  ]

  /** الحقن التلقائي في src/router/unit-routes.tsx — يعمل بلا مدخل صريح */
  const AUTO_INJECTED = new Set(['approvals', 'manual-attendance'])

  /*
   * كل بوابة: تُفحص مساراتها الثلاثة أنواع:
   *
   *  1. مدخل تنقّل صريح            ⇒ مقبول
   *  2. حقن تلقائي (unit-routes)   ⇒ مقبول
   *  3. **رابط عميق أو تحويل**     ⇒ مقبول **إن أُثبت سببه**:
   *       - تحويل: عنصرُه <Navigate …> (مسار قديم يُبقى للتوافق)
   *       - رابط عميق: يُشار إليه فعلاً من صفحة أخرى في src/
   *
   *  والنوع الثالث لا يُستثنى بالاسم بل يُتحقَّق من دليله — فلو حُذف
   *  الرابط من الصفحة صار المسار ميتاً وسقط الاختبار.
   */
  for (const { portal, dir, base } of PORTALS) {
    it(`${portal}: كل مسار له مدخل أو سبب موثَّق`, () => {
      const routeFile = `src/portals/${dir}/routes.tsx`
      let routeSrc = ''
      try {
        routeSrc = read(routeFile)
      } catch {
        return // بوابة بلا ملف مسارات مخصص
      }
      const body = routeSrc.slice(routeSrc.indexOf('customRoutes'))

      // خريطة مسار ⇒ هل هو تحويل؟
      const isRedirect = new Map<string, boolean>()
      for (const m of body.matchAll(/\{\s*path:\s*'([^']*)'([^}]*)\}/g)) {
        const path = m[1] ?? ''
        const rest = m[2] ?? ''
        if (path && !path.includes(':') && !path.includes('*')) {
          isRedirect.set(path, rest.includes('<Navigate'))
        }
      }

      const start = config.indexOf(`  [PORTALS.${portal}]: [`)
      if (start === -1) return
      const block = config.slice(start, config.indexOf('\n  ],', start))
      const navPaths = new Set(
        [...block.matchAll(/path: '([^']*)'/g)]
          .map((m) => m[1] ?? '')
          .filter((p) => p.startsWith(base + '/'))
          .map((p) => p.slice(base.length + 1)),
      )

      const unexplained: string[] = []
      for (const path of isRedirect.keys()) {
        if (navPaths.has(path) || AUTO_INJECTED.has(path)) continue
        // تحويل قديم ⇒ مقبول
        if (isRedirect.get(path) === true) continue
        // رابط عميق ⇒ يجب أن يُشار إليه من صفحة فعلية
        const linkedFrom = grepLink(`/${dir}/${path}`)
        if (linkedFrom.length === 0) unexplained.push(path)
      }

      expect(
        unexplained,
        `${portal} — مسارات بلا مدخل ولا رابط: ${unexplained.join(', ')}`,
      ).toEqual([])
    })
  }
})

/** هل يُشار إلى هذا العنوان من أي صفحة/مكوّن خارج ملف المسارات؟ */
function grepLink(absPath: string): string[] {
  const hits: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(tsx|ts)$/.test(entry.name) && !full.endsWith('routes.tsx')) {
        if (readFileSync(full, 'utf8').includes(absPath)) hits.push(full)
      }
    }
  }
  walk(join(ROOT, 'src'))
  return hits
}

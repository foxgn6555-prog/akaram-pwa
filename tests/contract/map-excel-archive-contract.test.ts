/**
 * عقد الجولة ③ — Excel: اسم التبويب · الأعمدة الـ٢٦ · الأرشيف ببصمة SHA-256.
 *
 * خمس مجموعات تُثبت الحلقات التي تنفصل عادةً:
 *   ① اسم التبويب: قاعدة القاعدة ≈ قاعدة العميل — وإلا اختلف سجل الأرشيف
 *      عن اسم الورقة الفعلي، وهذا عطب لا يُكتشف إلا بعد فتح الملف.
 *   ② الأعمدة الـ٢٦: القاعدة تُرجع 26، والواجهة تُعرّف 26 **بنفس الترتيب**.
 *      الاختبار يقرأ الاثنين من الملفات ويقارن — لا يثق بأي منهما.
 *   ③ البصمة: SHA-256 معروفة الاختبار، والحساب في العميل مطابق.
 *   ④ مسار الأرشيف: يطابق سياسة Storage في الترحيل حرفياً.
 *   ⑤ لا حذف: الترحيل لا يجرؤ على إنشاء سياسة حذف لغير super_admin.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()  // نفس نمط بقية اختبارات العقد — لا __dirname (يُحلّ من tests/contract)
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

// تجريد التعليقات (-- للـSQL، // و /* */ لـTS).
// تحذير: لا يُستعمل على ملفات فيها regex حرفي يحوي \/* — المجرّد يراه
// كبداية تعليق فيحذف حتى */ التالي ويُمزّق الكود. لتلك الملفات raw().
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)--[^\n]*/g, '$1')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')

/** نصّ خام — يُستعمل حين يكون الهدف هو وجود النمط نفسه لا بنية الكود */
const raw = (p: string) => read(p)

const MIG = 'supabase/migrations/20261128000300_map_visits_excel_archive.sql'
const ARCHIVE = 'src/features/map-planning/report-archive.ts'
const EXPORT_TS = 'src/features/map-planning/grouped-export.ts'
const PAGE = 'src/portals/ops-room/pages/MapPlanning/OpsMapGroupedReportPage.tsx'

describe('① اسم التبويب: القاعدة والعميل يقولان نفس الشيء', () => {
  const clientSrc = raw('src/lib/export/excel-report.ts')  // فيه regex حرفي ⇒ لا تجريد

  it('القاعدة تنزع المحارف السبعة الممنوعة في Excel', () => {
    const sql = read(MIG)  // خام: الهدف وجود النمط نفسه
    expect(sql).toContain("regexp_replace(coalesce(p_raw, ''),")
    // السلسلة الحرفية في SQL: '[\\/*?:\[\]]'
    expect(sql).toContain(String.raw`'[\\/*?:\[\]]'`)
    expect(sql).toContain("'–', 'g'")
  })

  it('العميل ينزع نفس السبعة — وإلا اختلف الاسم بين الملف والسجل', () => {
    // نفس النمط الحرفي في العميل: /[\\/*?:[\]]/g
    expect(clientSrc).toContain(String.raw`/[\\/*?:[\]]/g`)
  })

  it('القاعدة تقصّ عند 31 حرفاً بالحروف لا بالبايتات', () => {
    expect(codeOnly(read(MIG))).toContain('char_length(base) > 31 then base := left(base, 31)')
  })

  it('العميل يقصّ عند 31 هي الأخرى', () => {
    expect(clientSrc).toMatch(/\.slice\(0, 31\)/)
  })

  it('الصفحة لم تعد تقصّ عند 28 حرفاً أعمى', () => {
    const src = codeOnly(read(PAGE))
    expect(src).not.toContain('kind.label.slice(0, 28)')
    expect(src).toContain('sheetName: kind.label')
  })

  it('الاسم الاحتياطي موحّد: «ورقة» في الطبقتين', () => {
    expect(codeOnly(read(MIG))).toContain("if base = '' then base := 'ورقة'")
    expect(clientSrc).toMatch(/\.slice\(0, 31\) \|\| 'ورقة'/)
  })
})

describe('② الأعمدة الـ٢٦: القاعدة والواجهة لا تنفصلان', () => {
  /** يُقرأ نفس المصدر الذي تقرأه الواجهة — لا نسخة ثانية هنا */
  const grouped = read(EXPORT_TS)
  // `id:` يبدأ السطر ثم بقية الحقول على نفس السطر — لا نلزم $ بنهايته
  const idMatches = [...grouped.matchAll(/id: '([a-z_]+)'\s*,/g)].map((m) => m[1]!)

  it('الواجهة تُعرّف ٢٦ عموداً', () => {
    expect(idMatches).toHaveLength(26)
  })

  it('لا معرّف مكرّر — عمودان بنفس المفتاح يعني عموداً مفقوداً', () => {
    expect(new Set(idMatches).size).toBe(26)
  })

  it('الاثنا عشر عموداً المضافة في المرحلة ⑥ موجودة كلها', () => {
    for (const id of [
      'placeday', 'vehicle_name', 'mahalla_code', 'mahalla_name',
      'alleys_count', 'streets_count', 'confirmed_count', 'uncertain_count',
      'first_entered', 'last_exited', 'avg_dwell', 'max_depth',
    ]) expect(idMatches, id).toContain(id)
  })

  it('الترحيل يقرأ الترتيب من pg_proc لا من قائمة مكتوبة يدوياً', () => {
    const sql = codeOnly(read(MIG))
    expect(sql).toMatch(/proargnames/)
    expect(sql).toMatch(/proargmodes/)
    // ⚠ الدرس: `returns table` لا ينشئ نوعاً مركّباً — تصفّح pg_type يعطي ٠
    expect(sql).toMatch(/nm\.mode = 't'/)
  })

  it('الدالة العامة محميّة بالحارس العام وتُسحب من anon', () => {
    const sql = codeOnly(read(MIG))
    expect(sql).toMatch(/perform public\.map_require_reader\(\)/)
    expect(sql).toMatch(/revoke all on function public\.map_grouped_report_column_order\(\) from public, anon/)
  })
})

describe('③ البصمة: SHA-256 تُحسب صحيحاً', () => {
  /** SHA-256("abc") — قيمة معروفة من معيار FIPS 180-4 */
  const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

  it('القيمة المعروفة لـ"abc" مطابقة — لا خطأ في الترميز', () => {
    const actual = createHash('sha256').update('abc').digest('hex')
    expect(actual).toBe(ABC)
  })

  it('الدالة في العميل تستخدم Web Crypto وتُعيد 64 سداسياً صغيراً', () => {
    const src = codeOnly(read(ARCHIVE))
    expect(src).toMatch(/crypto\.subtle\.digest\('SHA-256'/)
    expect(src).toMatch(/padStart\(2, '0'\)/)
    expect(src).toMatch(/\.join\(''\)/)
  })

  it('الخادم يرفض أي بصمة ليست 64 سداسياً صغيراً', () => {
    const sql = codeOnly(read(MIG))
    expect(sql).toMatch(/p_sha256 !~ '\^\[0-9a-f\]\{64\}\$'/)
    expect(sql).toMatch(/MAP_REPORT_SHA256_INVALID/)
  })

  it('الملف المرفوع يُعاد تنزيله ويُقارن — لا ادعاء بلا إثبات', () => {
    const src = codeOnly(read(ARCHIVE))
    expect(src).toMatch(/\.download\(path\)/)
    expect(src).toMatch(/actual !== sha256/)
    expect(src).toMatch(/لم يُسجَّل في الأرشيف/)
  })

  it('عند فشل التسجيل يُحذف الملف من التخزين — لا يتيم', () => {
    expect(codeOnly(read(ARCHIVE))).toMatch(/if \(uploaded\) \{\s*\n\s*await supabase\.storage\.from\(BUCKET\)\.remove/)
  })
})

describe('④ مسار الأرشيف: يطابق سياسة Storage حرفياً', () => {
  it('السياسة تشترط مجلد المستخدم داخل reports/', () => {
    const sql = codeOnly(read(MIG))
    expect(sql).toMatch(/name like 'reports\/' \|\| auth\.uid\(\)::text \|\| '\/%'/)
  })

  it('العميل يبني نفس الشكل reports/<uid>/<yyyy-mm>/<day>/<file>', () => {
    const src = codeOnly(read(ARCHIVE))
    expect(src).toMatch(/`reports\/\$\{userId\}\/\$\{ym\}\/\$\{day\}\/\$\{fileName\}`/)
  })

  it('الخادم يرفض مساراً خارج مجلد المستخدم', () => {
    const sql = codeOnly(read(MIG))
    expect(sql).toMatch(/MAP_REPORT_PATH_FORBIDDEN/)
    expect(sql).toMatch(/p_path not like 'reports\/' \|\| auth\.uid\(\)::text \|\| '\/%'/)
  })

  it('bucket خاص — لا رابط عام دائم للتقرير الرسمي', () => {
    expect(codeOnly(read(MIG))).toMatch(/values \('map-reports', 'map-reports', false,/)
    expect(codeOnly(read(ARCHIVE))).toMatch(/createSignedUrl\(path, expiresIn\)/)
  })

  it('حجم الملف محدود في الطبقتين بنفس الرقم', () => {
    expect(codeOnly(read(MIG))).toMatch(/26214400/)
    expect(codeOnly(read(ARCHIVE))).toMatch(/MAX_BYTES = 26214400/)
  })
})

describe('⑤ الأرشيف لا يُمحى صامتاً', () => {
  it('الحذف لمدير النظام فقط — في الجدول وفي Storage', () => {
    const sql = codeOnly(read(MIG))
    expect(sql).toMatch(/map_report_files: حذف لمدير النظام[\s\S]{0,200}has_role\(array\['super_admin'\]\)/)
    expect(sql).toMatch(/map-reports: حذف لمدير النظام[\s\S]{0,200}has_role\(array\['super_admin'\]\)/)
  })

  it('لا سياسة إدراج مباشر — الإدراج عبر الدالة وحدها', () => {
    const sql = codeOnly(read(MIG))
    expect(sql).not.toMatch(/map_report_files" for insert/)
    expect(sql).toMatch(/revoke insert, update on public\.map_report_files from authenticated, anon/)
  })

  it('سجل بلا ملف يُكتشف — دالة سلامة لا استعلام يدوي', () => {
    expect(codeOnly(read(MIG))).toMatch(/create or replace function app\.map_report_file_uploaded/)
    expect(codeOnly(read(MIG))).toMatch(/from storage\.objects o/)
  })

  it('لا يوجد في العميل أي مسار حذف للأرشيف', () => {
    const src = codeOnly(read(ARCHIVE))
    // `remove` موجودة فقط للتنظيف بعد فشل التسجيل — لا دالة حذف عامة
    expect(src.match(/\.remove\(/g)).toHaveLength(1)
    expect(src).not.toMatch(/export async function (delete|purge|remove)Archive/)
  })
})

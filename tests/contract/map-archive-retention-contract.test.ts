/**
 * عقد الجولة ④ — الأرشيف والاحتفاظ.
 *
 * أهم ما يُثبته هذا الملف هو **عطب حقيقي** اكتُشف بعد إيداع الجولة ③:
 * الترحيل ① وضع حاجزاً يرفض أي جدول في `public` بلا تعريف في كتالوج
 * الاحتفاظ. الجولة ③ أضافت `map_report_files` ولم تُعرّفه، فكان الحاجز
 * سيُفشل الترحيل ③ على الإنتاج (حيث ① مطبَّق بالفعل) رغم أنه مرّ في
 * الاختبار على قاعدة فارغة. الجولة ④ تُغلق هذا الثغرة.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

const MIG4 = 'supabase/migrations/20261128000400_map_visits_archive_retention.sql'
const MIG3 = 'supabase/migrations/20261128000300_map_visits_excel_archive.sql'
const SDK = 'src/services/map-planning.sdk.ts'
const HOOKS = 'src/features/map-planning/hooks/useMapPlanning.ts'
const PANEL = 'src/portals/ops-room/pages/MapPlanning/PurgeGuardPanel.tsx'

const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)--[^\n]*/g, '$1')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')

describe('① عطب الحاجز: كل جدول جديد يجب أن يدخل الكتالوج', () => {
  it('الترحيل ④ يُعرّف map_report_files الذي أضافته الجولة ③', () => {
    const sql = read(MIG4)
    expect(sql).toContain("('map_report_files', 'ops', 'ملفات تقارير الخريطة',")
  })

  it('⚠ إثبات العطب: الجولة ③ أنشأت الجدول ولم تُعرّفه في الكتالوج', () => {
    // هذا هو الدليل على أن العطب كان حقيقياً لا متخيَّلاً
    expect(read(MIG3)).toContain('create table if not exists public.map_report_files')
    expect(read(MIG3)).not.toContain("'map_report_files', 'ops'")
    // والإصلاح في ④ يعتمد على إعادة التسمية، فلو لم يكن للكتالوج نسخة سابقة لانكسر
    expect(read(MIG4)).toContain('data_retention_catalog_pre_archive')
  })

  it('الحاجز نفسه صار دالة — لا كتلة do مكرّرة في كل ترحيل', () => {
    const sql = codeOnly(read(MIG4))
    expect(sql).toMatch(/create or replace function app\.require_retention_catalog_complete\(\)/)
    expect(sql).toMatch(/perform app\.require_retention_catalog_complete\(\)/)
  })

  it('الحاجز يقرأ كل جداول public لا قائمة مكتوبة', () => {
    const sql = codeOnly(read(MIG4))
    expect(sql).toMatch(/from information_schema\.tables t/)
    expect(sql).toMatch(/t\.table_schema = 'public'/)
    expect(sql).toMatch(/RETENTION_CATALOG_INCOMPLETE/)
  })

  it('سجل الإثبات لا يُحذف زمنياً — deletable=false', () => {
    const sql = read(MIG4)
    const row = sql.slice(sql.indexOf("('map_report_files'"))
    const line = row.slice(0, row.indexOf(')'))
    expect(line).toContain('false')
    expect(row.slice(0, 400)).toContain('لا حذف زمني')
  })

  it('الكتالوج السابق يُعاد تسميته لا يُحذف — لا فقدان تعريفات', () => {
    const sql = codeOnly(read(MIG4))
    expect(sql).toMatch(/alter function app\.data_retention_catalog\(\) rename to data_retention_catalog_pre_archive/)
    expect(sql).toMatch(/select \* from app\.data_retention_catalog_pre_archive\(\)/)
  })
})

describe('② مصدر أرشيف الزيارات: يقرأ map_visits لا نقاط GPS', () => {
  const sql = codeOnly(read(MIG4))

  it('يقرأ من map_visits حصراً', () => {
    expect(sql).toMatch(/from public\.map_visits v/)
    expect(sql).not.toMatch(/from public\.gps_device_position_history/)
  })

  it('السائق من employees أولاً ثم النص القديم — نفس عقد التقرير المجمّع', () => {
    expect(sql).toMatch(/coalesce\(emp\.full_name, gv\.driver_name\)/)
    expect(sql).toMatch(/left join public\.employees emp on emp\.id = gv\.driver_employee_id/)
  })

  it('يُرجع عدد الزيارات في كل صفّ — لا rows.length بعد الفلترة', () => {
    expect(sql).toMatch(/count\(\*\) over \(\) as visits_count/)
  })

  it('مدى أقصى ٣٦٦ يوماً — طلب واحد لا يسحب خمس سنوات', () => {
    expect(sql).toMatch(/v_to - p_from > 366/)
  })

  it('مدى معكوس يُرفض صراحةً', () => {
    expect(sql).toMatch(/if v_to < p_from then/)
    expect(sql).toMatch(/GPS_VISIT_REPORTS_RANGE/)
  })

  it('محمي بحارس الدور ويُسحب من anon', () => {
    expect(sql).toMatch(/app\.has_role\(array\['ops_room','it_admin','super_admin'\]\)/)
    expect(sql).toMatch(/revoke all on function public\.gps_visit_reports\(date,date,uuid\) from public, anon/)
  })
})

describe('③ حارس «تصدير قبل حذف»: الشرط الحرج', () => {
  const sql = codeOnly(read(MIG4))

  it('⚠ الشرط cutoff > placeday لا >= — المحرك يحذف < cutoff', () => {
    // لو استُخدم >=، ليومٌ يساوي القاطع يُعدّ مُصدَّراً وهو لم يُصدَّر
    expect(sql).toMatch(/e\.cutoff > d\.placeday/)
    expect(sql).not.toContain('e.cutoff >= d.placeday')
  })

  it('ثلاث حالات لا اثنتان: لا طلب · طلب بلا إثبات · جاهز', () => {
    expect(sql).toContain('لا طلب تصدير يغطي هذا اليوم — الحذف ممنوع')
    expect(sql).toContain('طلب تصدير بلا بصمة أو عدد صفوف — الإثبات ناقص')
    expect(sql).toContain('جاهز للحذف — التصدير مُثبت')
  })

  it('الإثبات = بصمة أو عدد صفوف مسجَّل — لا مجرد وجود طلب', () => {
    expect(sql).toMatch(/e\.export_sha256 is not null or e\.rows_exported > 0/)
  })

  it('لا تحذف بنفسها — لا كلمة delete في جسمها', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.map_visits_purge_guard'))
    const body = fn.slice(0, fn.indexOf('comment on function'))
    expect(body).not.toMatch(/\bdelete\s+from\b/i)
  })

  it('it_admin/super_admin فقط — لا ops_room', () => {
    expect(sql).toMatch(/app\.has_role\(array\['it_admin','super_admin'\]\)/)
    expect(sql).toMatch(/RETENTION_FORBIDDEN/)
  })

  it('تعمل على يوم بغداد لا UTC', () => {
    expect(sql).toMatch(/v\.placeday < v_cut/)
    expect(sql).toMatch(/current_date - d\.placeday/)
  })
})

describe('④ فحص التشغيل: المحرك يعمل على الزيارات فعلاً', () => {
  const sql = codeOnly(read(MIG4))

  it('الترحيل يفحص العدّ والحذف بقاطع ١٩٠٠ عند التطبيق', () => {
    expect(sql).toMatch(/data_retention_count\('map_visits', '1900-01-01'::timestamptz\)/)
    expect(sql).toMatch(/data_retention_delete_some\('map_visits', '1900-01-01'::timestamptz, 10\)/)
  })

  it('الفشل لا يُسقط الترحيل — يُنبّه صراحةً', () => {
    expect(sql).toMatch(/raise notice 'map_visits: تعذّر الفحص/)
  })
})

describe('⑤ SDK والهوكات والواجهة', () => {
  const sdk = codeOnly(read(SDK))
  const hooks = codeOnly(read(HOOKS))
  const panel = codeOnly(read(PANEL))

  it('SDK: visitReports و visitPurgeGuard', () => {
    expect(sdk).toMatch(/async visitReports\(/)
    expect(sdk).toMatch(/supabase\.rpc\('gps_visit_reports'/)
    expect(sdk).toMatch(/async visitPurgeGuard\(/)
    expect(sdk).toMatch(/supabase\.rpc\('map_visits_purge_guard'/)
  })

  it('الهوكات: مفتاحان في mapKeys + هوكان', () => {
    expect(hooks).toMatch(/visitReports: \(from: string, to: string, zoneId: string\)/)
    expect(hooks).toMatch(/purgeGuard: \(cutoff: string, keepDays: number\)/)
    expect(hooks).toMatch(/export function useVisitReports\(/)
    expect(hooks).toMatch(/export function useVisitPurgeGuard\(/)
  })

  it('⚠ حارس الحذف staleTime = 0 — لا حكم محفوظ يُجيز حذفاً', () => {
    const fn = hooks.slice(hooks.indexOf('export function useVisitPurgeGuard'))
    expect(fn.slice(0, 400)).toMatch(/staleTime: 0/)
  })

  it('اللوحة: ثلاث حالات معروضة بوسومها', () => {
    expect(panel).toMatch(/ready: 'جاهز للحذف'/)
    expect(panel).toMatch(/blocked: 'ممنوع — لا تصدير'/)
    expect(panel).toMatch(/incomplete: 'ناقص — الإثبات غير مكتمل'/)
  })

  it('اللوحة: لا زر حذف — بوابة إثبات لا منفذ تنفيذ', () => {
    expect(panel).not.toMatch(/data-testid="purge-delete"/)
    expect(panel).toContain('الحذف لا ينفَّذ من هنا')
  })

  it('اللوحة: تُظهر الزيارات المعرّضة للفقدان أولاً', () => {
    expect(panel).toMatch(/atRiskVisits/)
    expect(panel).toMatch(/زيارة معرّضة للفقدان/)
  })

  it('الصفحة تُركّب اللوحة', () => {
    expect(read('src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx'))
      .toContain('<PurgeGuardPanel keepDays={30} />')
  })
})

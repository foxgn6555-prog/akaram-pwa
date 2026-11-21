/**
 * عقد تصدير Excel (المرحلة ⑦) — معايير القبول من الخطة:
 *   «الملف يطابق الفلاتر» · «ترتيب الأعمدة يُحفظ ويُسترجع» · ترويسة وطباعة
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { columnsFor, resolveColumns, toReportColumns } from '@features/map-planning/export-columns'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = read('src/portals/ops-room/pages/MapPlanning/OpsMapPlanningTablePage.tsx')
const SQL = read('supabase/migrations/20261122001000_map_export_prefs.sql')

describe('① الملف يطابق الفلاتر', () => {
  it('صفوف التصدير مبنية من `rows` المفلترة نفسها', () => {
    // الصفوف تُشتق من `rows` (نتيجة الفلترة)، لا من streets/alleys الخام
    expect(PAGE).toMatch(/return rows\.map\(/)
  })

  it('لا تصدير من مصدر آخر يلتفّ على الفلتر', () => {
    const fn = PAGE.slice(PAGE.indexOf('const exportExcel'), PAGE.indexOf('const loading'))
    expect(fn).toMatch(/toReportRows\(exportRows/)
    expect(fn).not.toMatch(/useMapStreets|\.\.\.streets/)
  })
})

describe('② ترتيب الأعمدة يُحفظ ويُسترجع', () => {
  it('جدول تفضيلات بمفتاح (مستخدم، صنف)', () => {
    expect(SQL).toMatch(/primary key \(user_id, export_kind\)/)
  })

  it('القاعدة ترفض تفضيلاً بلا عمود مرئي', () => {
    expect(SQL).toMatch(/EXPORT_COLUMNS_EMPTY/)
  })

  it('القاعدة ترفض صنفاً غير places/visits', () => {
    expect(SQL).toMatch(/check \(export_kind in \('places','visits'\)\)/)
  })

  it('التفضيل خاص بالمستخدم (RLS بـauth.uid)', () => {
    expect(SQL).toMatch(/using \(user_id = auth\.uid\(\)\)/)
    expect(SQL).toMatch(/with check \(user_id = auth\.uid\(\)\)/)
  })

  it('الصفحة تقرأ التفضيل المحفوظ وتستعمله', () => {
    expect(PAGE).toMatch(/useExportPrefs\('places'\)/)
    expect(PAGE).toMatch(/prefs && prefs\.length > 0 \? prefs : defaultSelection\('places'\)/)
  })

  it('الحفظ عبر زر صريح لا تلقائياً مع كل نقرة', () => {
    expect(PAGE).toMatch(/ExportColumnsPanel/)
    const panel = read('src/features/map-planning/components/ExportColumnsPanel.tsx')
    expect(panel).toMatch(/save\.mutate\(\{ kind, columns: selection \}\)/)
  })
})

describe('③ Excel لا CSV — وترويسة وطباعة', () => {
  it('الصفحة تستعمل buildExcelReport', () => {
    expect(PAGE).toMatch(/buildExcelReport\(/)
  })

  it('لا يبقى مسار CSV القديم', () => {
    expect(PAGE).not.toMatch(/exportCsv/)
    expect(PAGE).not.toMatch(/text\/csv/)
  })

  it('يُمرَّر عنوان وهوية الشركة وتوجيه أفقي للطباعة', () => {
    const fn = PAGE.slice(PAGE.indexOf('buildExcelReport({'), PAGE.indexOf('await saveWorkbook'))
    expect(fn).toMatch(/title:/)
    expect(fn).toMatch(/companySub:/)
    expect(fn).toMatch(/orientation: 'landscape'/)
  })

  it('صف الإجمالي يُمرَّر للملف', () => {
    expect(PAGE).toMatch(/totalRow: totalRow\(exportRows, cols, ctx\)/)
  })
})

describe('④ أثر التصدير', () => {
  it('كل تصدير يُسجَّل في map_export_log', () => {
    expect(PAGE).toMatch(/exportLogAdd\(/)
    expect(SQL).toMatch(/create table if not exists public\.map_export_log/)
  })

  it('فشل التسجيل لا يُفشل التنزيل', () => {
    expect(PAGE).toMatch(/\.catch\(\(\) => undefined\)/)
  })

  it('عدد الصفوف السالب يُقصّ إلى صفر في القاعدة', () => {
    expect(SQL).toMatch(/greatest\(coalesce\(p_rows,0\),0\)/)
  })
})

describe('⑤ الأحد عشر عموداً', () => {
  it('التعريف يحتوي أحد عشر عموداً للأماكن', () => {
    expect(columnsFor('places')).toHaveLength(11)
  })

  it('الترويسات لا تتكرر', () => {
    const headers = toReportColumns(columnsFor('places')).map((c) => c.header)
    expect(new Set(headers).size).toBe(headers.length)
  })

  it('الاختيار المحفوظ يقلّل الأعمدة في الملف فعلاً', () => {
    const sel = [
      { id: 'place_code', visible: true, order: 0 },
      { id: 'place_name', visible: true, order: 1 },
      { id: 'length_m', visible: false, order: 2 },
    ]
    expect(toReportColumns(resolveColumns('places', sel))).toHaveLength(2)
  })
})

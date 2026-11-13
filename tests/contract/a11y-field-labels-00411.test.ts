/**
 * 00411 — الحقول بلا تسمية (26 حقلًا في 20 صفحة، الفحص العميق الجولة 38).
 * الإصلاح: إضافة `aria-label` عربي لكل حقل إدخال/اختيار كان بلا اسم وصول.
 * الاختبار يقرأ المصدر مباشرة (عقد) لأن الصفحات مبثوثة في بوابات متعددة وأدوار مختلفة.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = (path: string) => readFileSync(join(process.cwd(), 'src', path), 'utf8')

/** (الملف، معرّف الحقل، التسمية العربية) */
const FIELDS: [string, string, string][] = [
  ['portals/hr/pages/Attendance/AttendanceLog.tsx', 'att-from', 'من تاريخ'],
  ['portals/hr/pages/Attendance/AttendanceLog.tsx', 'att-to', 'إلى تاريخ'],
  ['portals/hr/pages/Attendance/AttendanceLog.tsx', 'att-branch', 'الفرع'],
  ['portals/hr/pages/Attendance/AttendanceLog.tsx', 'att-dept', 'القسم'],
  ['portals/hr/pages/Attendance/AttendanceLog.tsx', 'att-status-filter', 'حالة الحضور'],
  ['portals/hr/pages/Attendance/AttendanceLog.tsx', 'att-search', 'بحث باسم الموظف أو رقمه الوظيفي'],
  ['portals/hr/pages/Attendance/MonthlyAttendanceReportPage.tsx', 'am-month', 'الشهر'],
  ['portals/hr/pages/Attendance/MonthlyAttendanceReportPage.tsx', 'am-branch', 'الفرع'],
  ['portals/hr/pages/Attendance/MonthlyAttendanceReportPage.tsx', 'am-dept', 'القسم'],
  ['portals/hr/pages/Attendance/MonthlyAttendanceReportPage.tsx', 'am-search', 'بحث باسم الموظف أو رقمه الوظيفي'],
  ['portals/hr/pages/Attendance/MonthlyAttendanceReportPage.tsx', 'am-sort', 'ترتيب الجدول'],
  ['portals/hr/pages/Leaves/Leaves.tsx', 'lv-from', 'من تاريخ'],
  ['portals/hr/pages/Leaves/Leaves.tsx', 'lv-to', 'إلى تاريخ'],
  ['portals/hr/pages/Leaves/Leaves.tsx', 'lv-status', 'حالة الطلب'],
  ['portals/hr/pages/Leaves/Leaves.tsx', 'lv-dept', 'القسم'],
  ['portals/hr/pages/Leaves/Leaves.tsx', 'lv-search', 'بحث باسم الموظف أو رقمه الوظيفي'],
  ['portals/manager/pages/Photos/PhotosPage.tsx', 'f-photo-title', 'عنوان الصورة'],
  ['portals/manager/pages/Photos/PhotosPage.tsx', 'f-photo-notes', 'ملاحظات على الصورة'],
  ['portals/manager/pages/Photos/PhotosPage.tsx', 'mine-mode', 'نطاق العرض'],
  ['portals/admin-ops/pages/Contractors/ContractorsFollowUpPage.tsx', 'date-filter', 'تاريخ اليوم'],
  ['portals/admin-ops/pages/Contractors/ContractorsFollowUpPage.tsx', 'contractor-filter', 'المتعهد'],
  ['portals/follow-up/pages/FollowUpWorkersPage.tsx', 'date-filter', 'تاريخ اليوم'],
  ['portals/follow-up/pages/FollowUpWorkersPage.tsx', 'parent-filter', 'القاطع'],
  ['features/disclosures/components/DisclosuresUnitPage.tsx', 'dash-month', 'الشهر'],
  ['portals/transfer-station/pages/Carrier/CarrierPage.tsx', 'carrier-month', 'شهر سجلات النقل'],
  ['portals/transfer-station/pages/Saksat/SaksatPage.tsx', 'saksat-month', 'شهر سجلات السكسات'],
  ['portals/deputy/pages/Overtime/DeputyOvertimePage.tsx', 'ot-month', 'الشهر'],
  ['portals/deputy/pages/Overtime/DeputyOvertimePage.tsx', 'ot-search', 'بحث باسم الموظف أو رقمه أو قسمه'],
  ['features/attendance-edits/components/AttendanceEditShared.tsx', 'ae-f-search', 'بحث في تعديلات الحضور'],
  ['portals/ops-room/pages/ContractorHeadcounts/OpsContractorHeadcountsPage.tsx', 'month-filter', 'الشهر'],
  ['portals/ops-room/pages/ContractorHeadcounts/OpsContractorHeadcountsPage.tsx', 'parent-filter', 'القاطع'],
]

describe('00411 — تسميات الحقول العربية (aria-label)', () => {
  it.each(FIELDS)('%s ← %s له تسمية «%s»', (file, testId, label) => {
    const text = src(file)
    expect(text).toContain(`data-testid="${testId}" aria-label="${label}"`)
  })

  it('مُنتقي الشهر المشترك يسمّي حقله', () => {
    expect(src('portals/hr/components/hr-ui.tsx')).toContain('aria-label="الشهر"')
    // الحقول التي تستخدم MonthPicker ترث التسمية (cw-month · ae-month)
    for (const f of [
      'portals/finance/pages/Contractors/ContractorWagesPage.tsx',
      'portals/executive/pages/AttendanceEdits/ExecAttendanceEditsPage.tsx',
      'portals/deputy/pages/AttendanceEdits/DeputyAttendanceEditsPage.tsx',
    ]) {
      expect(src(f)).toMatch(/<MonthPicker[^>]*testId="(cw|ae)-month"/)
    }
  })

  it('شرائح الخصم الديناميكية وسائق المحطة ويوم الصيانة مسمّاة', () => {
    const auto = src('portals/it/pages/Integrations/AutoDeductionsPage.tsx')
    expect(auto).toContain('aria-label={`حد الشريحة ${i + 1} بالدقائق`}')
    expect(auto).toContain('aria-label={`نسبة الخصم للشريحة ${i + 1} بالمئة`}')
    expect(auto).toContain('aria-label="دقيقة للتجربة في المثال الحي"')
    expect(src('portals/transfer-station/components/StationExitForm.tsx')).toContain(
      'aria-label={`السائق (${DRIVER_KIND_AR[driverKind]})`}',
    )
    expect(src('portals/maintenance/pages/VehicleCases/MaintenanceCasesPage.tsx')).toContain(
      'aria-label="يوم مجلد الصيانة"',
    )
  })

  it('لم يُضَف أي تغيير سلوكي: لا ids ولا htmlFor ولا تغيير في onchange', () => {
    for (const [file] of FIELDS) {
      const text = src(file)
      expect(text).not.toMatch(/aria-label="[^"]*"\s+id=/)
    }
  })
})

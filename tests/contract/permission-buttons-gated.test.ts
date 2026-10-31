/**
 * 00350-D — عقد: كل دالة كتابة مربوطة في WRITE_BINDINGS ولها زر في الواجهة يجب أن يُعطَّل الزر عبر useCanCall('<fn>')
 * (الخادم يرفض على أي حال — هذا يضمن أن المستخدم يرى السبب قبل النقر بدل رسالة خطأ بعده).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WRITE_BINDINGS } from '@/config/permission-catalog'

const P = 'src/portals/'
/** fn ⇒ ملفات الصفحات التي تستدعيها (كل ملف يجب أن يحتوي useCanCall('<fn>')) */
export const UI_SITES: Readonly<Record<string, readonly string[]>> = {
  hr_employee_create: [P + 'hr/pages/Recruitment/Recruitment.tsx'],
  hr_employee_terminate: [P + 'hr/pages/Recruitment/Recruitment.tsx'],
  hire_request_complete: [P + 'hr/pages/Recruitment/Recruitment.tsx'],
  attendance_edit_hr_apply: [P + 'hr/pages/AttendanceEdits/AttendanceEditsPage.tsx'],   // 00397-ب
  supply_request_deliver: [P + 'ops-room/pages/Store/OpsStorePage.tsx'],
  advance_request_create: [P + 'ops-room/pages/Advances/OpsAdvancesPage.tsx'],
  ops_attendance_confirm: [P + 'ops-room/pages/Attendance/OpsAttendancePage.tsx'],
  ops_contractor_month_approve: [P + 'ops-room/pages/ContractorHeadcounts/OpsContractorHeadcountsPage.tsx'],
  advance_deliver: [P + 'finance/pages/Advances/FinanceAdvancesPage.tsx'],
  advance_settle_cash: [P + 'finance/pages/Advances/FinanceAdvancesPage.tsx'],
  finance_payroll_approve: [P + 'finance/pages/Payroll/PayrollOverview.tsx'],
  finance_payroll_adjust: [P + 'finance/pages/Payroll/PayrollOverview.tsx'],
  finance_treasury_confirm: [P + 'finance/pages/Budget/BudgetOverview.tsx'],
  cold_archive_package_create: [P + 'it/pages/ColdArchive/ColdArchivePage.tsx'],
  cold_archive_purge_request: [P + 'it/pages/ColdArchive/ColdArchivePage.tsx'],
  cold_archive_purge_approve: [P + 'it/pages/ColdArchive/ColdArchivePage.tsx'],
  cold_archive_purge_confirm: [P + 'it/pages/ColdArchive/ColdArchivePage.tsx'],
  garage_decide_tank_zero: [P + 'it/pages/CentralGarage/CentralGarageApprovalsPage.tsx'],
  complaint_approve_report: [P + 'complaints/pages/Templates/ReportEditorPage.tsx'],
  complaint_batch_create_items_from_inbox: [P + 'complaints/pages/Inbox/InboxPage.tsx'],
  complaint_start_assignment_ticket: [P + 'manager/pages/Complaints/ComplaintTicketPage.tsx'],
  complaint_complete_assignment_ticket: [P + 'manager/pages/Complaints/ComplaintTicketPage.tsx'],
  sector_confirm_vehicle_arrival: [P + 'manager/pages/VehicleTrips/VehicleTripsPage.tsx'],
  sector_confirm_vehicle_site_return: [P + 'manager/pages/VehicleTrips/VehicleTripsPage.tsx'],
  sector_submit_breakdown: [P + 'manager/pages/Breakdown/BreakdownPage.tsx'],
  sector_support_request_create: [P + 'manager/pages/Support/SupportRequestsPage.tsx'],
  garage_record_return: [P + 'central-garage/pages/DriversDispatchPage.tsx'],
  garage_record_shift_departure: [P + 'central-garage/pages/DriversDispatchPage.tsx'],
  garage_decide_maintenance_dispatch: [P + 'central-garage/pages/MaintenanceCoordinationPage.tsx'],
  station_confirm_vehicle_arrival: [P + 'transfer-station/pages/VehicleMovements/StationVehicleMovementsPage.tsx'],
  station_record_exit: [P + 'transfer-station/components/StationExitForm.tsx'],
  maintenance_complete_case: [P + 'maintenance/pages/VehicleCases/MaintenanceCasesPage.tsx'],
  maintenance_confirm_arrival: [P + 'maintenance/pages/VehicleCases/MaintenanceCasesPage.tsx'],
  maintenance_inventory_create: [P + 'maintenance/pages/Inventory/MaintenanceInventoryPage.tsx'],
  maintenance_purchase_create: [P + 'maintenance/pages/Purchases/MaintenancePurchasesPage.tsx'],
  media_template_create: [P + 'media/pages/Templates/MediaTemplatesPage.tsx'],
}
/** دوال مربوطة بلا زر مباشر في الواجهة (استعلام تلقائي أو غير مستخدمة من أي صفحة) — الخادم وحده يحكم */
export const NO_UI_BUTTON: Readonly<Record<string, string>> = {
  finance_payroll_reconcile: 'استعلام تحقق يعمل تلقائياً مع فتح كشف الرواتب — لا زر',
  complaint_create_item_from_inbox: 'لا تستدعيها أي صفحة (الواجهة تستخدم الدفعة batch)',
  garage_record_departure: 'لا تستدعيها أي صفحة (الواجهة تستخدم انطلاق الشفت)',
  maintenance_approve_readiness: 'لا تستدعيها أي صفحة حالياً',
  it_deduction_exemption_add: 'لا تستدعيها أي صفحة حالياً',
}

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')

describe('⚓ 00350-D — أزرار الكتابة المربوطة معطَّلة حسب الصلاحية', () => {
  it('كل دالة في WRITE_BINDINGS إمّا لها مواقع واجهة أو موثَّقة بلا زر — ولا تداخل', () => {
    for (const fn of Object.keys(WRITE_BINDINGS)) {
      const inUi = fn in UI_SITES, noUi = fn in NO_UI_BUTTON
      expect(inUi || noUi, `${fn}: غير مصنَّفة`).toBe(true)
      expect(inUi && noUi, `${fn}: مصنَّفة مرتين`).toBe(false)
    }
    for (const fn of [...Object.keys(UI_SITES), ...Object.keys(NO_UI_BUTTON)]) expect(WRITE_BINDINGS[fn], `${fn}: ليست في WRITE_BINDINGS`).toBeDefined()
  })

  it('كل ملف صفحة يستدعي useCanCall للدالة ويستعمل النتيجة في disabled', () => {
    for (const [fn, files] of Object.entries(UI_SITES)) {
      for (const f of files) {
        const src = read(f)
        expect(src.includes("from '@features/permissions/my-permissions'"), `${f}: بلا استيراد useCanCall`).toBe(true)
        const m = new RegExp(`(\\w+)\\s*=\\s*useCanCall\\('${fn}'\\)`).exec(src)
        expect(m, `${f}: لا يستدعي useCanCall('${fn}')`).not.toBeNull()
        let v = m![1] as string
        // يُسمح بتمرير النتيجة عبر متغير وسيط (مثل: const gate = cond ? canA : canB)
        if (!src.includes(`!${v}.allowed`)) {
          const alias = src.split('\n').filter((l) => l.includes(v) && !l.includes('useCanCall(')).map((l) => /const (\w+) = /.exec(l)?.[1]).find((n) => n && n !== v)
          if (alias) v = alias
        }
        expect(src.includes(`!${v}.allowed`), `${f}: ${v}.allowed غير مستخدم في disabled`).toBe(true)
        expect(src.includes(`${v}.title`), `${f}: ${v}.title غير مستخدم (السبب لا يظهر للمستخدم)`).toBe(true)
      }
    }
  })

  it('الدوال الموثَّقة بلا زر لا يستدعيها أي ملف في البوابات فعلاً (وإلا يجب نقلها إلى UI_SITES)', () => {
    // تحقق مباشر عبر rpc في الـ SDK فقط — إن ظهر استدعاء من hook داخل البوابات تفشل هنا
    const sdkOnly: Record<string, string> = { complaint_create_item_from_inbox: 'useCreateComplaintItemFromInbox', garage_record_departure: 'useRecordGarageDeparture', maintenance_approve_readiness: 'useMaintenanceApproveReadiness', it_deduction_exemption_add: 'useAddDeductionExemption' }
    const portalsSrc = Object.values(UI_SITES).flat().map(read).join('\n')
    for (const hook of Object.values(sdkOnly)) expect(portalsSrc.includes(hook + '('), `${hook} صار مستخدماً في صفحة — أضف بوابته إلى UI_SITES`).toBe(false)
  })
})

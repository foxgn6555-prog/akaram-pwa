/** HR: استيراد الموظفين من Excel (تحقق مسبق → تنفيذ) · الهيكل التنظيمي (إضافة/تعديل/فرعي/تعطيل) · أزرار التصدير بالفلاتر */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  importCalls: [] as Array<{ rows: unknown[]; dryRun: boolean }>,
  importResult: null as unknown,
  depts: [] as unknown[],
  saveDept: vi.fn(async () => 'd'),
  parsed: null as unknown,
  exported: [] as unknown[],
}))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'بغداد' }] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'd1', name: 'النقل', parent_id: null }] }) }))
vi.mock('@features/integrations', () => ({ useBiometricPunches: () => ({ data: [], isLoading: false }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useHrShifts: () => ({ data: [{ id: 's1', name: 'صباحي', start_time: '08:00', end_time: '16:00', grace_minutes: 15, work_days: [0, 1, 2, 3, 4], is_active: true }] }),
  useImportEmployees: () => ({ mutateAsync: async (v: { rows: unknown[]; dryRun: boolean }) => { h.importCalls.push(v); const r = h.importResult as { rows: unknown[] }; return { ...r, dry_run: v.dryRun } }, isPending: false }),
  useHrDepartments: () => ({ data: h.depts, isLoading: false }),
  useHrEmployees: () => ({ data: [{ id: 'e1', employee_number: 'E1', full_name: 'أحمد', contract_type: 'monthly', employment_status: 'active', salary_status: 'pending', department_name: 'النقل' }], isLoading: false }),
  useSaveDepartment: () => ({ mutateAsync: h.saveDept, isPending: false }),
  useHrJobTitles: () => ({ data: [], isLoading: false }),
  useAttendance: () => ({ data: [{ id: 'r1', employee_id: 'e1', employee_number: 'E1', full_name: 'أحمد', work_date: '2026-09-05', status: 'late', source: 'auto', late_minutes: 5, early_minutes: 0, worked_minutes: 400, check_in: null, check_out: null, expected_in: null, expected_out: null, is_rest_day: false }], isLoading: false }),
  useEvaluateAttendance: () => ({ mutate: vi.fn(), isPending: false }),
  useHrLeaves: () => ({ data: [], isLoading: false }),
}))
vi.mock('@features/hr/lib/hrExcel', async (orig) => {
  const actual = await orig<Record<string, unknown>>()
  return { ...actual, parseImportFile: async () => h.parsed, exportToExcel: async (spec: unknown) => { h.exported.push(spec) }, downloadWorkbook: async () => undefined }
})

import { ImportEmployeesPanel } from '@portals/hr/components/ImportEmployeesPanel'
import OrgStructure from '@portals/hr/pages/Org/OrgStructure'
import EmployeesList from '@portals/hr/pages/Employees/EmployeesList'
import AttendanceLog from '@portals/hr/pages/Attendance/AttendanceLog'

const pick = (input: HTMLElement) => fireEvent.change(input, { target: { files: [new File(['x'], 'emp.xlsx')] } })

const P = (o: Record<string, unknown>) => ({ rows: [], unknownHeaders: [], missingRequired: [], mapped: [{ header: 'الاسم', key: 'full_name' }, { header: 'الرقم الوظيفي', key: 'employee_number' }], headerRow: 1, skippedEmpty: 0, hasEmployeeNumber: true, localErrors: [], ...o })
beforeEach(() => { h.importCalls.length = 0; h.exported.length = 0; h.saveDept.mockClear(); h.parsed = P({}); h.importResult = { total: 0, ok: 0, failed: 0, rows: [] }; h.depts = [] })

describe('استيراد الموظفين', () => {
  it('ملف بلا عمود اسم يُرفض بتوجيه واضح قبل أي اتصال بالخادم', async () => {
    h.parsed = P({ rows: [], missingRequired: ['الاسم'], headerRow: 0, mapped: [] })
    render(<ImportEmployeesPanel />)
    pick(screen.getByTestId('imp-file'))
    await waitFor(() => expect(screen.getByTestId('imp-error')).toHaveTextContent('«الاسم»'))
    expect(h.importCalls).toEqual([])
  })
  it('ملف بأعمدة ناقصة وبلا رقم وظيفي: تُسحب البيانات الموجودة، تُولَّد الأرقام بالبادئة، وتظهر خريطة الأعمدة', async () => {
    h.parsed = P({ rows: [{ full_name: 'أحمد', phone: '0770' }, { full_name: 'سارة', phone: '0781', employee_number: 'X-1' }], hasEmployeeNumber: false, mapped: [{ header: 'الاسم', key: 'full_name' }, { header: 'الموبايل', key: 'phone' }], unknownHeaders: ['ملاحظات'], skippedEmpty: 2 })
    h.importResult = { total: 2, ok: 2, failed: 0, rows: [{ row: 1, employee_number: 'EMP-0001', full_name: 'أحمد', ok: true, id: null, errors: [] }, { row: 2, employee_number: 'X-1', full_name: 'سارة', ok: true, id: null, errors: [] }] }
    render(<ImportEmployeesPanel />)
    pick(screen.getByTestId('imp-file'))
    await waitFor(() => expect(screen.getByTestId('imp-table')).toBeInTheDocument())
    expect(h.importCalls[0]!.rows).toEqual([{ full_name: 'أحمد', phone: '0770', employee_number: 'EMP-0001' }, { full_name: 'سارة', phone: '0781', employee_number: 'X-1' }]) // الموجود «E1» لا يبدأ بـ EMP- فالعدّاد يبدأ من 0001
    expect(screen.getByTestId('imp-autonumber')).toBeInTheDocument()
    expect(screen.getByTestId('imp-map-phone')).toHaveAttribute('data-mapped', 'true'); expect(screen.getByTestId('imp-map-mother_name')).toHaveAttribute('data-mapped', 'false')
    expect(screen.getByTestId('imp-mapping')).toHaveTextContent('تُجوهل 2 صفاً بلا اسم'); expect(screen.getByTestId('imp-unknown')).toHaveTextContent('ملاحظات')
    expect(screen.queryByTestId('imp-error')).toBeNull()
  })
  it('التحقق المسبق (dry run) يعرض الصالح والخاطئ بأسبابه العربية، ثم التنفيذ يرسل الصفوف الصالحة فقط ويعرض تقرير النتائج', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.parsed = { rows: [{ employee_number: 'E1', full_name: 'أحمد', department: 'النقل', contract_type: 'daily' }, { employee_number: 'E2', full_name: 'سارة', department: 'مجهول' }, { employee_number: 'E3', full_name: 'علي', contract_type: 'monthly' }], unknownHeaders: [], missingRequired: [], localErrors: [{ row: 3, errors: ['HR_GENDER_INVALID'] }] }
    h.importResult = { total: 3, ok: 2, failed: 1, rows: [
      { row: 1, employee_number: 'E1', full_name: 'أحمد', ok: true, id: null, errors: [] },
      { row: 2, employee_number: 'E2', full_name: 'سارة', ok: false, id: null, errors: ['HR_IMPORT_DEPT_UNKNOWN'] },
      { row: 3, employee_number: 'E3', full_name: 'علي', ok: true, id: null, errors: [] },
    ] }
    render(<ImportEmployeesPanel />)
    pick(screen.getByTestId('imp-file'))
    await waitFor(() => expect(screen.getByTestId('imp-table')).toBeInTheDocument())
    expect(h.importCalls[0]).toMatchObject({ dryRun: true }); expect(h.importCalls[0]!.rows).toHaveLength(3)
    // الأخطاء المحلية (الجنس) تُدمج مع أخطاء الخادم (القسم) → صالح واحد فقط
    expect(screen.getByTestId('imp-ok')).toHaveTextContent('1'); expect(screen.getByTestId('imp-failed')).toHaveTextContent('2')
    expect(screen.getByTestId('imp-row-2')).toHaveTextContent('القسم غير موجود'); expect(screen.getByTestId('imp-row-3')).toHaveTextContent('الجنس')
    expect(screen.getByTestId('imp-row-1')).toHaveTextContent('النقل'); expect(screen.getByTestId('imp-row-1')).toHaveTextContent('يومي')
    h.importResult = { total: 1, ok: 1, failed: 0, rows: [{ row: 1, employee_number: 'E1', full_name: 'أحمد', ok: true, id: 'new', errors: [] }] }
    fireEvent.click(screen.getByTestId('imp-run'))
    await waitFor(() => expect(h.importCalls[1]).toMatchObject({ dryRun: false }))
    expect(h.importCalls[1]!.rows).toEqual([{ employee_number: 'E1', full_name: 'أحمد', department: 'النقل', contract_type: 'daily' }])
    await waitFor(() => expect(screen.getByTestId('imp-done')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('imp-report'))
    await waitFor(() => expect(h.exported).toHaveLength(1))
    expect((h.exported[0] as { title: string }).title).toBe('تقرير استيراد الموظفين')
  })
  it('زر الاستيراد معطّل حين لا يوجد صف صالح', async () => {
    h.parsed = { rows: [{ employee_number: '', full_name: '' }], unknownHeaders: [], missingRequired: [], localErrors: [] }
    h.importResult = { total: 1, ok: 0, failed: 1, rows: [{ row: 1, employee_number: '', full_name: '', ok: false, id: null, errors: ['HR_NUMBER_REQUIRED', 'HR_NAME_REQUIRED'] }] }
    render(<ImportEmployeesPanel />)
    pick(screen.getByTestId('imp-file'))
    await waitFor(() => expect(screen.getByTestId('imp-table')).toBeInTheDocument())
    expect(screen.getByTestId('imp-run')).toBeDisabled()
  })
})

describe('الهيكل التنظيمي', () => {
  const d = (o: Partial<{ id: string; name: string; code: string; parent_id: string | null; is_active: boolean; employees_active: number; manager_name: string | null; is_job_title: boolean; drives_vehicles: boolean; maintenance_specialty: string | null }>) => ({ id: 'x', name: 'x', code: 'X', parent_id: null, is_active: true, manager_id: null, manager_name: null, employees_active: 0, employees_total: 0, children: 0, created_at: '', is_job_title: false, drives_vehicles: false, maintenance_specialty: null, ...o })
  it('يعرض الشجرة بعمق صحيح مع عدد الموظفين ومجموع الفروع، ويخفي المعطّل افتراضياً', () => {
    h.depts = [d({ id: 'a', name: 'العمليات', code: 'OPS', employees_active: 2 }), d({ id: 'b', name: 'القاطع الأول', code: 'OPS-1', parent_id: 'a', employees_active: 5 }), d({ id: 'c', name: 'قديم', code: 'OLD', is_active: false })]
    render(<MemoryRouter><OrgStructure /></MemoryRouter>)
    expect(screen.getByTestId('org-row-OPS')).toHaveAttribute('data-depth', '0'); expect(screen.getByTestId('org-row-OPS-1')).toHaveAttribute('data-depth', '1')
    expect(within(screen.getByTestId('org-row-OPS')).getAllByRole('cell')[4]).toHaveTextContent('7')
    expect(screen.queryByTestId('org-row-OLD')).toBeNull()
    fireEvent.click(screen.getByTestId('org-show-inactive'))
    expect(screen.getByTestId('org-row-OLD')).toBeInTheDocument(); expect(screen.getByTestId('org-reactivate-OLD')).toBeInTheDocument()
    expect(screen.getByTestId('org-stat-active')).toHaveTextContent('2'); expect(screen.getByTestId('org-stat-headcount')).toHaveTextContent('7')
  })
  it('إضافة قسم فرعي تملأ الأب تلقائياً وتتحقق من الاسم والرمز ثم تستدعي الحفظ', async () => {
    h.depts = [d({ id: 'a', name: 'العمليات', code: 'OPS' })]
    render(<MemoryRouter><OrgStructure /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('org-addchild-OPS'))
    expect((screen.getByTestId('org-parent') as HTMLSelectElement).value).toBe('a')
    fireEvent.click(screen.getByTestId('org-save'))
    expect(screen.getByTestId('org-error')).toHaveTextContent('اسم القسم'); expect(h.saveDept).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('org-name'), { target: { value: 'القاطع الثاني' } })
    fireEvent.click(screen.getByTestId('org-save'))
    expect(screen.getByTestId('org-error')).toHaveTextContent('رمز')
    fireEvent.change(screen.getByTestId('org-code'), { target: { value: 'ops-2' } })
    fireEvent.change(screen.getByTestId('org-manager'), { target: { value: 'e1' } })
    fireEvent.click(screen.getByTestId('org-save'))
    await waitFor(() => expect(h.saveDept).toHaveBeenCalledWith({ id: null, name: 'القاطع الثاني', code: 'ops-2', parentId: 'a', managerId: 'e1', isActive: true, isJobTitle: false, drivesVehicles: false, maintenanceSpecialty: null }))
  })
  it('التعديل يحمّل بيانات القسم، والتعطيل يطلب تأكيداً ويرسل isActive=false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.depts = [d({ id: 'a', name: 'العمليات', code: 'OPS' }), d({ id: 'b', name: 'الفرعي', code: 'OPS-1', parent_id: 'a' })]
    render(<MemoryRouter><OrgStructure /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('org-edit-OPS-1'))
    expect((screen.getByTestId('org-name') as HTMLInputElement).value).toBe('الفرعي'); expect((screen.getByTestId('org-parent') as HTMLSelectElement).value).toBe('a')
    // القسم نفسه لا يظهر كأب محتمل (منع الدورة من الواجهة أيضاً)
    expect(within(screen.getByTestId('org-parent')).queryByText(/OPS-1/)).toBeNull()
    fireEvent.click(screen.getByTestId('org-deactivate-OPS-1'))
    await waitFor(() => expect(h.saveDept).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', isActive: false })))
  })
  it('00153: «+ مسمى» يفتح نموذج مسمى وظيفي تحت القسم الأب مع خانة «يقود آليات»، والمسمى لا يقبل فروعاً ولا يظهر كأب', async () => {
    h.depts = [
      d({ id: 'a', name: 'قسم الآليات', code: 'FLEET' }),
      d({ id: 't', name: 'سائق كابسة', code: 'T-DRV', parent_id: 'a', is_job_title: true, drives_vehicles: true }),
      d({ id: 'm', name: 'ميكانيكي', code: 'T-MECH', parent_id: 'a', is_job_title: true, drives_vehicles: false }),
    ]
    render(<MemoryRouter><OrgStructure /></MemoryRouter>)
    expect(screen.getByTestId('org-stat-titles')).toHaveTextContent('2')
    expect(screen.getByTestId('org-stat-driver-titles')).toHaveTextContent('1')
    expect(screen.getByTestId('org-title-badge-T-DRV')).toBeInTheDocument()
    expect(screen.getByTestId('org-drives-badge-T-DRV')).toBeInTheDocument()
    expect(screen.queryByTestId('org-drives-badge-T-MECH')).toBeNull()
    // المسمى لا يقبل فروعاً ولا مسميات تحته
    expect(screen.queryByTestId('org-addchild-T-DRV')).toBeNull()
    expect(screen.queryByTestId('org-addtitle-T-DRV')).toBeNull()
    fireEvent.click(screen.getByTestId('org-addtitle-FLEET'))
    expect((screen.getByTestId('org-is-title') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('org-parent') as HTMLSelectElement).value).toBe('a')
    // المسميات لا تظهر كأب محتمل
    expect(within(screen.getByTestId('org-parent')).queryByText(/T-DRV/)).toBeNull()
    fireEvent.change(screen.getByTestId('org-name'), { target: { value: 'سائق شفل' } })
    fireEvent.change(screen.getByTestId('org-code'), { target: { value: 'T-LOADER' } })
    fireEvent.click(screen.getByTestId('org-drives'))
    fireEvent.click(screen.getByTestId('org-save'))
    await waitFor(() => expect(h.saveDept).toHaveBeenCalledWith({ id: null, name: 'سائق شفل', code: 'T-LOADER', parentId: 'a', managerId: null, isActive: true, isJobTitle: true, drivesVehicles: true, maintenanceSpecialty: null }))
  })
  it('00156: خانة «تخصص صيانة» على المسمى — شارة على العقدة وإرسال التخصص عند الحفظ', async () => {
    h.depts = [
      d({ id: 'a', name: 'قسم الصيانة', code: 'MAINT' }),
      d({ id: 'm', name: 'فني كهرباء', code: 'T-EL', parent_id: 'a', is_job_title: true, drives_vehicles: false, maintenance_specialty: 'electrical' }),
    ]
    render(<MemoryRouter><OrgStructure /></MemoryRouter>)
    expect(screen.getByTestId('org-tech-badge-T-EL')).toHaveTextContent('فني كهرباء')
    fireEvent.click(screen.getByTestId('org-addtitle-MAINT'))
    fireEvent.change(screen.getByTestId('org-name'), { target: { value: 'فني إطارات' } })
    fireEvent.change(screen.getByTestId('org-code'), { target: { value: 'T-TIRE' } })
    fireEvent.change(screen.getByTestId('org-maintenance-specialty'), { target: { value: 'tires' } })
    fireEvent.click(screen.getByTestId('org-save'))
    await waitFor(() => expect(h.saveDept).toHaveBeenCalledWith(expect.objectContaining({ name: 'فني إطارات', isJobTitle: true, maintenanceSpecialty: 'tires' })))
  })
})

describe('تصدير Excel من HR', () => {
  it('الموظفون: اختيار الأعمدة يؤثر في التصدير والفلاتر تُرفق', async () => {
    render(<MemoryRouter><EmployeesList /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('column-picker-toggle'))
    fireEvent.click(screen.getByTestId('column-picker-mother_name'))
    fireEvent.click(screen.getByTestId('column-picker-phone'))
    fireEvent.change(screen.getByTestId('emp-search'), { target: { value: 'أحمد' } })
    fireEvent.click(screen.getByTestId('emp-export'))
    await waitFor(() => expect(h.exported).toHaveLength(1))
    const spec = h.exported[0] as { columns: Array<{ key: string }>; filters: Array<[string, string]>; rows: unknown[] }
    const keys = spec.columns.map((c) => c.key)
    expect(keys).toContain('mother_name'); expect(keys).not.toContain('phone'); expect(keys).not.toContain('base_salary')
    expect(spec.filters).toContainEqual(['بحث', 'أحمد']); expect(spec.rows).toHaveLength(1)
  })
  it('الحضور: التصدير يحمل نطاق التاريخ والحالة المختارة', async () => {
    render(<MemoryRouter><AttendanceLog /></MemoryRouter>)
    fireEvent.change(screen.getByTestId('att-from'), { target: { value: '2026-09-01' } }); fireEvent.change(screen.getByTestId('att-to'), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByTestId('att-stat-late'))
    fireEvent.click(screen.getByTestId('att-export'))
    await waitFor(() => expect(h.exported).toHaveLength(1))
    const spec = h.exported[0] as { title: string; filters: Array<[string, string]> }
    expect(spec.title).toBe('سجل الحضور والانصراف'); expect(spec.filters).toContainEqual(['من', '2026-09-01']); expect(spec.filters).toContainEqual(['الحالة', 'متأخر'])
  })
})

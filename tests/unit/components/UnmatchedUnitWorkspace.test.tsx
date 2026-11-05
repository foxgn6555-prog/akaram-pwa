import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const m = vi.hoisted(() => ({ report: vi.fn(), access: vi.fn(), permissions: vi.fn(), setPermission: vi.fn(), edits: vi.fn(), editName: vi.fn(), editDay: vi.fn(), history: vi.fn(), punches: vi.fn(), download: vi.fn(), candidate: vi.fn(), confirm: vi.fn() }))
vi.mock('@sdk/biometric.sdk', () => ({ biometric: {
  unmatchedIndependentCandidate: m.candidate, unmatchedConfirmIndependent: m.confirm, unmatchedUnitReport: m.report, unmatchedUnitAccess: m.access, unmatchedUnitPermissions: m.permissions, unmatchedUnitSetPermission: m.setPermission,
  unmatchedUnitEdits: m.edits, unmatchedUnitEditName: m.editName, unmatchedUnitEditDay: m.editDay, unmatchedUnitHistory: m.history, unmatchedArchivePunches: m.punches,
} }))
vi.mock('@features/hr/lib/hrExcel', () => ({ downloadWorkbook: m.download }))

import UnmatchedUnitWorkspace from '@portals/hr/pages/Biometric/UnmatchedUnitWorkspace'
import { buildUnitWorkbook, collectUnitRows, unitLocalTime } from '@features/integrations/lib/unmatchedUnitExcel'
import type { UnmatchedUnitDay, UnmatchedUnitFilters, UnmatchedUnitPerson } from '@features/integrations/types'

const day = (date: string, status: UnmatchedUnitDay['status'], extra: Partial<UnmatchedUnitDay> = {}): UnmatchedUnitDay => ({ date, status, punch_count: 0, entry: null, exit: null, raw_first: null, raw_last: null, manual_revision: 0, manual: false, ...extra })
const rows: UnmatchedUnitPerson[] = [
  { device_serial: 'D1', pin: '901', person_name: 'علي', device_name: 'جهاز أ', branch_id: 'b1', current_pin_linked: false, days: [day('2025-05-01', 'present', { entry: '2025-05-01T16:00:00', exit: '2025-05-02T03:00:00', punch_count: 1 }), day('2025-05-02', 'previous_exit', { exit: '2025-05-02T03:00:00', punch_count: 1 }), day('2025-05-03', 'missing', { raw_first: '2025-05-03T08:00:00', punch_count: 1 })] },
  { device_serial: 'D2', pin: '901', person_name: 'سالم', device_name: 'جهاز ب', branch_id: null, current_pin_linked: false, days: [day('2025-05-01', 'absent'), day('2025-05-02', 'absent'), day('2025-05-03', 'leave', { manual: true, manual_revision: 1 })] },
]
const branches = [{ id: 'b1', name: 'فرع الكرخ' }]
function setup(mode: 'grid' | 'details' = 'grid') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}><UnmatchedUnitWorkspace mode={mode} branches={branches} /></QueryClientProvider>)
}
describe('واجهة وحدة غير المطابقين الجديدة', () => {
  beforeEach(() => {
    vi.resetAllMocks(); m.report.mockResolvedValue(rows); m.access.mockResolvedValue({ can_edit: true, can_manage: true })
    m.permissions.mockResolvedValue([{ user_id: 'hr1', display_name: 'حساب الموارد', email: 'hr@test', can_edit: false }]); m.setPermission.mockResolvedValue(undefined)
    m.edits.mockResolvedValue({ person: null, days: [] }); m.editDay.mockResolvedValue(undefined); m.editName.mockResolvedValue(undefined)
    m.history.mockResolvedValue([{ id: 1, action: 'day', work_day: '2025-05-01', actor: 'actor', actor_name: 'المستخدم الأول', created_at: '2025-05-01T10:00:00Z', old_value: null, new_value: { status: 'leave' } }])
    m.candidate.mockResolvedValue({ device_serial: 'D2', pin: '901', device_name: 'جهاز ب', device_user_name: 'سالم', employee_name: 'موظف آخر', source_punch_count: 4, already_confirmed: false }); m.confirm.mockResolvedValue(undefined)
    m.punches.mockResolvedValue([{ source_punch_id: 'p1', punched_at: '2025-05-01T13:00:00Z', original_punch: { direction: 'unknown' }, original_device: { timezone_offset: '+03:00' } }]); m.download.mockResolvedValue(undefined)
  })
  it('يعاين الرقم المكرر ويطلب تأكيد الشخص المختلف ويبقي الربط الرسمي', async () => {
    setup(); fireEvent.click(await screen.findByRole('button', { name: 'تأكيد رقم مكرر' }))
    fireEvent.change(screen.getByTestId('independent-device'), { target: { value: 'D2' } }); fireEvent.change(screen.getByTestId('independent-pin'), { target: { value: '901' } })
    fireEvent.click(screen.getByRole('button', { name: 'معاينة الرقم' }))
    expect(await screen.findByTestId('independent-preview')).toHaveTextContent('موظف آخر')
    expect(screen.getByTestId('independent-preview')).toHaveTextContent('لن يتغير تسجيل الحضور الرسمي')
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد أنه شخص مختلف' }))
    await waitFor(() => expect(m.confirm).toHaveBeenCalledWith('D2', '901'))
    expect(await screen.findByText('تم تأكيد هذا الجهاز والرقم كشخص مستقل.')).toBeInTheDocument()
  })
  it('يعرض دخول المساء وخروج اليوم التالي وشخصين للرقم نفسه مع إبقاء الناقصة منفصلة', async () => {
    setup()
    const grid = await screen.findByTestId('unit-grid')
    expect(grid).toHaveTextContent('04:00 مساءً')
    expect(grid).toHaveTextContent('03:00 صباحاً (2025-05-02)')
    expect(grid).toHaveTextContent('بصمة ناقصة')
    expect(grid).toHaveTextContent('مجاز')
    expect(grid).toHaveTextContent('D1'); expect(grid).toHaveTextContent('D2')
    expect(grid).toHaveTextContent('سالم')
  })
  it('يُظهر الأصل والتدقيق ويسجل إجازة يدوية منفصلة', async () => {
    setup()
    await screen.findByTestId('unit-grid')
    await waitFor(() => expect(screen.getByRole('button', { name: 'صلاحيات HR' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'علي 2025-05-01 حاضر' }))
    const panel = await screen.findByTestId('unit-person-panel')
    expect(await within(panel).findByText('غير محدد')).toBeInTheDocument()
    expect(await within(panel).findByText(/المستخدم الأول/)).toBeInTheDocument()
    fireEvent.change(within(panel).getByTestId('unit-edit-status'), { target: { value: 'leave' } })
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'حفظ اليوم' })).toBeEnabled())
    fireEvent.click(within(panel).getByRole('button', { name: 'حفظ اليوم' }))
    await waitFor(() => expect(m.editDay).toHaveBeenCalledWith('D1', '901', '2025-05-01', 'leave', null, null, false, 0))
    expect(await screen.findByTestId('unit-grid')).toBeInTheDocument()
  })
  it('قراءة فقط تمنع إظهار خيارات التعديل حتى لو استُخدم المكون مباشرة', async () => {
    m.access.mockResolvedValue({ can_edit: false, can_manage: false })
    setup('details')
    const table = await screen.findByTestId('unit-details')
    fireEvent.click(within(table).getAllByRole('button', { name: 'فتح اليوم' })[0]!)
    expect(await screen.findByText('حسابك للقراءة فقط في هذه الوحدة.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حفظ اليوم' })).not.toBeInTheDocument()
  })
  it('التطوير يدير صلاحية حساب HR', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'صلاحيات HR' }))
    fireEvent.click(await screen.findByRole('button', { name: 'السماح بالتعديل' }))
    await waitFor(() => expect(m.setPermission).toHaveBeenCalledWith('hr1', true))
  })
  it('الفلاتر ترسل للخادم ويمنع التصدير قبل تطبيقها', async () => {
    setup('details')
    await screen.findByTestId('unit-details')
    fireEvent.change(screen.getByLabelText('الاسم'), { target: { value: 'علي' } })
    expect(screen.getByTestId('unit-report-export')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق الفلاتر' }))
    await waitFor(() => expect(m.report).toHaveBeenCalledWith(expect.objectContaining({ name: 'علي' }), null, 26))
    await waitFor(() => expect(screen.getByTestId('unit-report-export')).toBeEnabled())
    fireEvent.click(screen.getByTestId('unit-report-export'))
    await waitFor(() => expect(m.download).toHaveBeenCalledTimes(1))
    expect(m.download.mock.calls[0]![0].getWorksheet('تفاصيل يومية').getCell('A2').value).toContain('علي')
  })
  it('يصدّر كل الصفحات بترتيب العرض وكل شكل بتنسيقه مع احترام فلتر الحالة', async () => {
    const f: UnmatchedUnitFilters = { from: '2025-05-01', to: '2025-05-03', status: 'leave' }
    const all = Array.from({ length: 201 }, (_, i) => ({ ...rows[1]!, device_serial: 'D', pin: String(i).padStart(3, '0') }))
    m.report.mockImplementation(async (_f, cursor) => cursor ? all.slice(200) : all)
    const list = await collectUnitRows(f)
    expect(list).toHaveLength(201)
    expect(m.report).toHaveBeenLastCalledWith(f, { device: 'D', pin: '199' }, 201)
    const detail = await buildUnitWorkbook(rows, f, branches, 'details')
    const ds = detail.getWorksheet('تفاصيل يومية')!
    expect(ds.rowCount).toBe(4); expect(ds.getRow(4).getCell(7).value).toBe('مجاز')
    const grid = await buildUnitWorkbook(rows, f, branches, 'grid')
    expect(grid.getWorksheet('دخول وخروج')!.getRow(4).getCell(6).value).toContain('04:00 مساءً')
    expect(unitLocalTime('2025-05-02T03:00:00', '2025-05-01')).toBe('03:00 صباحاً (2025-05-02)')
  })
})

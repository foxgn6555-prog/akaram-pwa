/**
 * 00377: سائقون متعددون للآلية — منطق الصفوف الإضافية، محرر الإضافة، لوحة سائقي الشفتات، واختيار الاحتياطي عند الانطلاق.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDriverSlots, validateExtraDrivers, type ExtraDriverRow } from '@features/central-garage/vehicle-drivers'

const E1 = 'e0000000-0000-0000-0000-000000000001'
const E2 = 'e0000000-0000-0000-0000-000000000002'
const X1 = 'ab000000-0000-0000-0000-000000000001'
const row = (p: Partial<ExtraDriverRow>): ExtraDriverRow => ({ key: p.key ?? Math.random().toString(36), shift: 'morning', role: 'backup', driverKind: 'employee', driverEmployeeId: '', driverExternalId: '', ...p })
const primary = { shift: 'morning', driverKind: 'employee' as const, driverEmployeeId: E1, driverExternalId: '', sectorId: 3 }

describe('validateExtraDrivers / buildDriverSlots', () => {
  it('يقبل احتياطياً للشفت الرئيسي وسائقاً لشفت آخر ويبني القائمة بالأساسي أولاً', () => {
    const rows = [row({ key: 'b', driverEmployeeId: E2 }), row({ key: 'n', shift: 'night', role: 'primary', driverKind: 'external', driverExternalId: X1 })]
    expect(validateExtraDrivers(primary, rows)).toEqual({})
    expect(buildDriverSlots(primary, rows)).toEqual([
      { shift: 'morning', role: 'primary', driverEmployeeId: E1, driverExternalId: null, sectorId: 3 },
      { shift: 'morning', role: 'backup', driverEmployeeId: E2, driverExternalId: null, sectorId: 3 },
      { shift: 'night', role: 'primary', driverEmployeeId: null, driverExternalId: X1, sectorId: 3 },
    ])
  })
  it('يرفض: أساسياً ثانياً للشفت الرئيسي، الشخص نفسه أساسياً واحتياطياً، احتياطياً بلا أساسي، وصفاً بلا سائق', () => {
    expect(validateExtraDrivers(primary, [row({ key: 'a', role: 'primary', driverEmployeeId: E2 })])).toEqual({ a: 'لهذا الشفت سائق أساسي بالفعل' })
    expect(validateExtraDrivers(primary, [row({ key: 'a', driverEmployeeId: E1 })])).toEqual({ a: 'الشخص نفسه لا يكون أساسياً واحتياطياً في الشفت نفسه' })
    expect(validateExtraDrivers(primary, [row({ key: 'a', shift: 'evening', driverEmployeeId: E2 })])).toEqual({ a: 'الاحتياطي يحتاج سائقاً أساسياً في الشفت نفسه — أضف الأساسي أولاً' })
    expect(validateExtraDrivers(primary, [row({ key: 'a' })])).toEqual({ a: 'اختر السائق من قائمة الموظفين' })
    expect(validateExtraDrivers(primary, [row({ key: 'a', driverKind: 'external' })])).toEqual({ a: 'اختر سائق المتعهد من السجل أو أضفه' })
    expect(validateExtraDrivers(primary, [row({ key: 'a', shift: '' })])).toEqual({ a: 'اختر الشفت' })
    expect(validateExtraDrivers(primary, [row({ key: 'a', driverEmployeeId: E2 }), row({ key: 'b', driverKind: 'external', driverExternalId: X1 })])).toEqual({ b: 'لهذا الشفت سائق احتياطي بالفعل' })
  })
})

const h = vi.hoisted(() => ({
  setMutate: vi.fn(),
  endMutate: vi.fn(),
  depart: vi.fn(),
  assignments: [] as Record<string, unknown>[],
}))
vi.mock('@features/station-fleet/hooks', () => ({
  useStationExternalDrivers: () => ({ data: [{ id: 'ab000000-0000-0000-0000-000000000001', full_name: 'كرار المتعهد', phone: null, contractor_name: 'متعهد النقل', contractor_user_id: 'c-1', license_no: null, license_image_path: null, notes: null, active: true }] }),
  useContractorOptions: () => ({ data: [] }),
  useSaveExternalDriver: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@features/permissions/my-permissions', () => ({ useCanCall: () => ({ allowed: true, title: undefined }) }))
vi.mock('@features/central-garage/hooks', () => ({
  useGarageAreas: () => ({ data: [{ id: 1, name: 'أرخيته', parentSector: 'karrada' }] }),
  useFleetDriverOptions: (search: string) => ({
    data: search.trim().length >= 2 ? [{ employeeId: 'e0000000-0000-0000-0000-000000000002', fullName: 'حسن كريم', employeeNumber: 'EMP-2', jobTitle: 'سائق', departmentName: 'الآليات', hasBiometric: false, employmentStatus: 'active', assignedVehicles: [] }] : [],
    isLoading: false,
  }),
  useGarageShiftAssignments: () => ({ data: h.assignments, isLoading: false, refetch: vi.fn() }),
  useSetGarageShiftAssignment: () => ({ mutate: h.setMutate, isPending: false }),
  useEndGarageShiftAssignment: () => ({ mutate: h.endMutate, isPending: false }),
  useGarageShiftDispatchRecipients: () => ({ data: [{ userId: 'm1', managerName: 'مسؤول أرخيته', shift: 'morning', sectors: [1], resolution: 'direct', pickRank: 1 }] }),
  useRecordGarageShiftDeparture: () => ({ mutate: h.depart, isPending: false }),
  useGarageVehicles: () => ({ data: { rows: [vehicle], totalCount: 1 }, isLoading: false }),
  useGarageDepartures: () => ({ data: [], isLoading: false }),
  useGarageDepartureDays: () => ({ data: [] }),
  useGarageDeparturesForDay: () => ({ data: [], isLoading: false }),
  useRecordGarageDeparture: () => ({ mutate: vi.fn(), isPending: false }),
  useRecordGarageReturn: () => ({ mutate: vi.fn(), isPending: false }),
  useGarageDispatchRecipients: () => ({ data: [] }),
}))
vi.mock('@portals/central-garage/components/AssignmentDialog', () => ({ AssignmentDialog: () => null }))
import { ShiftDriversPanel } from '@portals/central-garage/components/ShiftDriversPanel'
import { VehicleDriversEditor } from '@portals/central-garage/components/VehicleDriversEditor'
import DriversDispatchPage from '@portals/central-garage/pages/DriversDispatchPage'
import type { GarageVehicle } from '@features/central-garage/types'

const vehicle = {
  id: 'v1', vehicleName: 'كابسة', dbNumber: 'DB-1', plateNumber: 'P', chassisNumber: 'C', vehicleCategory: 'large_compactor', ownershipType: 'owned',
  lessorName: null, rentalContractNo: null, rentalStartDate: null, rentalEndDate: null, modelYear: null, vehicleColor: null, specifications: null,
  imagePath: 'x', imageUrl: 'x', shift: 'morning', driverName: 'علي', driverEmployeeId: E1, sectorId: 1, areaName: 'أرخيته', parentSector: 'karrada',
  createdAt: 'now', updatedAt: 'now', archivedAt: null, archivedBy: null,
} as unknown as GarageVehicle
const A = (p: Record<string, unknown>) => ({ id: 'a1', vehicleId: 'v1', shift: 'morning', driverName: 'علي', driverEmployeeId: E1, driverEmployeeNumber: 'EMP-1', sectorId: 1, areaName: 'أرخيته', parentSector: 'karrada', startsAt: 'now', endsAt: null, changeReason: null, driverRole: 'primary', driverExternalId: null, contractorName: null, ...p })

beforeEach(() => { h.setMutate.mockReset(); h.endMutate.mockReset(); h.depart.mockReset(); h.assignments = [A({})] })

describe('VehicleDriversEditor (إضافة الآلية)', () => {
  it('يضيف صف احتياطي للشفت الرئيسي وصف شفت آخر ويحذف ويبدّل نوع السائق', () => {
    let rows: ExtraDriverRow[] = []
    const { rerender } = render(<VehicleDriversEditor rows={rows} onChange={(r) => { rows = r }} mainShift="morning" errors={{}} />)
    fireEvent.click(screen.getByTestId('add-backup-driver'))
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ shift: 'morning', role: 'backup', driverKind: 'employee' })
    rerender(<VehicleDriversEditor rows={rows} onChange={(r) => { rows = r }} mainShift="morning" errors={{ [rows[0]!.key]: 'اختر السائق من قائمة الموظفين' }} />)
    expect(screen.getByTestId('extra-driver-error-0')).toHaveTextContent('اختر السائق من قائمة الموظفين')
    fireEvent.click(screen.getByTestId('extra-driver-kind-external-0'))
    expect(rows[0]?.driverKind).toBe('external')
    rerender(<VehicleDriversEditor rows={rows} onChange={(r) => { rows = r }} mainShift="morning" errors={{}} />)
    expect(screen.getByTestId('extra-ext-driver-0')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('add-shift-driver'))
    expect(rows).toHaveLength(2); expect(rows[1]).toMatchObject({ shift: '', role: 'primary' })
    rerender(<VehicleDriversEditor rows={rows} onChange={(r) => { rows = r }} mainShift="morning" errors={{}} />)
    fireEvent.change(screen.getByTestId('extra-driver-shift-1'), { target: { value: 'night' } })
    expect(rows[1]?.shift).toBe('night')
    rerender(<VehicleDriversEditor rows={rows} onChange={(r) => { rows = r }} mainShift="morning" errors={{}} />)
    fireEvent.click(screen.getByTestId('extra-driver-remove-0'))
    expect(rows).toHaveLength(1); expect(rows[0]?.shift).toBe('night')
  })
})

describe('ShiftDriversPanel (تفاصيل الآلية — غرفة العمليات)', () => {
  it('يعرض الأساسي والاحتياطي لكل شفت مع اسم المتعهد، ويُنهي الاحتياطي بسبب', () => {
    h.assignments = [A({}), A({ id: 'a2', driverRole: 'backup', driverName: 'كرار المتعهد', driverEmployeeId: null, driverEmployeeNumber: null, driverExternalId: X1, contractorName: 'متعهد النقل' })]
    render(<MemoryRouter><ShiftDriversPanel vehicle={vehicle} areas={[{ id: 1, name: 'أرخيته', parentSector: 'karrada', sort: 1 }]} canManage /></MemoryRouter>)
    const box = screen.getByTestId('shift-drivers-morning')
    expect(box).toHaveTextContent('أساسي'); expect(box).toHaveTextContent('علي'); expect(box).toHaveTextContent('موظف · EMP-1')
    expect(box).toHaveTextContent('احتياطي'); expect(box).toHaveTextContent('كرار المتعهد'); expect(box).toHaveTextContent('سائق متعهد · متعهد النقل')
    fireEvent.click(screen.getByTestId('end-backup-morning'))
    expect(screen.getByTestId('end-backup-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('end-backup-reason'), { target: { value: 'لم يعد مطلوباً' } })
    fireEvent.click(screen.getByTestId('end-backup-submit'))
    expect(h.endMutate).toHaveBeenCalledWith({ assignmentId: 'a2', vehicleId: 'v1', reason: 'لم يعد مطلوباً' }, expect.anything())
  })
  it('يضيف احتياطياً من سجل المتعهدين بدور واضح وسبب، ويمنع الاحتياطي لشفت بلا أساسي', async () => {
    render(<MemoryRouter><ShiftDriversPanel vehicle={vehicle} areas={[{ id: 1, name: 'أرخيته', parentSector: 'karrada', sort: 1 }]} canManage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('open-shift-driver'))
    expect(screen.getByTestId('shift-driver-role')).toHaveValue('backup')
    fireEvent.change(screen.getByTestId('shift-driver-shift'), { target: { value: 'evening' } })
    fireEvent.click(screen.getByTestId('shift-driver-kind-external'))
    fireEvent.change(screen.getByTestId('shift-driver-external-select'), { target: { value: X1 } })
    fireEvent.change(screen.getByTestId('shift-driver-reason'), { target: { value: 'احتياطي الإجازات' } })
    fireEvent.click(screen.getByTestId('shift-driver-submit'))
    expect(screen.getByTestId('shift-driver-error')).toHaveTextContent('الاحتياطي يحتاج سائقاً أساسياً في الشفت نفسه')
    expect(h.setMutate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('shift-driver-shift'), { target: { value: 'morning' } })
    fireEvent.click(screen.getByTestId('shift-driver-submit'))
    expect(h.setMutate).toHaveBeenCalledWith(
      { vehicleId: 'v1', shift: 'morning', role: 'backup', driverEmployeeId: null, driverExternalId: X1, sectorId: 1, reason: 'احتياطي الإجازات' },
      expect.anything(),
    )
  })
  it('للكراج (قراءة فقط): لا أزرار إضافة أو إنهاء', () => {
    h.assignments = [A({}), A({ id: 'a2', driverRole: 'backup', driverName: 'حسن' })]
    render(<MemoryRouter><ShiftDriversPanel vehicle={vehicle} areas={[]} canManage={false} /></MemoryRouter>)
    expect(screen.queryByTestId('open-shift-driver')).toBeNull()
    expect(screen.queryByTestId('end-backup-morning')).toBeNull()
    expect(screen.getByTestId('shift-drivers-morning')).toHaveTextContent('حسن')
  })
})

describe('DriversDispatchPage — الانطلاق بالاحتياطي', () => {
  it('بلا احتياطي: لا اختيار دور ويُرسل primary؛ مع احتياطي: اختيار الاحتياطي يُرسل backup ويُظهر اسمه', () => {
    render(<DriversDispatchPage />)
    fireEvent.click(screen.getByTestId('depart-v1'))
    expect(screen.queryByTestId('dispatch-driver-role')).toBeNull()
    fireEvent.click(screen.getByTestId('confirm-departure'))
    expect(h.depart).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: 'v1', shift: 'morning', driverRole: 'primary' }), expect.anything())
  })
  it('مع احتياطي: يختار الاحتياطي فيُرسل backup', () => {
    h.assignments = [A({}), A({ id: 'a2', driverRole: 'backup', driverName: 'كرار المتعهد', driverEmployeeId: null, driverExternalId: X1, contractorName: 'متعهد النقل' })]
    render(<DriversDispatchPage />)
    fireEvent.click(screen.getByTestId('depart-v1'))
    const roles = screen.getByTestId('dispatch-driver-role')
    expect(within(roles).getByTestId('dispatch-driver-role-backup')).toHaveTextContent('كرار المتعهد')
    fireEvent.click(screen.getByTestId('dispatch-driver-role-backup'))
    expect(screen.getByText(/السائق: كرار المتعهد \(احتياطي\) · متعهد: متعهد النقل/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-departure'))
    expect(h.depart).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: 'v1', shift: 'morning', driverRole: 'backup' }), expect.anything())
  })
})

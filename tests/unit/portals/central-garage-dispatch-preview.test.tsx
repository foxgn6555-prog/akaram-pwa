/** معاينة الإسناد التلقائي في نافذة الانطلاق: مباشر / ارتداد قاطع / تداخل / غياب كلي */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const h = vi.hoisted(() => ({
  recipients: vi.fn(),
}))

vi.mock('@features/central-garage/hooks', () => ({
  useGarageAreas: () => ({ data: [{ id: 4, name: 'الجادرية', parentSector: 'karrada' }] }),
  useGarageVehicles: () => ({
    data: {
      rows: [
        {
          id: 'v1',
          vehicleName: 'كابسة كبيرة',
          dbNumber: 'DB-1',
          plateNumber: 'P',
          chassisNumber: 'C',
          vehicleCategory: 'large_compactor',
          ownershipType: 'owned',
          lessorName: null,
          rentalContractNo: null,
          rentalStartDate: null,
          rentalEndDate: null,
          modelYear: null,
          vehicleColor: null,
          specifications: null,
          imagePath: 'x',
          imageUrl: 'x',
          shift: 'morning',
          driverName: 'علي',
          sectorId: 4,
          areaName: 'الجادرية',
          parentSector: 'karrada',
          createdAt: 'now',
          updatedAt: 'now',
          archivedAt: null,
          archivedBy: null,
        },
      ],
      totalCount: 1,
    },
    isLoading: false,
  }),
  useGarageDepartures: () => ({ data: [], isLoading: false }),
  useGarageDepartureDays: () => ({ data: [] }),
  useGarageDeparturesForDay: () => ({ data: [], isLoading: false }),
  useRecordGarageDeparture: () => ({ mutate: vi.fn(), isPending: false }),
  useRecordGarageReturn: () => ({ mutate: vi.fn(), isPending: false }),
  useGarageDispatchRecipients: () => ({ data: [] }),
  useGarageShiftAssignments: () => ({
    data: [
      {
        id: 'a1',
        vehicleId: 'v1',
        shift: 'morning',
        driverName: 'علي',
        sectorId: 4,
        areaName: 'الجادرية',
        parentSector: 'karrada',
        startsAt: 'now',
        endsAt: null,
        changeReason: null,
      },
    ],
    refetch: vi.fn(),
  }),
  useGarageShiftDispatchRecipients: () => ({ data: h.recipients() }),
  useRecordGarageShiftDeparture: () => ({ mutate: vi.fn(), isPending: false }),
  useSetGarageShiftAssignment: () => ({ mutate: vi.fn() }),
}))
vi.mock('@portals/central-garage/components/AssignmentDialog', () => ({
  AssignmentDialog: () => null,
}))

import DriversDispatchPage from '@portals/central-garage/pages/DriversDispatchPage'

const openDialog = () => {
  render(<DriversDispatchPage />)
  fireEvent.click(screen.getByTestId('depart-v1'))
}

beforeEach(() => h.recipients.mockReset())

describe('معاينة مسؤول الانطلاقية', () => {
  it('يعرض المسؤول المباشر دون ملاحظة الارتداد', () => {
    h.recipients.mockReturnValue([
      { userId: 'm1', managerName: 'مسؤول الجادرية', shift: 'morning', sectors: [4], resolution: 'direct', pickRank: 1 },
    ])
    openDialog()
    expect(screen.getByText(/المسؤول المستلم تلقائياً: مسؤول الجادرية/)).toBeInTheDocument()
    expect(screen.queryByTestId('dispatch-fallback-note')).not.toBeInTheDocument()
    expect(screen.getByTestId('confirm-departure')).toBeEnabled()
  })

  it('يعرض مسؤول الارتداد مع ملاحظة توضح سبب الإسناد', () => {
    h.recipients.mockReturnValue([
      { userId: 'm2', managerName: 'مسؤول الرياض', shift: 'morning', sectors: [2], resolution: 'parent_fallback', pickRank: 1 },
    ])
    openDialog()
    expect(screen.getByText(/المسؤول المستلم تلقائياً: مسؤول الرياض/)).toBeInTheDocument()
    expect(screen.getByTestId('dispatch-fallback-note')).toBeInTheDocument()
    expect(
      screen.getByText(/ارتد الإسناد تلقائياً إلى مسؤول يغطي قطاعاً شقيقاً ضمن القاطع نفسه/),
    ).toBeInTheDocument()
    expect(screen.getByTestId('confirm-departure')).toBeEnabled()
  })

  it('يحسم التداخل تلقائياً ويتيح التبديل اليدوي', () => {
    h.recipients.mockReturnValue([
      { userId: 'm1', managerName: 'أ', shift: 'morning', sectors: [4], resolution: 'direct', pickRank: 1 },
      { userId: 'm2', managerName: 'ب', shift: 'morning', sectors: [4], resolution: 'direct', pickRank: 2 },
    ])
    openDialog()
    expect(screen.getByText(/المسؤول المستلم تلقائياً: أ/)).toBeInTheDocument()
    expect(screen.getByText(/يوجد 2 مسؤولين متوافقين/)).toBeInTheDocument()
    expect(screen.getByTestId('confirm-departure')).toBeEnabled()
    fireEvent.click(screen.getByTestId('dispatch-mode-manual'))
    fireEvent.change(screen.getByTestId('manual-manager-select'), { target: { value: 'm2' } })
    expect(screen.getByText(/المسؤول المختار يدوياً: ب/)).toBeInTheDocument()
    expect(screen.getByTestId('confirm-departure')).toBeEnabled()
  })

  it('يوضح الغياب الكلي للمسؤولين ضمن القاطع', () => {
    h.recipients.mockReturnValue([])
    openDialog()
    expect(
      screen.getByText(/لم يُهيأ مسؤول لهذه المنطقة ولا لأي منطقة ضمن قاطعها بعد/),
    ).toBeInTheDocument()
    expect(screen.getByTestId('confirm-departure')).toBeDisabled()
  })
})

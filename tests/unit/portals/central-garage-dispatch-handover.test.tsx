import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  departures: [] as Record<string, unknown>[],
  days: [
    {
      tripDay: '2026-09-09',
      totalCount: 3,
      openCount: 1,
      firstDepartureAt: 'a',
      lastActivityAt: 'b',
    },
  ],
  depart: vi.fn(),
  returned: vi.fn(),
}))
vi.mock('@features/central-garage/hooks', () => ({
  useGarageAreas: () => ({ data: [{ id: 1, name: 'أرخيته', parentSector: 'karrada' }] }),
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
          sectorId: 1,
          areaName: 'أرخيته',
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
  useGarageDepartures: () => ({ data: h.departures, isLoading: false }),
  useGarageDepartureDays: () => ({ data: h.days }),
  useGarageDeparturesForDay: () => ({ data: h.departures, isLoading: false }),
  useRecordGarageDeparture: () => ({ mutate: h.depart, isPending: false }),
  useRecordGarageReturn: () => ({ mutate: h.returned, isPending: false }),
  useGarageDispatchRecipients: () => ({ data: [] }),
  useGarageShiftAssignments: () => ({
    data: [
      {
        id: 'a1',
        vehicleId: 'v1',
        shift: 'morning',
        driverName: 'علي',
        sectorId: 1,
        areaName: 'أرخيته',
        parentSector: 'karrada',
        startsAt: 'now',
        endsAt: null,
        changeReason: null,
      },
    ],
    refetch: vi.fn(),
  }),
  useGarageShiftDispatchRecipients: () => ({
    data: [{ userId: 'm1', managerName: 'مسؤول أرخيته', shift: 'morning', sectors: [1] }],
  }),
  useRecordGarageShiftDeparture: () => ({ mutate: h.depart, isPending: false }),
  useSetGarageShiftAssignment: () => ({ mutate: vi.fn() }),
}))
vi.mock('@portals/central-garage/components/AssignmentDialog', () => ({
  AssignmentDialog: () => null,
}))
import DriversDispatchPage from '@portals/central-garage/pages/DriversDispatchPage'
const departure = {
  id: 'd1',
  vehicleId: 'v1',
  driverName: 'علي',
  shift: 'morning',
  sectorId: 1,
  departedAt: '2026-09-09T06:00:00Z',
  arrivedAt: '2026-09-09T06:30:00Z',
  siteDepartedAt: '2026-09-09T14:00:00Z',
  returnedAt: null,
  recipientManagerId: 'm1',
  recipientManagerName: 'مسؤول',
  arrivalNotes: null,
  siteDepartureNotes: null,
  notes: null,
  vehicleName: 'كابسة',
  dbNumber: 'DB-1',
  imagePath: 'x',
  imageUrl: 'x',
  areaName: 'أرخيته',
  parentSector: 'karrada',
}
describe('تسليم الانطلاقية من الكراج', () => {
  beforeEach(() => {
    h.departures = []
    h.depart.mockReset()
    h.returned.mockReset()
  })
  it('يسند مسؤول المنطقة تلقائياً دون اختيار يدوي', () => {
    render(<DriversDispatchPage />)
    expect(screen.getByTestId('garage-trip-day-2026-09-09')).toHaveTextContent('3 انطلاقة')
    fireEvent.click(screen.getByTestId('depart-v1'))
    expect(screen.queryByTestId('departure-recipient')).not.toBeInTheDocument()
    expect(screen.getByText(/المسؤول المستلم تلقائياً: مسؤول أرخيته/)).toBeInTheDocument()
    expect(screen.getByTestId('confirm-departure')).toBeEnabled()
    fireEvent.click(screen.getByTestId('confirm-departure'))
    expect(h.depart).toHaveBeenCalledWith(
      { vehicleId: 'v1', shift: 'morning', notes: undefined },
      expect.any(Object),
    )
  })
  it('لا يظهر تأكيد الكراج حتى يرسل مسؤول القسم الآلية عائدة', () => {
    h.departures = [{ ...departure, siteDepartedAt: null }]
    const { rerender } = render(<DriversDispatchPage />)
    expect(screen.queryByTestId('return-v1')).not.toBeInTheDocument()
    h.departures = [departure]
    rerender(<DriversDispatchPage />)
    fireEvent.click(screen.getByTestId('return-v1'))
    expect(h.returned).toHaveBeenCalledWith({ departureId: 'd1' })
  })
})

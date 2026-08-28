/** وحدة GPS: الشاحنات + المواقع الحية + إضافة مزود */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockCreateVehicle = vi.fn()
const mockCreateProvider = vi.fn()
const mockVehicles = vi.fn()
const mockPositions = vi.fn()

vi.mock('@features/branches', () => ({
  useBranches: () => ({ data: [], isLoading: false }),
}))

vi.mock('@features/integrations', () => ({
  useVehicles: () => mockVehicles(),
  useCreateVehicle: () => ({ mutate: mockCreateVehicle, mutateAsync: mockCreateVehicle, isPending: false }),
  useProviders: () => mockPositions.mockName('providers') && { data: [], isLoading: false },
  useLatestPositions: () => mockPositions(),
  useCreateProvider: () => ({ mutate: mockCreateProvider, isPending: false }),
  useIntegrationLogs: () => ({ data: [], isLoading: false }),
}))

import GpsPage from '@portals/it/pages/Integrations/GpsPage'

const VEHICLES = [
  { id: 'v1', plate: 'بغداد-1234', name: 'شاحنة النظافة', branch_id: null,
    gps_provider_id: null, device_unique_id: 'TRK-0001', is_active: true },
]
const POSITIONS = [
  { id: 1, vehicle_id: 'v1', latitude: 33.31, longitude: 44.36, speed_kmh: 65.5,
    heading: 180, ignition: true, fix_time: new Date().toISOString() },
]

describe('GpsPage — تتبع الشاحنات', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVehicles.mockReturnValue({ data: VEHICLES, isLoading: false })
    mockPositions.mockReturnValue({ data: POSITIONS, isLoading: false })
  })

  it('يعرض الشاحنات مع السرعة الحية', () => {
    render(<GpsPage />)
    const table = screen.getByTestId('vehicles-table')
    expect(table).toHaveTextContent('شاحنة النظافة')
    expect(table).toHaveTextContent('بغداد-1234')
    expect(table).toHaveTextContent('TRK-0001')
    expect(table).toHaveTextContent('66 كم/س')
  })

  it('يعرض الإحداثيات', () => {
    render(<GpsPage />)
    expect(screen.getByTestId('vehicles-table')).toHaveTextContent('33.310, 44.360')
  })

  it('تسجيل شاحنة جديدة يرسل الحمولة', async () => {
    const user = userEvent.setup()
    render(<GpsPage />)
    await user.click(screen.getByTestId('toggle-vehicle-form'))
    await user.type(screen.getByTestId('vehicle-plate'), 'بغداد-7777')
    await user.type(screen.getByTestId('vehicle-name'), 'شاحنة جديدة')
    await user.type(screen.getByTestId('vehicle-device'), 'TRK-9999')
    await user.click(screen.getByTestId('vehicle-submit'))
    expect(mockCreateVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ plate: 'بغداد-7777', device_unique_id: 'TRK-9999' }),
    )
  })

  it('إضافة مزود Traccar', async () => {
    const user = userEvent.setup()
    render(<GpsPage />)
    await user.click(screen.getByRole('button', { name: /مزود جديد/ }))
    await user.type(screen.getByTestId('provider-name'), 'مزود بغداد')
    await user.click(screen.getByTestId('provider-form').querySelector('button[type=submit]') as HTMLElement)
    expect(mockCreateProvider).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'مزود بغداد', type: 'traccar' }),
    )
  })
})

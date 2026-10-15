/** 00260 — بوابة المتابعة: متابعة الحاويات (تحديث الموقع إلى GPS الحالي كطلب معلّق) */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockRequest = vi.fn()
const CONTAINERS = [
  { id: 'c1', code: 'GBS-001', label: 'قرب المدرسة', latitude: 33.31, longitude: 44.41, status: 'ok', imagePath: null, notes: null, updatedAt: '2026-10-15T00:00:00Z', pendingCount: 0, sectorId: 1, areaName: 'أرخيته', parentSector: 'karrada' },
  { id: 'c2', code: 'GBS-002', label: 'الساحة', latitude: 33.32, longitude: 44.42, status: 'damaged', imagePath: null, notes: null, updatedAt: '2026-10-15T00:00:00Z', pendingCount: 1, sectorId: 1, areaName: 'أرخيته', parentSector: 'karrada' },
]
const MY_UPDATES = [
  { id: 'u1', containerId: 'c2', code: 'GBS-002', label: 'الساحة', proposedStatus: 'damaged', photoPath: null, note: null, state: 'pending', createdAt: '2026-10-15T05:00:00Z', reviewedAt: null, reviewNote: null, kind: 'location', proposedLatitude: 33.3205, proposedLongitude: 44.4205, accuracyM: 6 },
]
vi.mock('@features/gbs/GbsMap', () => ({ default: ({ containers }: { containers: unknown[] }) => <div data-testid="gbs-map">map:{containers.length}</div> }))
vi.mock('@features/gbs/hooks', () => ({
  useGbsContainers: () => ({ data: CONTAINERS, isLoading: false }),
  useGbsZones: () => ({ data: [] }),
  useGbsMyUpdates: () => ({ data: MY_UPDATES }),
  useGbsRequestLocation: () => ({ mutate: mockRequest, isPending: false }),
}))
import FollowUpContainersPage from '@portals/follow-up/pages/FollowUpContainersPage'
import { distanceMeters } from '@features/gbs/geo'

beforeEach(() => {
  mockRequest.mockReset()
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 33.3101, longitude: 44.4101, accuracy: 8 } }) },
  })
})

describe('FollowUpContainersPage (00260)', () => {
  it('distanceMeters: نقطتان متطابقتان = 0 ومسافة معقولة لفرق صغير', () => {
    expect(distanceMeters(33.31, 44.41, 33.31, 44.41)).toBe(0)
    const d = distanceMeters(33.31, 44.41, 33.3101, 44.4101)
    expect(d).toBeGreaterThan(10); expect(d).toBeLessThan(20)
  })
  it('يعرض حاويات النطاق مع موقعي الحالي، ويرسل طلب تحديث الموقع بإحداثيات GPS كطلب معلّق', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><FollowUpContainersPage /></MemoryRouter>)
    expect(screen.getByTestId('fu-gbs-count')).toHaveTextContent('2 حاوية')
    await waitFor(() => expect(screen.getByTestId('fu-geo-status')).toHaveTextContent('33.310100'))
    // الحاوية ذات الطلب المعلّق لا تقبل طلباً آخر
    expect(screen.getByTestId('fu-gbs-pending-c2')).toBeInTheDocument()
    expect(screen.getByTestId('fu-gbs-move-btn-c2')).toBeDisabled()
    await user.click(screen.getByTestId('fu-gbs-move-btn-c1'))
    const dlg = screen.getByTestId('fu-move-dialog')
    expect(within(dlg).getByTestId('fu-move-new')).toHaveTextContent('33.310100, 44.410100')
    expect(within(dlg).getByTestId('fu-move-distance')).toHaveTextContent('م')
    await user.type(within(dlg).getByTestId('fu-move-note'), 'نُقلت إلى الزاوية')
    await user.click(within(dlg).getByTestId('fu-move-send'))
    expect(mockRequest).toHaveBeenCalledWith(
      { containerId: 'c1', latitude: 33.3101, longitude: 44.4101, accuracy: 8, note: 'نُقلت إلى الزاوية' },
      expect.anything(),
    )
    // سجل طلباتي يُظهر طلب الموقع المعلّق
    expect(within(screen.getByTestId('fu-my-updates')).getByTestId('fu-my-update-u1')).toHaveTextContent('موقع جديد')
  })
})

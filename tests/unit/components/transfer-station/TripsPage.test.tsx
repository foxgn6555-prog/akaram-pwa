/** وحدة النسافات الخارجة — النموذج + الفولدر الشهري */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockList = vi.fn()
const mockCreate = vi.fn().mockResolvedValue({ id: 't1' })
const mockSend = vi.fn().mockResolvedValue(3)

vi.mock('@features/transfer-station', () => ({
  useTripsList: () => ({ data: mockList(), isLoading: false }),
  useCreateTrips: () => ({ mutate: mockCreate, isPending: false }),
  useSendTripsFolder: () => ({ mutate: mockSend, isPending: false }),
}))

import TripsPage from '@portals/transfer-station/pages/Trips/TripsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <TripsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockReturnValue([])
})

describe('TripsPage', () => {
  it('يعرض النموذج والجدول وشريط الفولدر', () => {
    renderPage()
    expect(screen.getByTestId('trips-page')).toBeInTheDocument()
    expect(screen.getByTestId('trips-form')).toBeInTheDocument()
    expect(screen.getByTestId('folder-trips-send')).toBeInTheDocument()
    expect(screen.getByText('النسافات الخارجة')).toBeInTheDocument()
  })

  it('يحفظ النسافة بالاسم ونوع الآلية', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-trips-name'), 'سائق نسافة')
    await user.type(screen.getByTestId('f-trips-vehicle'), 'شاحنة')
    await user.click(screen.getByTestId('trips-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ driver_name: 'سائق نسافة', vehicle_type: 'شاحنة' }),
    )
  })

  it('زر الفولدر معطل عند عدم وجود مسودات', async () => {
    renderPage()
    expect(screen.getByTestId('folder-trips-send')).toBeDisabled()
  })
})
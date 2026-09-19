/** وحدة النسافات الخارجة — النموذج + التنقل الشهري (النمط الجديد: بلا إرسال مباشر) */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockList = vi.fn()
const mockCreate = vi.fn().mockResolvedValue({ id: 't1' })

vi.mock('@features/transfer-station', () => ({
  useTripsList: () => ({ data: mockList(), isLoading: false }),
  useCreateTrips: () => ({ mutate: mockCreate, isPending: false }),
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
  it('يعرض النموذج والجدول وشريط الشهر بالنمط الجديد', () => {
    renderPage()
    expect(screen.getByTestId('trips-page')).toBeInTheDocument()
    expect(screen.getByTestId('trips-form')).toBeInTheDocument()
    expect(screen.getByTestId('trips-month')).toBeInTheDocument()
    expect(screen.getByText('تصل غرفة العمليات تلقائياً ضمن التقرير اليومي ومنها إلى المعاون')).toBeInTheDocument()
    expect(screen.getByText('النسافات الخارجة')).toBeInTheDocument()
  })

  it('يحفظ النسافة بالاسم ونوع الآلية', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-trips-name'), 'سائق نسافة')
    await user.type(screen.getByTestId('f-trips-vehicle'), 'شاحنة')
    await user.clear(screen.getByTestId('f-trips-weight'))
    await user.type(screen.getByTestId('f-trips-weight'), '6')
    await user.click(screen.getByTestId('trips-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ weight_tons: 6, driver_name: 'سائق نسافة', vehicle_type: 'شاحنة' }),
    )
  })

  it('لا يوفر إرسال فولدر مباشر للمعاون', () => {
    renderPage()
    expect(screen.queryByTestId('folder-trips-send')).not.toBeInTheDocument()
  })
})
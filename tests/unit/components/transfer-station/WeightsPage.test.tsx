/**
 * وحدة الأوزان — المحطة التحويلية:
 *  · النموذج يتحقق من الحقول المطلوبة
 *  · الصافي يُعرض آلياً = الكلي − الفارغ
 *  · الحفظ يستدعي create
 *  · قائمة التصدير تظهر الخيارات الثلاثة
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockCreate = vi.fn().mockResolvedValue({ id: 'w1' })
const mockSendOps = vi.fn().mockResolvedValue(3)
const mockList = vi.fn()
vi.mock('@features/transfer-station', () => ({
  useWeightList: () => ({ data: mockList(), isLoading: false }),
  useCreateWeight: () => ({ mutate: mockCreate, isPending: false }),
  useSendToOps: () => ({ mutate: mockSendOps, isPending: false }),
}))
vi.mock('@features/transfer-station/lib/export', () => ({
  toExcel: vi.fn().mockResolvedValue(undefined),
  printPdf: vi.fn(),
  netOf: (r: { net_weight?: number | null }) => r.net_weight ?? null,
  sheetTitle: () => 'دفتر',
}))

import WeightsPage from '@portals/transfer-station/pages/Weights/WeightsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <WeightsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockReturnValue([])
})

describe('WeightsPage — النموذج', () => {
  it('يعرض حقول الإدخال وزر الحفظ', () => {
    renderPage()
    expect(screen.getByTestId('f-db')).toBeInTheDocument()
    expect(screen.getByTestId('f-driver')).toBeInTheDocument()
    expect(screen.getByTestId('weight-submit')).toBeInTheDocument()
  })

  it('يحسب الصافي آلياً = الكلي − الفارغ', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-gross'), '25')
    await user.type(screen.getByTestId('f-tare'), '10')
    // الصافي يظهر في الحقل المحسوب
    await waitFor(() => {
      expect(screen.getByText('15.00')).toBeInTheDocument()
    })
  })

  it('يرفض الحفظ دون الحقول المطلوبة ويظهر خطأ', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('weight-submit'))
    expect(mockCreate).not.toHaveBeenCalled()
    // رسالة خطأ الحقل المطلوب
    expect(screen.getByText('رقم الآلية (DB) مطلوب')).toBeInTheDocument()
    expect(screen.getByText('اسم السائق مطلوب (حرفان فأكثر)')).toBeInTheDocument()
  })

  it('يحفظ السجل عند اكتمال الحقول', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-db'), '88120')
    await user.type(screen.getByTestId('f-driver'), 'علي سائق')
    await user.click(screen.getByTestId('weight-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ db_number: '88120', driver_name: 'علي سائق' }),
      expect.anything(),
    )
  })
})

describe('WeightsPage — التصدير', () => {
  it('يفتح قائمة الخيارات الثلاثة', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('export-menu-btn'))
    expect(screen.getByTestId('export-excel')).toHaveTextContent('Excel')
    expect(screen.getByTestId('export-pdf')).toHaveTextContent('PDF')
    expect(screen.getByTestId('export-ops')).toHaveTextContent('غرفة العمليات')
  })

  it('إرسال إلى غرفة العمليات يستدعي sendToOps', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('export-menu-btn'))
    await user.click(screen.getByTestId('export-ops'))
    await waitFor(() => expect(mockSendOps).toHaveBeenCalledTimes(1))
  })
})

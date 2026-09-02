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
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockSendOps = vi.fn().mockResolvedValue(3)
const mockList = vi.fn()
vi.mock('@features/transfer-station', () => ({
  useWeightList: () => ({ data: mockList(), isLoading: false }),
  useCreateWeight: () => ({ mutate: mockCreate, isPending: false }),
  useUpdateWeight: () => ({ mutate: mockUpdate, isPending: false }),
  useSendToOps: () => ({ mutate: mockSendOps, isPending: false }),
}))
vi.mock('@features/transfer-station/lib/export', () => ({
  toExcel: vi.fn().mockResolvedValue(undefined),
  printPdf: vi.fn(),
  netOf: (r: { net_weight?: number | null }) => r.net_weight ?? null,
  sheetTitle: () => 'دفتر',
}))

import WeightsPage from '@portals/transfer-station/pages/Weights/WeightsPage'
import type { WeightRecord } from '@features/transfer-station/types'

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

describe('WeightsPage — التعديل', () => {
  const W: WeightRecord = {
    id: 'w1', seq: 1, db_number: '12345', driver_name: 'علي سائق', vehicle_type: 'حاوية',
    gross_weight: 25, tare_weight: 10, net_weight: 15, entry_time: '08:30',
    log_date: '2026-08-31', shift: 'morning', status: 'draft',
    submitted_to_ops_at: null, archived_at: null, archived_by: null,
    archive_reason: null, created_by: null, created_at: null,
  }

  it('زر تعديل يظهر للمسودات فقط ويملأ النموذج ببيانات السجل', async () => {
    mockList.mockReturnValue([W, { ...W, id: 'w2', status: 'submitted_to_ops' }])
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByTestId('edit-w1')).toBeInTheDocument()
    expect(screen.queryByTestId('edit-w2')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('edit-w1'))
    expect((screen.getByTestId('f-db') as HTMLInputElement).value).toBe('12345')
    expect((screen.getByTestId('f-driver') as HTMLInputElement).value).toBe('علي سائق')
    expect(screen.getByText('تعديل سجل قائم')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-edit')).toBeInTheDocument()
  })

  it('حفظ التعديلات يستدعي update بالمعرّف الصحيح ولا يستدعي create', async () => {
    mockList.mockReturnValue([W])
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('edit-w1'))
    await user.type(screen.getByTestId('f-driver'), ' المعدّل')
    await user.click(screen.getByTestId('weight-submit'))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate).toHaveBeenCalledWith(
      { id: 'w1', input: expect.objectContaining({ driver_name: 'علي سائق المعدّل' }) },
      expect.anything(),
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('إلغاء التعديل يعيد النموذج لإدخال سجل جديد', async () => {
    mockList.mockReturnValue([W])
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('edit-w1'))
    await user.click(screen.getByTestId('cancel-edit'))

    expect((screen.getByTestId('f-db') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('إدخال سجل جديد')).toBeInTheDocument()
    expect(screen.queryByTestId('cancel-edit')).not.toBeInTheDocument()
  })
})

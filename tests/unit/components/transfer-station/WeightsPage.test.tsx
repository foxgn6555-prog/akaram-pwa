/** سجل الأوزان بعد 00130: بلا إدخال يدوي — عرض وتدقيق وتصدير فقط */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { WeightRecord } from '@features/transfer-station/types'

const mockList = vi.fn()
const mockSendOps = vi.fn()
vi.mock('@features/transfer-station', () => ({
  useWeightList: () => ({ data: mockList(), isLoading: false }),
  useSendToOps: () => ({ mutate: mockSendOps, isPending: false }),
}))
vi.mock('@features/transfer-station/lib/export', () => ({
  toExcel: vi.fn().mockResolvedValue(undefined),
  printPdf: vi.fn(),
  netOf: (r: { net_weight: number | null }) => r.net_weight,
  sheetTitle: () => 'دفترทดสอบ',
}))

import WeightsPage from '@portals/transfer-station/pages/Weights/WeightsPage'

const REC: WeightRecord = {
  id: 'w1', seq: null, db_number: 'DB-77', driver_name: 'سائق الدفتر', vehicle_type: 'كابسة وسط → المكبس',
  gross_weight: 5, tare_weight: null, net_weight: 5, entry_time: '09:07:00', log_date: '2026-09-10',
  shift: 'morning', status: 'draft', submitted_to_ops_at: null, archived_at: null, archived_by: null,
  archive_reason: null, created_by: null, created_at: null,
}

beforeEach(() => { vi.clearAllMocks(); mockList.mockReturnValue([REC]) })

describe('WeightsPage — دفتر تلقائي من سير العمل', () => {
  it('لا يعرض نموذج إدخال يدوي ولا أزرار تعديل', () => {
    render(<MemoryRouter><WeightsPage /></MemoryRouter>)
    expect(screen.getByTestId('weights-page')).toBeInTheDocument()
    expect(screen.queryByTestId('weight-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('f-db')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-w1')).not.toBeInTheDocument()
    expect(screen.getByText(/بلا إدخال يدوي|يغذيه سير العمل/)).toBeInTheDocument()
  })

  it('يعرض سجلات الدفتر القادمة من سير العمل', () => {
    render(<MemoryRouter><WeightsPage /></MemoryRouter>)
    expect(screen.getByTestId('weights-table')).toBeInTheDocument()
    expect(screen.getByText('DB-77')).toBeInTheDocument()
    expect(screen.getByText('كابسة وسط → المكبس')).toBeInTheDocument()
  })

  it('يبقي تصدير Excel/PDF والإرسال لغرفة العمليات', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><WeightsPage /></MemoryRouter>)
    await user.click(screen.getByTestId('export-menu-btn'))
    expect(screen.getByTestId('export-excel')).toBeInTheDocument()
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument()
    await user.click(screen.getByTestId('export-ops'))
    expect(mockSendOps).toHaveBeenCalledTimes(1)
  })
})

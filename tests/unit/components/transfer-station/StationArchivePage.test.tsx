/**
 * أرشيف المحطة التحويلية:
 *  · زر الحذف يفتح ورقة التأكيد
 *  · التأكيد يطلب سبباً (يرفض سبباً قصيراً)
 *  · التأكيد مع سبب صحيح يستدعي archive ويعرض تحذير IT
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockArchive = vi.fn().mockResolvedValue(undefined)
const mockActive = vi.fn()
const mockArchived = vi.fn()

vi.mock('@features/transfer-station', () => ({
  useWeightList: () => ({ data: mockActive(), isLoading: false }),
  useArchivedWeights: () => ({ data: mockArchived(), isLoading: false }),
  useArchiveWeight: () => ({ mutate: mockArchive, isPending: false }),
}))
vi.mock('@features/transfer-station/lib/export', () => ({
  netOf: (r: { net_weight?: number | null }) => r.net_weight ?? null,
}))

import StationArchivePage from '@portals/transfer-station/pages/Archive/StationArchivePage'

const RECORD = {
  id: 'rec-1', db_number: '88120', driver_name: 'علي سائق', vehicle_type: null,
  gross_weight: 25, tare_weight: 10, net_weight: 15, entry_time: '08:30',
  log_date: '2026-08-31', shift: 'morning', status: 'draft',
  submitted_to_ops_at: null, archived_at: null, archived_by: null, archive_reason: null,
  created_by: null, created_at: null, seq: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockActive.mockReturnValue([RECORD])
  mockArchived.mockReturnValue([])
})

describe('StationArchivePage — حذف/أرشفة', () => {
  it('يفتح ورقة التأكيد ويحذّر من تنبيه IT', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StationArchivePage />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('delete-rec-1'))
    expect(await screen.findByTestId('archive-confirm')).toBeInTheDocument()
    // تحذير النقل لأرشيف IT
    expect(screen.getByText(/الأرشيف المركزي لبوابة التطوير المركزية/)).toBeInTheDocument()
  })

  it('يرفض التأكيد دون سبب كافٍ', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StationArchivePage />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('delete-rec-1'))
    await screen.findByTestId('archive-confirm')
    await user.type(screen.getByTestId('archive-reason'), 'x')
    await user.click(screen.getByTestId('archive-confirm-btn'))
    expect(mockArchive).not.toHaveBeenCalled()
  })

  it('يؤرشف مع سبب صحيح', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StationArchivePage />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('delete-rec-1'))
    await screen.findByTestId('archive-confirm')
    await user.type(screen.getByTestId('archive-reason'), 'خطأ في إدخال الوزن')
    await user.click(screen.getByTestId('archive-confirm-btn'))
    await waitFor(() =>
      expect(mockArchive).toHaveBeenCalledWith(
        { id: 'rec-1', reason: 'خطأ في إدخال الوزن' },
        expect.anything(),
      ),
    )
  })
})

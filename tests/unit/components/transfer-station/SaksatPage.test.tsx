/** وحدة السكسات الخارجة — النموذج (اسم السائق/نوع الآلية/وقت تلقائي) + الفولدر الشهري */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { SaksatRecord } from '@features/transfer-station/types'

const mockList = vi.fn()
const mockCreate = vi.fn().mockResolvedValue({ id: 's1' })
const mockSend = vi.fn().mockResolvedValue(2)

vi.mock('@features/transfer-station', () => ({
  useSaksatList: () => ({ data: mockList(), isLoading: false }),
  useCreateSaksat: () => ({ mutate: mockCreate, isPending: false }),
  useSendSaksatFolder: () => ({ mutate: mockSend, isPending: false }),
}))

import SaksatPage from '@portals/transfer-station/pages/Saksat/SaksatPage'

const REC: SaksatRecord = {
  id: 's1', driver_name: 'سائق سكسة', vehicle_type: 'قلاب', exit_time: '2026-09-01T08:05:00Z',
  log_date: '2026-09-01', status: 'draft', submitted_at: null, archived_at: null,
  archive_reason: null, created_at: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SaksatPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockReturnValue([REC])
})

describe('SaksatPage', () => {
  it('يعرض النموذج والجدول وشريط الفولدر', () => {
    renderPage()
    expect(screen.getByTestId('saksat-page')).toBeInTheDocument()
    expect(screen.getByTestId('saksat-form')).toBeInTheDocument()
    expect(screen.getByTestId('saksat-table')).toBeInTheDocument()
    expect(screen.getByTestId('folder-saksat-month')).toBeInTheDocument()
    expect(screen.getByTestId('folder-saksat-send')).toBeInTheDocument()
    expect(screen.getByText('سائق سكسة')).toBeInTheDocument()
  })

  it('يرفض الحفظ دون اسم السائق', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('saksat-submit'))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText('اسم السائق مطلوب (حرفان فأكثر)')).toBeInTheDocument()
  })

  it('يحفظ السجل بالاسم ونوع الآلية ووقت الخروج التلقائي', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-saksat-name'), 'سائق جديد')
    await user.type(screen.getByTestId('f-saksat-vehicle'), 'قلاب')
    await user.click(screen.getByTestId('saksat-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ driver_name: 'سائق جديد', vehicle_type: 'قلاب', log_date: expect.any(String) }),
    )
  })

  it('إرسال الفولدر يستدعي إرسال الشهر لمعاون المدير', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('folder-saksat-send'))
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1))
    expect(mockSend.mock.calls[0]?.[0]).toMatch(/^\d{4}-\d{2}$/)
  })
})
/** وحدة السكسات الخارجة — النموذج (اسم السائق/نوع الآلية/وقت تلقائي) + التنقل الشهري (النمط الجديد: بلا إرسال مباشر) */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { SaksatRecord } from '@features/transfer-station/types'

const mockList = vi.fn()
const mockCreate = vi.fn().mockResolvedValue({ id: 's1' })

vi.mock('@features/transfer-station', () => ({
  useSaksatList: () => ({ data: mockList(), isLoading: false }),
  useCreateSaksat: () => ({ mutate: mockCreate, isPending: false }),
}))

import SaksatPage from '@portals/transfer-station/pages/Saksat/SaksatPage'

const REC: SaksatRecord = {
  id: 's1', driver_name: 'سائق سكسة', vehicle_type: 'قلاب', weight_tons: 8, exit_time: '2026-09-01T08:05:00Z',
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
  it('يعرض النموذج والجدول وشريط الشهر بالنمط الجديد', () => {
    renderPage()
    expect(screen.getByTestId('saksat-page')).toBeInTheDocument()
    expect(screen.getByTestId('saksat-form')).toBeInTheDocument()
    expect(screen.getByTestId('saksat-table')).toBeInTheDocument()
    expect(screen.getByTestId('saksat-month')).toBeInTheDocument()
    expect(screen.getByText('تصل غرفة العمليات تلقائياً ضمن التقرير اليومي ومنها إلى المعاون')).toBeInTheDocument()
    expect(screen.queryByTestId('folder-saksat-send')).not.toBeInTheDocument()
    expect(screen.getByText('سائق سكسة')).toBeInTheDocument()
  })

  it('يرفض الحفظ دون اسم السائق', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('saksat-submit'))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText('اسم السائق مطلوب (حرفان فأكثر)')).toBeInTheDocument()
  })

  it('يرفض الحفظ دون الوزن', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-saksat-name'), 'سائق جديد')
    await user.clear(screen.getByTestId('f-saksat-weight')) // الحمولة القياسية افتراض — تُمسح لاختبار التحقق
    await user.click(screen.getByTestId('saksat-submit'))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText('الوزن مطلوب بالطن (أكبر من صفر)')).toBeInTheDocument()
  })

  it('يحفظ السجل بالاسم ونوع الآلية والوزن ووقت الخروج التلقائي', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-saksat-name'), 'سائق جديد')
    await user.type(screen.getByTestId('f-saksat-vehicle'), 'قلاب')
    await user.clear(screen.getByTestId('f-saksat-weight'))
    await user.type(screen.getByTestId('f-saksat-weight'), '7.5')
    await user.click(screen.getByTestId('saksat-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ driver_name: 'سائق جديد', vehicle_type: 'قلاب', weight_tons: 7.5, log_date: expect.any(String) }),
    )
  })

  it('يعرض عمود الوزن في الجدول', () => {
    renderPage()
    expect(within(screen.getByTestId('saksat-table')).getByText('الوزن (طن)')).toBeInTheDocument()
    expect(within(screen.getByTestId('saksat-table')).getByText('8')).toBeInTheDocument()
  })

})
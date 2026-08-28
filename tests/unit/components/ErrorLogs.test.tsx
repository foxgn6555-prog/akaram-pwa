/** وحدة قاعدة البيانات — سجل الأخطاء: عرض + حلّ + مرشحات */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockResolve = vi.fn()
const mockUseErrorLogs = vi.fn()

vi.mock('@features/system', () => ({
  useErrorLogs: (filters?: unknown) => mockUseErrorLogs(filters),
  useResolveError: () => ({ mutate: mockResolve, isPending: false }),
}))

import ErrorLogs from '@portals/it/pages/Database/ErrorLogs'

const ERRORS = [
  {
    id: 1, error_type: 'runtime', message: 'Cannot read properties of undefined',
    stack: null, url: 'http://x/employee', user_agent: null, user_id: null,
    context: {}, resolved: false, created_at: '2026-08-26T10:00:00Z',
  },
  {
    id: 2, error_type: 'network', message: 'Failed to fetch /rest/v1/requests',
    stack: null, url: null, user_agent: null, user_id: null,
    context: {}, resolved: true, created_at: '2026-08-25T09:00:00Z',
  },
] as never

function renderPage() {
  return render(
    <MemoryRouter>
      <ErrorLogs />
    </MemoryRouter>,
  )
}

describe('ErrorLogs — وحدة قاعدة البيانات', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseErrorLogs.mockReturnValue({ data: ERRORS, isLoading: false })
  })

  it('يعرض الأخطاء مع شارات الأنواع', () => {
    renderPage()
    const list = screen.getByTestId('errors-list')
    expect(list).toHaveTextContent('Cannot read properties')
    expect(list).toHaveTextContent('تشغيلي')
    expect(list).toHaveTextContent('شبكة')
  })

  it('يعرض عداد غير المحلولة', () => {
    renderPage()
    expect(screen.getByText('1 خطأ غير محلول')).toBeInTheDocument()
  })

  it('زر الحل يستدعي الطفرة بقلب الحالة', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('resolve-1'))
    expect(mockResolve).toHaveBeenCalledWith({ id: 1, resolved: true })
  })

  it('خطأ محلول يعرض زر إعادة فتح', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('resolve-2'))
    expect(mockResolve).toHaveBeenCalledWith({ id: 2, resolved: false })
  })

  it('التوسيع: النقر على الصف يعرض التفاصيل التقنية', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.queryByTestId('detail-1')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('expand-1'))
    expect(screen.getByTestId('detail-1')).toBeInTheDocument()
  })

  it('المرشح الافتراضي: غير المحلولة', () => {
    renderPage()
    expect(mockUseErrorLogs).toHaveBeenCalledWith(expect.objectContaining({ resolved: false }))
  })

  it('حالة الفراغ المبهجة عند صفر أخطاء', () => {
    mockUseErrorLogs.mockReturnValue({ data: [], isLoading: false })
    renderPage()
    expect(screen.getByText(/لا أخطاء/)).toBeInTheDocument()
  })
})

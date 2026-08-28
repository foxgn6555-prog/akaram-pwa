/** صفحة تفاصيل الجدول: الأعمدة والأنواع والقياسات */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ tableName: 'employees' }),
  }
})

vi.mock('@features/system', () => ({
  useTableDetails: (name?: string) => ({
    data: name === 'employees'
      ? {
          table: 'employees',
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'full_name', type: 'text', nullable: false },
            { name: 'phone', type: 'text', nullable: true },
          ],
          row_estimate: 42,
          total_bytes: 90112,
        }
      : undefined,
    isLoading: false,
    isError: false,
  }),
}))

import TableDetailPage from '@portals/it/pages/Database/TableDetailPage'

describe('TableDetailPage — تفاصيل الجدول', () => {
  beforeEach(() => vi.clearAllMocks())

  it('يعرض اسم الجدول والقياسات', () => {
    const { container } = render(
      <MemoryRouter>
        <TableDetailPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('employees')).toBeInTheDocument()
    expect(container).toHaveTextContent('≈ 42')
    expect(container).toHaveTextContent('88.0 ك.ب')
  })

  it('يعرض الأعمدة والأنواع والإلزامية', () => {
    render(
      <MemoryRouter>
        <TableDetailPage />
      </MemoryRouter>,
    )
    const table = screen.getByTestId('columns-table')
    expect(table).toHaveTextContent('full_name')
    expect(table).toHaveTextContent('uuid')
    expect(table).toHaveTextContent('إلزامي')
    expect(table).toHaveTextContent('نعم')
  })

  it('زر العودة يوجّه لوحدة قاعدة البيانات', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TableDetailPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('عودة للقاعدة'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/database')
  })
})

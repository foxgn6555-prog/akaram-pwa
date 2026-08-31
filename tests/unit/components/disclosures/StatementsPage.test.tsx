/**
 * قائمة الكشوفات:
 *  · تعرض الكشوفات وحالتها
 *  · أرشفة كشف تطلب سبباً وتحذّر من IT
 *  · زر رفع للمعاون يستدعي submit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockList = vi.fn()
const mockArchive = vi.fn().mockResolvedValue(undefined)
const mockSubmit = vi.fn().mockResolvedValue(undefined)

vi.mock('@features/disclosures', () => ({
  useDisclosureList: () => ({ data: mockList(), isLoading: false }),
  useArchiveDisclosure: () => ({ mutate: mockArchive, isPending: false }),
  useSubmitDisclosure: () => ({ mutate: mockSubmit, isPending: false }),
}))
vi.mock('@features/disclosures/lib/export', () => ({
  toExcel: vi.fn(),
  toWord: vi.fn(),
  printDisclosure: vi.fn(),
}))

import StatementsPage from '@portals/disclosures/pages/Statements/StatementsPage'

const D = {
  id: 'd1', ref_no: null, db_number: '88120', driver_name: 'سائق مخالف',
  vehicle_type: null, contractor_name: null, sector: null, shift: 'morning' as const,
  log_date: '2026-08-31', violation_type: 'absence' as const, penalty_type: 'warning' as const,
  details: 'غياب متكرر', status: 'draft' as const, submitted_at: null, prepared_by_name: null,
  archived_at: null, archived_by: null, archive_reason: null, created_by: null, created_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockReturnValue([D])
})

describe('StatementsPage', () => {
  it('يعرض الكشف وحالته', () => {
    render(
      <MemoryRouter>
        <StatementsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('سائق مخالف')).toBeInTheDocument()
    expect(screen.getByText('مسودة')).toBeInTheDocument()
    expect(screen.getByText('غياب')).toBeInTheDocument()
  })

  it('أرشفة كشف تفتح التأكيد وتطلب سبباً', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StatementsPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('del-d1'))
    expect(await screen.findByTestId('archive-confirm')).toBeInTheDocument()
    expect(screen.getByText(/الأرشيف المركزي لبوابة التطوير المركزية/)).toBeInTheDocument()

    await user.type(screen.getByTestId('archive-reason'), 'خطأ في البيانات')
    await user.click(screen.getByTestId('archive-confirm-btn'))
    await waitFor(() =>
      expect(mockArchive).toHaveBeenCalledWith(
        { id: 'd1', reason: 'خطأ في البيانات' },
        expect.anything(),
      ),
    )
  })

  it('زر رفع للمعاون يستدعي submit', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StatementsPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('submit-d1'))
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled())
    expect(mockSubmit.mock.calls[0]?.[0]).toBe('d1')
  })
})

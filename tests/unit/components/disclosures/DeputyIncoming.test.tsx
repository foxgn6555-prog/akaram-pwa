/**
 * وارد معاون المدير المفوض: يعرض المرفوع للاعتماد فقط (submitted_to_deputy).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockList = vi.fn()
vi.mock('@features/disclosures', () => ({
  useDisclosureList: () => ({ data: mockList(), isLoading: false }),
}))
vi.mock('@features/disclosures/lib/export', () => ({
  printDisclosure: vi.fn(),
}))

import IncomingStatements from '@portals/deputy/pages/IncomingStatements'

const mk = (id: string, status: 'draft' | 'submitted_to_deputy') => ({
  id, ref_no: null, db_number: `${id}-DB`, driver_name: `سائق ${id}`,
  vehicle_type: null, contractor_name: null, sector: null, shift: 'morning' as const,
  log_date: '2026-08-31', violation_type: 'delay' as const, penalty_type: 'warning' as const,
  details: 'تفاصيل', status, submitted_at: null, prepared_by_name: null,
  archived_at: null, archived_by: null, archive_reason: null, created_by: null, created_at: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockReturnValue([mk('a', 'submitted_to_deputy'), mk('b', 'draft')])
})

describe('IncomingStatements', () => {
  it('تبويب «للاعتماد» يعرض المرفوع فقط', () => {
    render(
      <MemoryRouter>
        <IncomingStatements />
      </MemoryRouter>,
    )
    // المرفوع يظهر
    expect(screen.getByText('سائق a')).toBeInTheDocument()
    // المسودة لا تظهر في تبويب الاعتماد
    expect(screen.queryByText('سائق b')).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-incoming')).toHaveTextContent('1')
  })

  it('تبويب «الكل» يعرض الجميع', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <IncomingStatements />
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('tab-all'))
    expect(screen.getByText('سائق a')).toBeInTheDocument()
    expect(screen.getByText('سائق b')).toBeInTheDocument()
  })
})

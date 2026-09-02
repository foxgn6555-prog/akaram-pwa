/** أرشيف الكشوفات — عرض المؤرشف وسببه، وحالة الفراغ */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Disclosure } from '@features/disclosures/types'

const mockArchived = vi.fn()
vi.mock('@features/disclosures', () => ({
  useArchivedDisclosures: () => ({ data: mockArchived(), isLoading: false }),
}))

import DisclosuresArchivePage from '@portals/disclosures/pages/Archive/DisclosuresArchivePage'

const D: Disclosure = {
  id: 'a1', ref_no: 'م/1', db_number: '88120', driver_name: 'سائق مؤرشف',
  vehicle_type: null, contractor_name: null, sector: null, shift: 'morning',
  log_date: '2026-08-01', violation_type: 'delay', penalty_type: 'termination',
  details: 'تفاصيل الكشف', status: 'draft', submitted_at: null, prepared_by_name: null,
  archived_at: '2026-08-02', archived_by: null, archive_reason: 'سجل مكرر',
  created_by: null, created_at: null,
}

beforeEach(() => mockArchived.mockReset())

describe('DisclosuresArchivePage', () => {
  it('يعرض حالة الفراغ عند عدم وجود كشوفات مؤرشفة', () => {
    mockArchived.mockReturnValue([])
    render(
      <MemoryRouter>
        <DisclosuresArchivePage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('disc-archive-page')).toBeInTheDocument()
    expect(screen.getByText('لا توجد كشوفات مؤرشفة')).toBeInTheDocument()
  })

  it('يعرض جدول المؤرشف مع المخالفة والإجراء وسبب الأرشفة', () => {
    mockArchived.mockReturnValue([D])
    render(
      <MemoryRouter>
        <DisclosuresArchivePage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('archived-table')).toBeInTheDocument()
    expect(screen.getByText('سائق مؤرشف')).toBeInTheDocument()
    expect(screen.getByText('تأخير')).toBeInTheDocument()
    expect(screen.getByText('إنهاء خدمات')).toBeInTheDocument()
    expect(screen.getByText('سجل مكرر')).toBeInTheDocument()
    expect(screen.getByText('المؤرشف (1)')).toBeInTheDocument()
  })
})
/** فولدرات المحطة الواردة لمعاون المدير — تعرض الفولدرات الشهرية للسكسات والنسافات */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@features/transfer-station', () => ({
  useSaksatSubmitted: () => ({
    data: [
      { id: 's1', driver_name: 'سائق مرسل', vehicle_type: 'قلاب', exit_time: '2026-09-01T08:05:00Z', log_date: '2026-09-01', status: 'submitted_to_deputy', submitted_at: '2026-09-30', archived_at: null, archive_reason: null, created_at: null },
    ],
  }),
  useTripsSubmitted: () => ({ data: [] }),
}))

import StationFoldersPage from '@portals/deputy/pages/StationFolders/StationFoldersPage'

describe('StationFoldersPage', () => {
  it('يعرض العنوان والفولدر الوارد للسكسات', () => {
    render(
      <MemoryRouter>
        <StationFoldersPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('station-folders-page')).toBeInTheDocument()
    expect(screen.getByText('السكسات الخارجة')).toBeInTheDocument()
    expect(screen.getByText('النسافات الخارجة')).toBeInTheDocument()
    expect(screen.getByText('سائق مرسل')).toBeInTheDocument()
  })
})
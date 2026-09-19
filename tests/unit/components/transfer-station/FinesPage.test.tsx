/** صفحة مخالفات الوزن — السجل التلقائي (وزن أقل من الحد الأدنى) بلا مبالغ */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const mockList = vi.fn()
vi.mock('@features/transfer-station', () => ({
  useViolations: (day?: string) => ({ data: mockList(day), isLoading: false }),
}))

import FinesPage from '@portals/transfer-station/pages/Fines/FinesPage'

const ROW = {
  id: 'v1', driver_name: 'سائق مخالف', db_number: 'DB-9', vehicle_kind: 'kia', kind_label: 'كيا',
  weight_tons: 1.5, min_tons: 2, deficit_tons: 0.5, violated_at: '2026-09-10T09:30:00Z', visit_leg_id: 'leg1',
}

beforeEach(() => { vi.clearAllMocks(); mockList.mockReturnValue([ROW]) })

describe('FinesPage — مخالفات الوزن', () => {
  it('يعرض سجل المخالفات بأعمدة التدقيق', () => {
    render(<MemoryRouter><FinesPage /></MemoryRouter>)
    expect(screen.getByTestId('fines-page')).toBeInTheDocument()
    expect(screen.getByTestId('violations-table')).toBeInTheDocument()
    expect(screen.getByText('سائق مخالف')).toBeInTheDocument()
    expect(screen.getByText('DB-9')).toBeInTheDocument()
    expect(screen.getByText('كيا')).toBeInTheDocument()
    expect(screen.getByText('0.5')).toBeInTheDocument()
  })

  it('يعرض حالة عدم وجود مخالفات', () => {
    mockList.mockReturnValue([])
    render(<MemoryRouter><FinesPage /></MemoryRouter>)
    expect(screen.getByText('لا توجد مخالفات مسجلة')).toBeInTheDocument()
    expect(screen.queryByTestId('violations-table')).not.toBeInTheDocument()
  })

  it('لا يعرض أي مبالغ مالية — سجل تدقيق فقط', () => {
    render(<MemoryRouter><FinesPage /></MemoryRouter>)
    expect(screen.queryByText(/دينار|مبلغ/)).not.toBeInTheDocument()
  })
})

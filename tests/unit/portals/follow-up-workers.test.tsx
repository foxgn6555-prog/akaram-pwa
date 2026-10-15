/** 00259 — بوابة المتابعة: متابعة العمال */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockSet = vi.fn()
const ROWS = [
  { contractor_user_id: 'c1', contractor_name: 'متعهد أ', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning', checked_in: true, checkin_at: '2026-10-15T04:00:00Z', in_zone: true, contractor_headcount: 15, my_headcount: null, my_updated_at: null, editable: true },
  { contractor_user_id: 'c2', contractor_name: 'متعهد ب', sector_id: 5, area_name: 'السندباد', parent_sector: 'zaafaraniya', shift: 'evening', checked_in: false, checkin_at: null, in_zone: null, contractor_headcount: 12, my_headcount: 10, my_updated_at: '2026-10-15T05:00:00Z', editable: false },
]
vi.mock('@features/follow-up/hooks', () => ({
  useFollowUpContractors: () => ({ data: ROWS, isLoading: false }),
  useFollowUpSetHeadcount: () => ({ mutate: mockSet, isPending: false }),
}))
import FollowUpWorkersPage from '@portals/follow-up/pages/FollowUpWorkersPage'

describe('FollowUpWorkersPage (00259)', () => {
  it('يعرض عدد المتعهد وعددي، ويسمح بالحفظ لليوم المفتوح فقط', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><FollowUpWorkersPage /></MemoryRouter>)
    const c1 = screen.getByTestId('contractor-c1'), c2 = screen.getByTestId('contractor-c2')
    expect(within(c1).getByTestId('contractor-headcount')).toHaveTextContent('15')
    expect(within(c1).getByText('عمال: 14')).toBeInTheDocument()
    expect(within(c2).getByTestId('my-headcount')).toHaveTextContent('10')
    expect(within(c2).getByText('يختلف عن عدد المتعهد')).toBeInTheDocument()
    expect(within(c2).getByTestId('locked-note')).toBeInTheDocument()
    expect(within(c2).queryByTestId('headcount-input')).toBeNull()
    expect(screen.getByTestId('counted-summary')).toHaveTextContent('سجّلت 1 من 2')
    await user.type(within(c1).getByTestId('headcount-input'), '14')
    await user.click(within(c1).getByTestId('headcount-save'))
    expect(mockSet).toHaveBeenCalledWith({ contractorUserId: 'c1', headcount: 14 })
  })
  it('فلتر القاطع الأم يُظهر متعهدي القاطع المختار فقط', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><FollowUpWorkersPage /></MemoryRouter>)
    await user.click(within(screen.getByTestId('parent-filter')).getByText('قاطع الزعفرانية'))
    expect(screen.queryByTestId('contractor-c1')).toBeNull()
    expect(screen.getByTestId('contractor-c2')).toBeInTheDocument()
  })
})

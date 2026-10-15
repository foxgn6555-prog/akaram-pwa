/** 00261 — بوابة مسؤول القاطع: متابعة المتعهدين والعمال */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockSet = vi.fn()
const ROWS = [
  { contractor_user_id: 'c1', contractor_name: 'متعهد أ', contractor_phone: '07701', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning', department_manager_name: 'مسؤول القسم أ',
    checked_in: true, checkin_at: '2026-10-15T04:00:00Z', latitude: 33.3, longitude: 44.4, accuracy_m: 6, in_zone: true, selfie_path: 'c1/s.jpg', team_photo_path: 'c1/t.jpg',
    contractor_headcount: 16, follow_up_headcount: 15, my_headcount: null, my_updated_at: null, editable: true },
  { contractor_user_id: 'c2', contractor_name: 'متعهد ب', contractor_phone: null, sector_id: 5, area_name: 'السندباد', parent_sector: 'zaafaraniya', shift: 'evening', department_manager_name: 'مسؤول القسم ب',
    checked_in: false, checkin_at: null, latitude: null, longitude: null, accuracy_m: null, in_zone: null, selfie_path: null, team_photo_path: null,
    contractor_headcount: 12, follow_up_headcount: null, my_headcount: 10, my_updated_at: '2026-10-15T05:00:00Z', editable: false },
]
const MONTH = [
  { log_date: '2026-10-15', checked_in: true, checkin_at: '2026-10-15T04:00:00Z', in_zone: true, selfie_path: 'c1/s.jpg', team_photo_path: 'c1/t.jpg', contractor_headcount: 16, follow_up_headcount: 15, admin_ops_headcount: 14 },
  { log_date: '2026-10-14', checked_in: false, checkin_at: null, in_zone: null, selfie_path: null, team_photo_path: null, contractor_headcount: null, follow_up_headcount: null, admin_ops_headcount: null },
]
vi.mock('@features/sector-manager/hooks', () => ({
  useSectorManagerMe: () => ({ data: { parent_sectors: ['karrada', 'zaafaraniya'] } }),
  useSmContractors: () => ({ data: ROWS, isLoading: false }),
  useSmSetContractorHeadcount: () => ({ mutate: mockSet, isPending: false }),
  useSmContractorMonth: () => ({ data: MONTH, isLoading: false }),
}))
vi.mock('@features/contractors/hooks', () => ({ useContractorPhotoUrl: (p: string | null) => ({ data: p ? `https://signed/${p}` : undefined }) }))
import ContractorsFollowUpPage from '@portals/admin-ops/pages/Contractors/ContractorsFollowUpPage'

describe('ContractorsFollowUpPage (00261)', () => {
  it('يعرض تواجد المتعهد (موقع/دقة/صور) والأعداد الثلاثة ويحفظ عدد القاطع لليوم المفتوح فقط', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ContractorsFollowUpPage /></MemoryRouter>)
    const c1 = screen.getByTestId('contractor-c1'), c2 = screen.getByTestId('contractor-c2')
    expect(within(c1).getByTestId('checkin-location')).toHaveTextContent('داخل نطاق المنطقة')
    expect(within(c1).getByTestId('checkin-location')).toHaveTextContent('±6 م')
    expect(within(c1).getByTestId('map-link')).toHaveAttribute('href', 'https://www.google.com/maps?q=33.3,44.4')
    expect(within(c1).getByTestId('photo-selfie').querySelector('img')).toHaveAttribute('src', 'https://signed/c1/s.jpg')
    expect(within(c1).getByTestId('photo-team').querySelector('img')).toHaveAttribute('src', 'https://signed/c1/t.jpg')
    expect(within(c1).getByTestId('contractor-headcount')).toHaveTextContent('16')
    expect(within(c1).getByTestId('follow-up-headcount')).toHaveTextContent('15')
    expect(within(c1).getByTestId('my-headcount')).toHaveTextContent('—')
    // المتعهد ب: لم يُثبت التواجد، مقفل، عددي يختلف
    expect(within(c2).getByTestId('checkin-badge')).toHaveTextContent('لم يُثبت التواجد')
    expect(within(c2).getByTestId('locked-note')).toBeInTheDocument()
    expect(within(c2).queryByTestId('headcount-input')).toBeNull()
    expect(within(c2).getByText('يختلف عن الأعداد الأخرى')).toBeInTheDocument()
    expect(screen.getByTestId('st-counted')).toHaveTextContent('1/2')
    await user.type(within(c1).getByTestId('headcount-input'), '14')
    await user.click(within(c1).getByTestId('headcount-save'))
    expect(mockSet).toHaveBeenCalledWith({ contractorUserId: 'c1', headcount: 14 })
  })
  it('فلتر المتعهد وسجل الشهر بالأعمدة الثلاثة ومجاميعها', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><ContractorsFollowUpPage /></MemoryRouter>)
    await user.selectOptions(screen.getByTestId('contractor-filter'), 'c2')
    expect(screen.queryByTestId('contractor-c1')).toBeNull()
    expect(screen.getByTestId('contractor-c2')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('contractor-c2')).getByTestId('month-btn'))
    const drawer = screen.getByTestId('month-drawer')
    expect(within(drawer).getByTestId('day-2026-10-15')).toHaveTextContent('16')
    expect(within(drawer).getByTestId('sum-contractor')).toHaveTextContent('16')
    expect(within(drawer).getByTestId('sum-follow-up')).toHaveTextContent('15')
    expect(within(drawer).getByTestId('sum-admin-ops')).toHaveTextContent('14')
  })
})

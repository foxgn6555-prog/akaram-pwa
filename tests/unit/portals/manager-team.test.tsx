import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@features/contractors/hooks', () => ({
  useManagerTeamSummary: () => ({
    data: [
      { sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', contractor_user_id: 'e1', contractor_name: 'متعهد أرخيته', contractor_phone: '0770', today_headcount: 12, contractor_checked_in: true, contractor_checkin_at: '2026-09-29T04:00:00Z', in_zone: true, vehicles_now: 1,
        vehicles: [{ id: 'd1', db_number: 'DB-13', vehicle_name: 'هيونداي', driver_name: 'علي', shift: 'morning', arrived_at: '2026-09-29T04:30:00Z', trip_status: 'at_site' }] },
      { sector_id: 2, area_name: 'الرياض', parent_sector: 'karrada', contractor_user_id: null, contractor_name: null, contractor_phone: null, today_headcount: null, contractor_checked_in: false, contractor_checkin_at: null, in_zone: null, vehicles_now: 0, vehicles: [] },
    ],
    isLoading: false,
  }),
  useManagerContractorPhotosToday: () => ({ data: [{ contractor_user_id: 'e1', tickets_today: 2, photos_today: 9 }], isLoading: false }),
}))
import TeamPage from '@portals/manager/pages/Team/TeamPage'

describe('فريقي — مسؤول القسم (00158)', () => {
  it('يعرض لكل منطقة: المتعهد، العدد اليومي الذي سجّله (بلا قوائم عمال)، وآليات تعمل الآن؛ ولا نماذج إضافة عمال/آليات', () => {
    render(<TeamPage />)
    expect(screen.getByTestId('contractor-1')).toHaveTextContent('متعهد أرخيته')
    expect(screen.getByTestId('workers-1')).toHaveTextContent('12')
    expect(screen.getByTestId('team-area-1')).toHaveTextContent('يشمل المتعهد نفسه · عمال: 11')
    expect(screen.getByTestId('team-area-1')).toHaveTextContent('داخل نطاق المنطقة')
    expect(screen.getByTestId('vehicles-1')).toHaveTextContent('1')
    // 00257: صور المتعهد اليوم تصل مسؤول قسمه
    expect(screen.getByTestId('contractor-photos-1')).toHaveTextContent('صور اليوم: 2 تذكرة · 9 صورة')
    expect(screen.getByTestId('vehicles-list-1')).toHaveTextContent('DB-13 · هيونداي')
    expect(screen.getByTestId('vehicles-list-1')).toHaveTextContent('تعمل في الموقع')
    expect(screen.getByTestId('team-area-2')).toHaveTextContent('لا متعهد معيّن لهذه المنطقة')
    expect(screen.queryByText('إضافة عامل')).toBeNull()
    expect(screen.queryByText('إضافة آلية')).toBeNull()
    expect(screen.queryByText('عامل أول')).toBeNull()
  })
})

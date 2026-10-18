/** 00286 — وحدة «مشاركة الموقع» في رئيسية مسؤول القسم تفتح البطاقة؛ وبطاقة المتعهد في رئيسيته */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
vi.mock('@features/live-tracking/LiveShareCard', () => ({ LiveShareCard: () => <div data-testid="live-share-card">بطاقة البث</div> }))
vi.mock('@features/sector', () => ({ useSectorSummary: () => ({ data: { workers: 0, vehicles: 0, submitted_supply: 0, breakdowns: 0, photos: 0 }, isLoading: false }), useManagerProfile: () => ({ data: { shift: 'morning', sectors: [1] } }), useSectors: () => ({ data: [{ id: 1, name: 'الكرادة' }] }) }))
vi.mock('@features/sector/types', () => ({ SHIFT_LABELS: { morning: 'صباحي' } }))
vi.mock('@features/contractors/hooks', () => ({ useManagerTeamSummary: () => ({ data: [], isLoading: false }), useContractorMe: () => ({ data: { full_name: 'متعهد', area_name: 'الرياض', parent_sector: 'karrada', shift: 'morning', checked_in_today: false, month_days: 0, month_headcount_total: 0, today_headcount: null, zone_defined: true, in_zone: null, checkin_at: null }, isLoading: false }), useContractorMyMonth: () => ({ data: [] }) }))
import ManagerDashboard from '@portals/manager/pages/Dashboard/ManagerDashboard'
import ContractorDashboard from '@portals/employee/pages/Dashboard/ContractorDashboard'

describe('00286 — مشاركة الموقع في الرئيسيات', () => {
  it('مسؤول القسم: وحدة «مشاركة الموقع» موجودة أولاً وتفتح البطاقة عند النقر', () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    render(<MemoryRouter><ManagerDashboard /></MemoryRouter>)
    const tile = screen.getByTestId('mgr-unit-live-share')
    expect(tile).toHaveTextContent('مشاركة الموقع')
    expect(screen.queryByTestId('mgr-live-share')).toBeNull()
    fireEvent.click(tile)
    expect(screen.getByTestId('mgr-live-share')).toBeInTheDocument()
    expect(screen.getByTestId('live-share-card')).toBeInTheDocument()
    expect(screen.getByTestId('mgr-units').children).toHaveLength(8)
  })
  it('المتعهد: البطاقة تظهر مباشرة في الرئيسية', () => {
    render(<MemoryRouter><ContractorDashboard /></MemoryRouter>)
    expect(screen.getByTestId('contractor-dashboard')).toContainElement(screen.getByTestId('live-share-card'))
  })
})

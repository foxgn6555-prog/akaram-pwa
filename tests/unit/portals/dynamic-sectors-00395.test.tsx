/**
 * 00395 — القطاعات الديناميكية (الجزء 3): قطاع جديد «الدورة» مسجَّل من القاعدة يظهر في
 *   رئيسية الإعلام (بطاقة قاطع + فولدر بمسار ديناميكي)، تبويبات قواطع العمليات الميدانية،
 *   محرر تقرير الشكاوى، وتسميات التقارير (التحليلات/الكراج/الشكاوى).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { registerSectorsTree, resetSectorsRegistry } from '@sdk/sectors.sdk'

const tree = [
  { code: 'karrada', name: 'الكرادة', sort: 1, is_active: true, areas: [{ id: 1, code: 'S1', name: 'أرخيته', sort: 1, is_active: true }] },
  { code: 'zaafaraniya', name: 'الزعفرانية', sort: 2, is_active: true, areas: [{ id: 6, code: 'S6', name: 'الزعفرانية', sort: 1, is_active: true }] },
  { code: 'dora', name: 'الدورة', sort: 3, is_active: true, areas: [{ id: 9, code: 'S9', name: 'حي الميكانيك', sort: 1, is_active: true }] },
]

vi.mock('@features/media/hooks', () => ({
  useSubmissions: () => ({ data: [
    { id: 't1', title: 'تذكرة الدورة', mode: 'normal', work_type: null, photo_count: 3, event_date: null, created_at: new Date().toISOString(), status: 'open', sector_parent: 'dora' },
    { id: 't2', title: 'تذكرة الكرادة', mode: 'normal', work_type: null, photo_count: 1, event_date: null, created_at: new Date().toISOString(), status: 'open', sector_parent: 'karrada' },
  ], isLoading: false }),
  useDesigns: () => ({ data: [], isLoading: false }),
  useMediaTemplates: () => ({ data: [], isLoading: false }),
}))
vi.mock('@features/sector-manager/hooks', () => ({
  useSectorTeam: () => ({ data: [{ manager_user_id: 'm9', manager_name: 'مسؤول قسم الدورة', manager_phone: null, shift: 'morning', parent_sector: 'dora', areas: [], contractors: 0, workers: 0, present_today: 0, absent_today: 0, presence_proved: 0, out_of_zone: 0 }], isLoading: false }),
  useFieldOpsSectorManagers: () => ({ data: [{ user_id: 's9', full_name: 'مسؤول قاطع الدورة', phone: '0780', parent_sectors: ['dora'], parent_names: ['الدورة'], department_managers: 1, contractors: 0, present_today: 0, absent_today: 0, presence_proved: 0, pending_tasks: 0, on_leave_today: false, has_employee: true }], isLoading: false }),
}))

import MediaDashboard from '@portals/media/pages/MediaDashboardPage'
import FieldSectors from '@portals/field-ops/pages/Sectors/SectorsPage'
import { complaintAnalyticsHtml } from '@features/complaints/lib/analytics-report'
import type { ComplaintAnalytics } from '@features/complaints/types'

const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)

describe('القطاعات الديناميكية — الجزء 3 (00395)', () => {
  beforeEach(() => registerSectorsTree(tree))
  afterEach(() => resetSectorsRegistry())

  it('رئيسية الإعلام: بطاقة قاطع وفولدر لكل قطاع من القاعدة، والجديد يذهب لمسار ديناميكي', () => {
    wrap(<MediaDashboard />)
    expect(screen.getByTestId('unit-karrada-sector')).toHaveAttribute('href', '/media/karrada-sector')
    expect(screen.getByTestId('unit-dora-sector')).toHaveAttribute('href', '/media/sector/dora')
    expect(screen.getByTestId('unit-dora-sector')).toHaveTextContent('قاطع الدورة')
    expect(screen.getByTestId('unit-dora-sector')).toHaveTextContent('1 تذكرة نشطة')
    expect(screen.getByTestId('unit-dora-folder')).toHaveAttribute('href', '/media/folder/dora')
    expect(screen.getByTestId('unit-zaafaraniya-folder')).toHaveAttribute('href', '/media/zaafaraniya-folder')
  })

  it('العمليات الميدانية: تبويب لكل قطاع والتبديل إلى «الدورة» يعرض مسؤولها', () => {
    wrap(<FieldSectors />)
    expect(screen.getByTestId('sectors-tab-dora')).toHaveTextContent('قاطع الدورة')
    fireEvent.click(screen.getByTestId('sectors-tab-dora'))
    expect(screen.getByTestId('fo-sectors')).toHaveTextContent('مسؤول قاطع الدورة')
  })

  it('تقرير تحليلات الشكاوى يسمّي القطاع الجديد من السجل لا من ثنائية ثابتة', () => {
    const data: ComplaintAnalytics = { from: '2026-10-01', to: '2026-10-05', sector: 'dora', summary: { total: 1, approved: 1, active: 0, review: 0, unassigned: 0, withAfter: 1 }, daily: [], statuses: [], sectors: [{ sector: 'dora', count: 1, approved: 1 }] }
    const html = complaintAnalyticsHtml(data, 'monthly')
    expect(html).toContain('الدورة')
    expect(html).not.toContain('الزعفرانية')
  })
})

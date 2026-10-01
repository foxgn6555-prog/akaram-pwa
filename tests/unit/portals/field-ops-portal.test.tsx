/** بوابة العمليات الميدانية (00161): الرئيسية بمقارنة القاطعين، القواطع والمسؤولون، التبليغ الموسّع، فلتر القاطع في التقارير — ولا أي بيانات مالية */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
const h = vi.hoisted(() => ({ send: vi.fn() }))
const parent = (code: string, name: string, present: number, absent: number, sm: string | null) => ({ code, name, sector_managers: sm, areas: 4, department_managers: 2, contractors: 3, areas_without_contractor: 1, present_today: present, absent_today: absent, presence_proved: 2, out_of_zone: 0, vehicles_now: 3 })
const dash = {
  is_field_ops: true, sector_managers: [{ user_id: 's1', name: 'حسن', parent_names: ['الكرادة'] }], parents_detail: [parent('karrada', 'الكرادة', 36, 4, 'حسن'), parent('zaafaraniya', 'الزعفرانية', 10, 10, null)],
  parent_sectors: [{ code: 'karrada', name: 'الكرادة' }, { code: 'zaafaraniya', name: 'الزعفرانية' }], areas: 8, department_managers: 4, contractors: 6, areas_without_contractor: 2, workers: 70,
  present_today: 46, absent_today: 14, presence_proved: 4, out_of_zone: 0, vehicles_now: 6, pending_requests: 1, managers_on_leave: 0, notices_sent: 0, areas_detail: [],
}
const team = [
  { manager_user_id: 'm1', manager_name: 'مسؤول قسم الكرادة', manager_phone: null, shift: 'morning', parent_sector: 'karrada', areas: [{ id: 1, name: 'أرخيته', contractor_user_id: 'c1', contractor_name: 'متعهد', checked_in: true, in_zone: true, workers: 5, present: 5, absent: 0 }], contractors: 1, workers: 5, present_today: 5, absent_today: 0, presence_proved: 1, out_of_zone: 0, vehicles_now: 1, on_leave_today: false },
  { manager_user_id: 'm2', manager_name: 'مسؤول قسم الزعفرانية', manager_phone: null, shift: 'evening', parent_sector: 'zaafaraniya', areas: [], contractors: 0, workers: 0, present_today: 0, absent_today: 0, presence_proved: 0, out_of_zone: 0, vehicles_now: 0, on_leave_today: true },
]
const reports = {
  from: 'a', to: 'b', days: 7, totals: { present: 10, absent: 2, presence_proofs: 3, out_of_zone: 0, trips: 4, manager_leaves: 0 }, series: [],
  contractors: [{ user_id: 'c1', name: 'متعهد الكرادة', area: 'أرخيته', parent_sector: 'karrada', manager_name: 'م1', shift: 'morning', workers: 5, present: 8, absent: 1, proof_days: 6, out_of_zone_days: 0 }, { user_id: 'c2', name: 'متعهد الزعفرانية', area: 'الشعب', parent_sector: 'zaafaraniya', manager_name: 'م2', shift: 'evening', workers: 3, present: 2, absent: 1, proof_days: 1, out_of_zone_days: 0 }],
  managers: [],
}
vi.mock('@features/sector-manager/hooks', () => ({
  useSectorManagerMe: () => ({ data: { user_id: 'fo', full_name: 'قائد العمليات الميدانية', parent_sectors: ['karrada', 'zaafaraniya'], parent_names: ['الكرادة', 'الزعفرانية'], areas: 8, department_managers: 4, contractors: 6, employee_id: 'e', has_employee: true }, isLoading: false }),
  useSectorDashboard: () => ({ data: dash, isLoading: false }),
  useSectorTeam: () => ({ data: team, isLoading: false }),
  useFieldOpsSectorManagers: () => ({ data: [{ user_id: 's1', full_name: 'حسن مسؤول الكرادة', phone: '0770', parent_sectors: ['karrada'], parent_names: ['الكرادة'], department_managers: 2, contractors: 3, present_today: 36, absent_today: 4, presence_proved: 2, pending_tasks: 2, on_leave_today: false, has_employee: true }], isLoading: false }),
  useSectorReports: () => ({ data: reports, isLoading: false }),
  useNotifyTargets: () => ({ data: [{ user_id: 's1', full_name: 'حسن مسؤول الكرادة', role: 'admin_ops', parent_sector: 'karrada', areas: 'الكرادة', shift: null }, { user_id: 'm1', full_name: 'مسؤول قسم الكرادة', role: 'department_manager', parent_sector: 'karrada', areas: 'أرخيته', shift: 'morning' }], isLoading: false }),
  useSectorNotices: () => ({ data: [], isLoading: false }),
  useSendSectorNotice: () => ({ mutate: h.send, isPending: false }),
}))
import Dashboard from '@portals/field-ops/pages/Dashboard/FieldOpsDashboard'
import Sectors from '@portals/field-ops/pages/Sectors/SectorsPage'
import Notify from '@portals/admin-ops/pages/Notify/NotifyPage'
import Reports from '@portals/admin-ops/pages/Reports/SectorReportsPage'
const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)
const FINANCE = ['راتب', 'أجر', 'دينار', 'مالي', 'استقطاع', 'مستحق', 'IQD']
const noFinance = () => { const t = document.body.textContent ?? ''; for (const w of FINANCE) expect(t).not.toContain(w) }

describe('بوابة العمليات الميدانية (00161)', () => {
  beforeEach(() => vi.clearAllMocks())
  it('الرئيسية: كل القواطع، بطاقة لكل قاطع بنسبة حضوره ومسؤوله (أو «غير مُسنَد»)، لافتة الطلبات — ولا بيانات مالية', () => {
    wrap(<Dashboard />)
    expect(screen.getByTestId('fo-parents')).toHaveTextContent('الكرادة والزعفرانية')
    expect(screen.getByTestId('st-rate')).toHaveTextContent('77%')
    expect(screen.getByTestId('parent-karrada')).toHaveTextContent('90%'); expect(screen.getByTestId('parent-karrada')).toHaveTextContent('مسؤول القاطع: حسن')
    expect(screen.getByTestId('parent-zaafaraniya')).toHaveTextContent('50%'); expect(screen.getByTestId('parent-zaafaraniya')).toHaveTextContent('غير مُسنَد')
    expect(screen.getByTestId('fo-pending-banner')).toHaveTextContent('1 طلب بانتظار قرارك')
    noFinance()
  })
  it('القواطع والمسؤولون: تبويب لكل قاطع، مسؤول القاطع بما ينتظره، ومسؤولو الأقسام تحته؛ قاطع بلا مسؤول يُنبّه', () => {
    wrap(<Sectors />)
    expect(screen.getByTestId('fo-sm-s1')).toHaveTextContent('حسن مسؤول الكرادة'); expect(screen.getByTestId('fo-sm-pending-s1')).toHaveTextContent('2 طلب بانتظاره')
    expect(screen.getByTestId('fo-dm-list')).toHaveTextContent('مسؤول قسم الكرادة'); expect(screen.queryByTestId('fo-dm-m2')).toBeNull()
    fireEvent.click(screen.getByTestId('sectors-tab-zaafaraniya'))
    expect(screen.getByTestId('sm-unassigned')).toBeInTheDocument(); expect(screen.getByTestId('fo-dm-m2')).toHaveTextContent('في إجازة اليوم')
    noFinance()
  })
  it('التبليغ الميداني: المستلمون مجمّعون (مسؤولو القواطع ثم الأقسام) ويمكن تبليغ مسؤول قاطع', () => {
    wrap(<Notify fieldOps />)
    expect(screen.getByTestId('targets-admin_ops')).toHaveTextContent('مسؤولو القواطع (1)'); expect(screen.getByTestId('targets-department_manager')).toHaveTextContent('مسؤولو الأقسام (1)')
    fireEvent.change(screen.getByTestId('notice-title'), { target: { value: 'توجيه عام' } }); fireEvent.change(screen.getByTestId('notice-body'), { target: { value: 'تشديد الحضور' } })
    fireEvent.click(screen.getByTestId('target-s1')); fireEvent.click(screen.getByTestId('notice-send'))
    expect(h.send).toHaveBeenCalledWith({ title: 'توجيه عام', body: 'تشديد الحضور', targets: ['s1'] }, expect.any(Object))
  })
  it('التقارير الميدانية: فلتر القاطع يصفّي القوائم (المؤشرات تبقى للكل)', () => {
    wrap(<Reports fieldOps />)
    expect(screen.getByTestId('rep-contractors')).toHaveTextContent('متعهد الزعفرانية')
    fireEvent.click(screen.getByTestId('rep-parent-karrada'))
    expect(screen.getByTestId('rep-contractors')).toHaveTextContent('متعهد الكرادة'); expect(screen.getByTestId('rep-contractors')).not.toHaveTextContent('متعهد الزعفرانية')
    expect(screen.getByTestId('rep-totals')).toHaveTextContent('10')
    noFinance()
  })
})

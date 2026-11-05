import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PORTAL_ROUTES } from '@router/routes.config'
import { PORTAL_DEFINITIONS } from '@lib/constants/portals.constants'
import { PORTAL_UNITS } from '@config/portals.config'
import { routeAllowed, filterUnitsByPermissions } from '@features/permissions/my-permissions'

const state = vi.hoisted(() => ({ tasks: [] as Record<string, unknown>[], error: false, retry: vi.fn(), decide: vi.fn() }))
vi.mock('@features/sector-manager/hooks', () => ({
  useMyApprovalTasks: () => ({ data: state.tasks, isLoading: false, isError: state.error, refetch: state.retry }),
  useApprovalTimeline: () => ({ data: [] }),
  useDecideApproval: () => ({ mutate: state.decide, isPending: false }),
}))
vi.mock('@features/disclosures/components/DisclosureDetailDrawer', () => ({ DisclosureDetailDrawer: ({ id }: { id: string }) => <div data-testid="real-disclosure-drawer">تفاصيل {id}</div> }))
vi.mock('@features/complaints/hooks/useComplaints', () => ({ useComplaintReportDownload: () => ({ mutate: vi.fn() }) }))
const leave = { task_id: 't1', request_kind: 'leave', request_id: 'l1', step_no: 1, total_steps: 2, step_label: 'المدير', requester_user_id: 'u', requester_name: 'موظف اختبار', requester_role: 'employee', requester_role_label: 'موظف', area_name: null, parent_sector: null, type_name: 'إجازة', start_date: '2027-06-01', end_date: '2027-06-02', start_time: null, end_time: null, days: 2, minutes: null, notes: null, attachment_path: null, created_at: '2026-11-05T08:00:00Z', previous_steps: [], items: null, ref_no: null, details: null }
const routeFor = (portal: string) => {
  const p = PORTAL_ROUTES.find((x) => x.portal === portal)!
  const rel = portal === 'admin-ops' || portal === 'field-ops' ? 'requests' : 'approvals'
  return p.children.find((r) => r.path === rel)!
}
const renderPortalInbox = (portal: string) => {
  const r = routeFor(portal)
  return render(<MemoryRouter initialEntries={[`/${portal}/${r.path}`]}><Routes><Route path={`/${portal}/${r.path}`} element={r.element} /></Routes></MemoryRouter>)
}
afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); state.tasks = [leave]; state.error = false })
describe('وارد الموافقات في البوابات', () => {
  it('لكل بوابة دور فعلي رابط ظاهر وصفحة وارد فعلية، والمسارات السابقة محفوظة', () => {
    for (const portal of PORTAL_DEFINITIONS) {
      const r = routeFor(portal.id)
      expect(r?.element, portal.id).toBeTruthy()
      const rel = portal.id === 'admin-ops' || portal.id === 'field-ops' ? 'requests' : 'approvals'
      const units = PORTAL_UNITS[portal.id]
      expect(units.some((u) => u.path === `/${portal.id}/${rel}` || u.children?.some((c) => c.path === `/${portal.id}/${rel}`)), portal.id).toBe(true)
      expect(portal.allowedRoles.length).toBeGreaterThan(0)
    }
  })
  it.each(['manager', 'hr', 'executive', 'deputy', 'admin-ops', 'finance'])('يعرض إجازة متعددة الأيام ويتخذ القرار في بوابة %s', async (portal) => {
    renderPortalInbox(portal)
    expect(await screen.findByTestId('task-l1', undefined, { timeout: 5000 })).toHaveTextContent('موظف اختبار')
    expect(screen.getByTestId('task-l1')).toHaveTextContent('إجازة')
    fireEvent.click(screen.getByTestId('approve-l1'))
    expect(state.decide).toHaveBeenCalledWith({ kind: 'leave', requestId: 'l1', approve: true })
  })
  it('يحترم صلاحية عرض وحدة الموافقات عند تحميلها', () => {
    const perms = { 'manager.approvals': ['view'] }
    expect(routeAllowed('/manager/approvals', perms)).toBe(true)
    expect(filterUnitsByPermissions('manager', PORTAL_UNITS.manager, perms).some((u) => u.path === '/manager/approvals')).toBe(true)
    expect(routeAllowed('/manager/approvals', {})).toBe(false)
  })
  it('يعرض المسار المباشر دون طلب سلسلة وهمية', async () => {
    state.tasks = [{ ...leave, total_steps: 1, details: { approval_fallback: true } }]
    renderPortalInbox('manager')
    await screen.findByTestId('task-l1', undefined, { timeout: 5000 })
    fireEvent.click(screen.getByTestId('path-l1'))
    expect(screen.getByTestId('path-list-l1')).toHaveTextContent('المدير — بانتظار القرار')
  })
  it('الكشف يفتح درج القرار الخاص به، لا قرار الإجازة العام', async () => {
    state.tasks = [{ ...leave, task_id: 'd1', request_id: 'd1', request_kind: 'disclosure', type_name: 'مخالفة', ref_no: 'D-1', details: { target_label: 'موظف', amount: 0 } }]
    renderPortalInbox('finance')
    fireEvent.click(await screen.findByTestId('disclosure-detail-d1'))
    expect(await screen.findByTestId('real-disclosure-drawer')).toHaveTextContent('d1')
    expect(state.decide).not.toHaveBeenCalled()
  })
  it('عند تعطل التحميل يعرض الخطأ وخيار إعادة المحاولة بدلاً من ادعاء خلو الوارد', async () => {
    state.tasks = []; state.error = true
    renderPortalInbox('hr')
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل')
    expect(screen.queryByTestId('sm-requests-empty')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('إعادة المحاولة'))
    await waitFor(() => expect(state.retry).toHaveBeenCalled())
  })
})

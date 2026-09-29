import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ assign: vi.fn(), unassign: vi.fn(), profile: null as Record<string, unknown> | null }))
vi.mock('@features/contractors/hooks', () => ({
  useContractorProfileForUser: () => ({ data: h.profile }),
  useContractorManagerOptions: () => ({ data: [
    { user_id: 'm1', full_name: 'مسؤول الكرادة', shift: 'morning', sectors: [1, 2], contractors: 1, areas: [{ id: 1, name: 'أرخيته', parent_sector: 'karrada', taken_by: 'أنا' }, { id: 2, name: 'الرياض', parent_sector: 'karrada', taken_by: null }] },
  ] }),
  useAssignContractor: () => ({ mutate: h.assign, isPending: false }),
  useUnassignContractor: () => ({ mutate: h.unassign, isPending: false }),
}))
import { ContractorAssignmentCard } from '@portals/it/pages/UserManagement/ContractorAssignmentCard'

describe('بطاقة إسناد المتعهد (التطوير المركزية)', () => {
  it('بلا إسناد: تنبيه، اختيار المسؤول ثم المنطقة ثم الإسناد', () => {
    h.profile = null
    render(<ContractorAssignmentCard userId="u1" />)
    expect(screen.getByTestId('contractor-none')).toBeInTheDocument()
    expect(screen.getByTestId('ca-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('ca-manager'), { target: { value: 'm1' } })
    expect(screen.getByTestId('ca-area-1')).toBeDisabled()   // مشغولة بمتعهد آخر
    fireEvent.click(screen.getByTestId('ca-area-2'))
    fireEvent.click(screen.getByTestId('ca-save'))
    expect(h.assign).toHaveBeenCalledWith({ userId: 'u1', managerUserId: 'm1', sectorId: 2 })
  })
  it('مع إسناد نشط: يعرض الحالي، منطقته الحالية غير معطلة، وإلغاء الإسناد يتطلب سبباً', () => {
    h.profile = { user_id: 'u1', manager_user_id: 'm1', manager_name: 'مسؤول الكرادة', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning', is_active: true, workers_count: 7, assigned_at: '2026-09-01T00:00:00Z' }
    render(<ContractorAssignmentCard userId="u1" />)
    expect(screen.getByTestId('contractor-current')).toHaveTextContent('مسؤول الكرادة · أرخيته · قاطع الكرادة · صباحي · عمال نشطون 7')
    expect(screen.getByTestId('ca-area-1')).toBeEnabled()
    expect(screen.getByTestId('ca-unassign')).toBeDisabled()
    fireEvent.change(screen.getByTestId('ca-reason'), { target: { value: 'انتهاء العقد' } })
    fireEvent.click(screen.getByTestId('ca-unassign'))
    expect(h.unassign).toHaveBeenCalledWith({ userId: 'u1', reason: 'انتهاء العقد' }, expect.any(Object))
  })
})

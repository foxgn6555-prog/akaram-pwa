/** سلاسل الموافقات (التطوير المركزية، 00160): بناء سلسلة من خطوات «حسب التسلسل» و«حساب محدد»، ترتيب، حفظ، تحميل/تعديل/حذف */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ save: vi.fn(), del: vi.fn(), chains: [] as Record<string, unknown>[] }))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalChains: () => ({ data: h.chains, isLoading: false }),
  useSaveApprovalChain: () => ({ mutate: h.save, isPending: false }),
  useDeleteApprovalChain: () => ({ mutate: h.del, isPending: false }),
}))
vi.mock('@features/user-management', () => ({
  useUsers: () => ({ data: [
    { id: 'u-dep', email: 'dep@x.iq', employee_name: 'معاون المدير', roles: ['deputy_director'] },
    { id: 'u-boss', email: 'boss@x.iq', employee_name: 'المدير المفوض', roles: ['super_admin'] },
  ] }),
}))
import Page from '@portals/it/pages/ApprovalChains/ApprovalChainsPage'

describe('سلاسل الموافقات', () => {
  beforeEach(() => { vi.clearAllMocks(); h.chains = [] })
  it('يبني سلسلة متعهد/إجازة: مسؤول قسمه → مسؤول قاطعه → معاون (حساب) ويحفظها بالترتيب', () => {
    render(<Page />)
    expect(screen.getByTestId('chain-none')).toBeInTheDocument()
    expect(screen.getByTestId('chain-save')).toBeDisabled()
    fireEvent.click(screen.getByTestId('add-hier-department_manager'))
    fireEvent.click(screen.getByTestId('add-hier-admin_ops'))
    fireEvent.change(screen.getByTestId('account-select'), { target: { value: 'u-dep' } })
    fireEvent.click(screen.getByTestId('add-account'))
    expect(screen.getByTestId('chain-step-1')).toHaveTextContent('مسؤول قسمه (حسب التسلسل)')
    expect(screen.getByTestId('chain-step-3')).toHaveTextContent('معاون المدير'); expect(screen.getByTestId('chain-step-3')).toHaveTextContent('حساب محدد')
    fireEvent.click(screen.getByTestId('chain-save'))
    expect(h.save).toHaveBeenCalledWith({ requesterRole: 'employee', requestType: 'leave', steps: [{ kind: 'hierarchy', role: 'department_manager' }, { kind: 'hierarchy', role: 'admin_ops' }, { kind: 'account', user_id: 'u-dep', label: 'معاون المدير' }], active: true }, expect.any(Object))
  })
  it('سلسلة مباشرة: معاون ثم مدير مفوض (حسابان) لدور مسؤول قسم/زمنية، مع حذف خطوة', () => {
    render(<Page />)
    fireEvent.change(screen.getByTestId('chain-role'), { target: { value: 'department_manager' } })
    fireEvent.change(screen.getByTestId('chain-type'), { target: { value: 'time_permit' } })
    fireEvent.click(screen.getByTestId('add-hier-field_ops'))
    fireEvent.change(screen.getByTestId('account-select'), { target: { value: 'u-dep' } }); fireEvent.click(screen.getByTestId('add-account'))
    fireEvent.change(screen.getByTestId('account-select'), { target: { value: 'u-boss' } }); fireEvent.click(screen.getByTestId('add-account'))
    fireEvent.click(screen.getByTestId('chain-step-remove-1'))
    fireEvent.click(screen.getByTestId('chain-save'))
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ requesterRole: 'department_manager', requestType: 'time_permit', steps: [{ kind: 'account', user_id: 'u-dep', label: 'معاون المدير' }, { kind: 'account', user_id: 'u-boss', label: 'المدير المفوض' }] }), expect.any(Object))
  })
  it('يعرض السلاسل المضبوطة ويحمّلها للتعديل ويحذفها بتأكيد', () => {
    h.chains = [{ id: 'c1', requester_role: 'employee', requester_label: 'متعهد', request_type: 'leave', steps: [{ kind: 'hierarchy', role: 'department_manager', label: 'مسؤول قسم (حسب التسلسل)' }, { kind: 'account', user_id: 'u-dep', label: 'معاون المدير' }], is_active: true, updated_at: 'x', updated_by_name: 'IT' }]
    window.confirm = () => true
    render(<Page />)
    expect(screen.getByTestId('chain-employee-leave')).toHaveTextContent('1. مسؤول قسم (حسب التسلسل)')
    fireEvent.click(screen.getByTestId('chain-edit-employee-leave'))
    expect(screen.getByTestId('chain-step-2')).toHaveTextContent('معاون المدير')
    fireEvent.click(screen.getByTestId('chain-delete-employee-leave'))
    expect(h.del).toHaveBeenCalledWith('c1')
  })
})

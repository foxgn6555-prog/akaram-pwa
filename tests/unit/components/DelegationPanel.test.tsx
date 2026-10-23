/** 00336: لوحة تفويض الموافقات — الموافِق يفوّض نفسه، التطوير المركزية تفوّض نيابةً عن حساب، إلغاء بتأكيد، حدود المدة */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ set: vi.fn(), cancel: vi.fn(), rows: [] as Record<string, unknown>[], allFlag: null as boolean | null }))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalDelegations: (all: boolean) => { h.allFlag = all; return { data: h.rows, isLoading: false } },
  useSetApprovalDelegation: () => ({ mutate: h.set, isPending: false }),
  useCancelApprovalDelegation: () => ({ mutate: h.cancel, isPending: false }),
}))
vi.mock('@features/user-management', () => ({
  useUsers: () => ({ data: [
    { id: 'u-dep', email: 'dep@x.iq', employee_name: 'معاون المدير' },
    { id: 'u-ops', email: 'ops@x.iq', employee_name: 'مسؤول القاطع' },
  ] }),
}))
import { DelegationPanel } from '@components/approvals/DelegationPanel'

const today = new Date().toISOString().slice(0, 10)
const plus = (n: number) => { const d = new Date(today + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

describe('تفويض الموافقات', () => {
  beforeEach(() => { vi.clearAllMocks(); h.rows = []; h.allFlag = null })
  it('الموافِق: يفوّض حساباً لمدة محددة ويُرسل بلا «نيابةً عن»', () => {
    render(<DelegationPanel />)
    expect(h.allFlag).toBe(false)
    expect(screen.getByTestId('delegation-empty')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('delegation-open'))
    expect(screen.queryByTestId('delegation-from-search')).toBeNull()
    expect(screen.getByTestId('delegation-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('delegation-to-search'), { target: { value: 'معاون' } })
    expect(screen.queryByTestId('delegation-to-opt-u-ops')).toBeNull()
    fireEvent.click(screen.getByTestId('delegation-to-opt-u-dep'))
    expect(screen.getByTestId('delegation-to-selected')).toHaveTextContent('معاون المدير')
    fireEvent.change(screen.getByTestId('delegation-end'), { target: { value: plus(4) } })
    expect(screen.getByTestId('delegation-days')).toHaveTextContent('المدة: 5 يوم')
    fireEvent.change(screen.getByTestId('delegation-note'), { target: { value: 'إجازة' } })
    fireEvent.click(screen.getByTestId('delegation-submit'))
    expect(h.set).toHaveBeenCalledWith({ toUser: 'u-dep', startsOn: today, endsOn: plus(4), note: 'إجازة', fromUser: null }, expect.any(Object))
  })
  it('يمنع مدة تتجاوز 90 يوماً أو نهاية قبل البداية', () => {
    render(<DelegationPanel />)
    fireEvent.click(screen.getByTestId('delegation-open'))
    fireEvent.click(screen.getByTestId('delegation-to-opt-u-dep'))
    fireEvent.change(screen.getByTestId('delegation-end'), { target: { value: plus(120) } })
    expect(screen.getByTestId('delegation-days')).toHaveTextContent('الحد 90')
    expect(screen.getByTestId('delegation-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('delegation-start'), { target: { value: plus(5) } })
    fireEvent.change(screen.getByTestId('delegation-end'), { target: { value: plus(2) } })
    expect(screen.getByTestId('delegation-days')).toHaveTextContent('قبل البداية')
    expect(screen.getByTestId('delegation-submit')).toBeDisabled()
    expect(h.set).not.toHaveBeenCalled()
  })
  it('التطوير المركزية: يطلب الكل، يفوّض نيابةً عن حساب، ولا يسمح بنفس الحساب في الطرفين', () => {
    render(<DelegationPanel admin />)
    expect(h.allFlag).toBe(true)
    fireEvent.click(screen.getByTestId('delegation-open'))
    fireEvent.click(screen.getByTestId('delegation-from-opt-u-ops'))
    expect(screen.queryByTestId('delegation-to-opt-u-ops')).toBeNull()
    expect(screen.getByTestId('delegation-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('delegation-to-opt-u-dep'))
    fireEvent.click(screen.getByTestId('delegation-submit'))
    expect(h.set).toHaveBeenCalledWith(expect.objectContaining({ toUser: 'u-dep', fromUser: 'u-ops' }), expect.any(Object))
  })
  it('يعرض التفويضات الفعّالة (نافذ/مجدول) ويلغي بتأكيد فقط', () => {
    h.rows = [
      { id: 'd1', from_user: 'a', from_name: 'مسؤول القاطع', to_user: 'b', to_name: 'معاون المدير', starts_on: today, ends_on: plus(3), note: 'إجازة', is_active: true, is_current: true, created_at: 'x' },
      { id: 'd2', from_user: 'c', from_name: 'المالية', to_user: 'b', to_name: 'معاون المدير', starts_on: plus(10), ends_on: plus(12), note: null, is_active: true, is_current: false, created_at: 'x' },
      { id: 'd3', from_user: 'c', from_name: 'المالية', to_user: 'b', to_name: 'معاون المدير', starts_on: '2026-01-01', ends_on: '2026-01-05', note: null, is_active: false, is_current: false, created_at: 'x' },
    ]
    render(<DelegationPanel admin />)
    expect(screen.getByTestId('delegation-d1')).toHaveTextContent('نافذ الآن')
    expect(screen.getByTestId('delegation-d2')).toHaveTextContent('مجدول')
    expect(screen.queryByTestId('delegation-d3')).toBeNull()
    expect(screen.getByText(/تفويضات سابقة \(1\)/)).toBeInTheDocument()
    window.confirm = () => false
    fireEvent.click(screen.getByTestId('delegation-cancel-d1'))
    expect(h.cancel).not.toHaveBeenCalled()
    window.confirm = () => true
    fireEvent.click(screen.getByTestId('delegation-cancel-d1'))
    expect(h.cancel).toHaveBeenCalledWith('d1')
  })
})

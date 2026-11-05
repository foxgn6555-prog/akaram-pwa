import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ search: vi.fn(), directory: vi.fn(), set: vi.fn() }))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalDelegations: () => ({ data: [], isLoading: false }),
  useSetApprovalDelegation: () => ({ mutate: state.set, isPending: false }),
  useCancelApprovalDelegation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@sdk/sector-manager.sdk', () => ({ approvals: { delegationCandidates: state.search } }))
vi.mock('@sdk/users.sdk', () => ({ users: { list: state.directory } }))
import { DelegationPanel } from '@components/approvals/DelegationPanel'

describe('بحث المفوّض إليه', () => {
  it('المعتمد العادي يبحث بالاسم دون فتح قائمة إدارة المستخدمين', async () => {
    state.search.mockResolvedValue([{ id: 'recipient', label: 'حسن المدير' }])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><DelegationPanel /></QueryClientProvider>)
    fireEvent.click(screen.getByTestId('delegation-open'))
    expect(screen.getByText('اكتب حرفين على الأقل للبحث.')).toBeInTheDocument()
    expect(state.search).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('delegation-to-search'), { target: { value: 'حسن' } })
    fireEvent.click(await screen.findByTestId('delegation-to-opt-recipient'))
    expect(screen.getByTestId('delegation-to-selected')).toHaveTextContent('حسن المدير')
    expect(state.directory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('delegation-submit'))
    expect(state.set).toHaveBeenCalledWith(expect.objectContaining({ toUser: 'recipient' }), expect.any(Object))
  })
})

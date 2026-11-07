import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gbsKeys, useGbsContainers, useGbsUpdates, useGbsZones } from '@features/gbs/hooks'

const mocks = vi.hoisted(() => ({
  session: null as null | { id: string; email: string | null; fullName: string | null; primaryRole: string; roles: string[] },
  containers: vi.fn(async () => []),
  zones: vi.fn(async () => []),
  updates: vi.fn(async () => []),
}))

vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ data: mocks.session, isLoading: false }),
}))
vi.mock('@sdk/gbs.sdk', () => ({
  gbs: { containers: mocks.containers, zones: mocks.zones, updates: mocks.updates },
}))

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

describe('GBS visual preview data isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session = { id: 'it-user', email: null, fullName: null, primaryRole: 'it_admin', roles: ['it_admin'] }
  })

  it('does not query or reveal cached GBS records to IT portal previews', () => {
    const { client, wrapper } = makeWrapper()
    client.setQueryData(gbsKeys.containers(), [{ id: 'private-container' }])
    client.setQueryData(gbsKeys.zones(), [{ id: 'private-zone' }])
    client.setQueryData(gbsKeys.updates('pending'), [{ id: 'private-update' }])

    const { result } = renderHook(() => ({ containers: useGbsContainers(), zones: useGbsZones(), updates: useGbsUpdates() }), { wrapper })

    expect(result.current.containers.data).toEqual([])
    expect(result.current.zones.data).toEqual([])
    expect(result.current.updates.data).toEqual([])
    expect(mocks.containers).not.toHaveBeenCalled()
    expect(mocks.zones).not.toHaveBeenCalled()
    expect(mocks.updates).not.toHaveBeenCalled()
  })

  it('keeps normal GBS reads enabled for an operations account', async () => {
    mocks.session = { id: 'ops-user', email: null, fullName: null, primaryRole: 'ops_room', roles: ['ops_room'] }
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useGbsContainers(), { wrapper })

    await waitFor(() => expect(mocks.containers).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.data).toEqual([]))
  })
})

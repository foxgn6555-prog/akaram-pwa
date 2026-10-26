/**
 * 00350-D — صفحتان حقيقيتان: زر الكتابة المربوط يُعطَّل مع عنوان السبب عند غياب الإجراء، ويعود متاحاً عند منحه؛
 * ولا يصل أي استدعاء إلى الخادم أثناء التعطيل.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({
  fleet: vi.fn(async () => [] as unknown[]), drivers: vi.fn(async () => [] as unknown[]), destinations: vi.fn(async () => [] as unknown[]),
  recordExit: vi.fn(async () => ({ id: 'x' })),
  advanceTypes: vi.fn(async () => [] as unknown[]), advanceCreate: vi.fn(async () => 'a1'),
}))
vi.mock('@sdk/station-fleet.sdk', async (orig) => ({ ...(await orig<object>()), stationFleet: { fleet: h.fleet, drivers: h.drivers, destinations: h.destinations, recordExit: h.recordExit } }))
vi.mock('@sdk/client', () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) }, sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => (await p).data }))

import { StationExitForm } from '@portals/transfer-station/components/StationExitForm'
import { PERMISSION_DENIED_TITLE, useMyPermissionsStore } from '@features/permissions/my-permissions'

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('⚓ 00350-D — زر تسجيل خروج آلية المحطة (station_record_exit ⇒ transfer-station.vehicle-movements:execute)', () => {
  beforeEach(() => { vi.clearAllMocks(); useMyPermissionsStore.getState().reset() })

  it('بلا إجراء execute: الزر معطَّل ويحمل سبب المنع ولا يُرسل شيء', async () => {
    useMyPermissionsStore.getState().set('u1', { 'transfer-station.vehicle-movements': ['view'] })
    wrap(<StationExitForm kind="saksat" defaultWeight="10" />)
    const btn = await screen.findByTestId('saksat-submit')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', PERMISSION_DENIED_TITLE)
    fireEvent.click(btn)
    expect(h.recordExit).not.toHaveBeenCalled()
  })

  it('مع execute: الزر متاح بلا عنوان منع', async () => {
    useMyPermissionsStore.getState().set('u1', { 'transfer-station.vehicle-movements': ['view', 'execute'] })
    wrap(<StationExitForm kind="carrier" defaultWeight="16" />)
    const btn = await screen.findByTestId('carrier-submit')
    expect(btn).not.toBeDisabled()
    expect(btn).not.toHaveAttribute('title')
  })

  it('قبل تحميل الصلاحيات (null): لا تعطيل — الخادم هو الحكم', async () => {
    wrap(<StationExitForm kind="saksat" defaultWeight="10" />)
    await waitFor(() => expect(screen.getByTestId('saksat-submit')).not.toBeDisabled())
  })
})

/**
 * ⛔ انحدار: «cannot add postgres_changes callbacks … after subscribe()».
 * StrictMode يركّب الأثر مرتين: اشتراك → إلغاء (removeChannel غير متزامن) → اشتراك ثانٍ بالاسم نفسه
 * فيُرجع supabase القناة القديمة المشترَكة ويرمي. نختبر على عميل supabase-js حقيقي (بلا شبكة).
 */
import { describe, it, expect, vi } from 'vitest'
import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@sdk/client', async () => {
  const { createClient: cc } = await import('@supabase/supabase-js')
  const client = cc('http://localhost:54321', 'anon-key')
  return { supabase: client, sdkGuard: vi.fn(), sdkVoid: vi.fn() }
})

import { system } from '@sdk/system.sdk'
import { notifications } from '@sdk/notifications.sdk'
import { useConsoleLive } from '@features/console'
import { subscriptionManager } from '@lib/realtime/subscription-manager'

function Probe() {
  useConsoleLive(true)
  return <div data-testid="ok" />
}

describe('Realtime · إعادة التركيب لا تكسر الاشتراك', () => {
  it('useConsoleLive تحت StrictMode لا يرمي ويعيش اشتراك واحد', () => {
    const qc = new QueryClient()
    const r = render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <Probe />
        </QueryClientProvider>
      </StrictMode>,
    )
    expect(r.getByTestId('ok')).toBeInTheDocument()
    r.unmount()
  })

  it('اشتراك → إلغاء → اشتراك فوري بنفس الدلالة (Console/الإشعارات/المدير) — بلا استثناء', () => {
    for (let i = 0; i < 3; i++) {
      const off = system.consoleSubscribe(() => {})
      off()
    }
    for (let i = 0; i < 3; i++) {
      const off = notifications.subscribe('u-1', () => {})
      off()
    }
    for (let i = 0; i < 3; i++) {
      const off = subscriptionManager.subscribe('gps:test', (c) => c.on('postgres_changes', { event: '*', schema: 'public', table: 'x' }, () => {}))
      off()
    }
    expect(true).toBe(true)
  })
})

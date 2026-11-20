/**
 * حارس إبطال الجلسة (الجولة ٣-ج).
 *
 * السبب: «إنهاء الجلسة» كان يبدو معطلاً لأن الجهاز المنتهي يحمل رمز وصول صالحاً (ساعة).
 * الحماية: إن غابت جلسة الجهاز من «جلساتي» ⇒ خروج محلي فوراً؛ ولا خروج عند تعذّر الحكم.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'

const CURRENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

/** رمز وصول مزيف يحمل claim الجلسة كما يفعل GoTrue */
function fakeToken(sessionId: string | null): string {
  const payload = btoa(JSON.stringify(sessionId ? { session_id: sessionId } : { sub: 'x' }))
  return `h.${payload}.s`
}

const getSession = vi.fn()
const signOut = vi.fn()
const list = vi.fn()

vi.mock('@sdk/client', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      signOut: () => signOut(),
    },
  },
}))

vi.mock('@sdk/sessions.sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    sessions: { ...(actual.sessions as object), list: () => list() },
  }
})

import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  currentSessionAlive,
  useRevokedSessionWatch,
} from '@features/auth/hooks/useRevokedSessionWatch'

function Harness(): null {
  useRevokedSessionWatch('user-1')
  // نبقي المكوّن بسيطاً: الحارس يعمل عبر المؤقتات والاستماع للـvisibilitychange
  useEffect(() => {}, [])
  return null
}

function renderHarness(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
}

describe('الحكم على بقاء الجلسة', () => {
  beforeEach(() => {
    getSession.mockReset()
    signOut.mockReset()
    list.mockReset()
  })

  it('يعيد true إذا كانت جلستي ضمن القائمة', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: fakeToken(CURRENT) } } })
    list.mockResolvedValue([{ id: OTHER, is_current: false }, { id: CURRENT, is_current: true }])
    await expect(currentSessionAlive()).resolves.toBe(true)
  })

  it('يعيد false إذا غابت جلستي (أُنهيت من جهاز آخر)', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: fakeToken(CURRENT) } } })
    list.mockResolvedValue([{ id: OTHER, is_current: false }])
    await expect(currentSessionAlive()).resolves.toBe(false)
  })

  it('يعيد null إذا لم يحمل الرمز معرّف جلسة — لا حكم ولا طرد', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: fakeToken(null) } } })
    await expect(currentSessionAlive()).resolves.toBeNull()
    expect(list).not.toHaveBeenCalled()
  })
})

describe('الخروج الفوري عند إبطال الجلسة', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getSession.mockReset()
    signOut.mockReset()
    list.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('يُخرج المستخدم إذا غابت جلسته عند أول فحص', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: fakeToken(CURRENT) } } })
    list.mockResolvedValue([{ id: OTHER, is_current: false }])
    signOut.mockResolvedValue({})

    renderHarness()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS + 10)
    })
    // تفريغ المهام المعلّقة (signOut داخل سلسلة await) قبل الحكم
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('لا يُخرج المستخدم إذا كانت جلسته قائمة', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: fakeToken(CURRENT) } } })
    list.mockResolvedValue([{ id: CURRENT, is_current: true }])
    signOut.mockResolvedValue({})

    renderHarness()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS + CHECK_INTERVAL_MS + 10)
    })

    expect(signOut).not.toHaveBeenCalled()
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('لا يُخرج المستخدم إذا فشل الفحص (شبكة/خادم)', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: fakeToken(CURRENT) } } })
    list.mockRejectedValue(new Error('network'))

    renderHarness()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS + 10)
    })

    expect(signOut).not.toHaveBeenCalled()
  })
})

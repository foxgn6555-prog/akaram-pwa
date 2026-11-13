/**
 * 00413 — قفل الخمول (30 دقيقة) للبوابات الحساسة.
 * قبل الإصلاح: `SessionTimeout.tsx` كان فارغًا (`export {}`) و`sessionIdleTimeoutMs` بلا مستهلك
 * ⇒ جلستان (المالية و/admin) تبقى مفتوحة إلى الأبد على جهاز مشترك.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ logout: vi.fn(async () => undefined), navigate: vi.fn() }))

vi.mock('@features/auth/hooks/useAuth', () => ({ useLogout: () => ({ mutateAsync: h.logout }) }))
vi.mock('react-router', async (orig) => {
  const real = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...real, useNavigate: () => h.navigate }
})

import { SessionTimeout, idleState, IDLE_EVENTS } from '@components/auth/SessionTimeout'

const MIN = 60_000

const renderAt = (props: { enabled: boolean; timeoutMs?: number }) =>
  render(
    <MemoryRouter>
      <SessionTimeout {...props} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-10T09:00:00Z'))
  h.logout.mockClear()
  h.navigate.mockClear()
})
afterEach(() => { vi.useRealTimers() })

describe('00413 — قفل الخمول', () => {
  it('قرار الحالة: نشِط ← تحذير (آخر دقيقة) ← منتهٍ', () => {
    const t0 = 1_000_000
    expect(idleState(t0, t0, 30 * MIN)).toBe('active')
    expect(idleState(t0, t0 + 28 * MIN, 30 * MIN)).toBe('active')
    expect(idleState(t0, t0 + 29 * MIN + 30_000, 30 * MIN)).toBe('warning')
    expect(idleState(t0, t0 + 30 * MIN, 30 * MIN)).toBe('expired')
    expect(idleState(t0, t0 + 45 * MIN, 30 * MIN)).toBe('expired')
  })

  it('لا يراقب شيئًا عندما يكون معطّلًا (بوابات غير حساسة)', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const { container } = renderAt({ enabled: false })
    expect(container).toBeEmptyDOMElement()
    expect(add.mock.calls.filter(([e]) => (IDLE_EVENTS as readonly string[]).includes(e as string))).toHaveLength(0)
    act(() => { vi.advanceTimersByTime(60 * MIN) })
    expect(h.logout).not.toHaveBeenCalled()
    add.mockRestore()
  })

  it('يُنبّه قبل القفل بدقيقة، و«أنا هنا» تُعيد المؤقت', () => {
    renderAt({ enabled: true, timeoutMs: 30 * MIN })
    act(() => { vi.advanceTimersByTime(29 * MIN + 30_000) })
    expect(screen.getByTestId('session-idle-warning')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('سيتم قفل الجلسة خلال')
    fireEvent.click(screen.getByTestId('session-idle-keep'))
    expect(screen.queryByTestId('session-idle-warning')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(20 * MIN) })
    expect(h.logout).not.toHaveBeenCalled()
  })

  it('أي نشاط من المستخدم يُصفّر العدّاد (ضغطة · كتابة · لمس · تمرير)', () => {
    renderAt({ enabled: true, timeoutMs: 30 * MIN })
    for (const ev of ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const) {
      act(() => { vi.advanceTimersByTime(29 * MIN) }) // 29 دقيقة خمول — تحت المهلة
      expect(h.logout).not.toHaveBeenCalled()
      act(() => { window.dispatchEvent(new Event(ev)) }) // نشاط ⇒ تصفير العدّاد
    }
    // وبلا نشاط بعدها: تقفل عند 30 دقيقة من آخر نشاط (آخر نشاط كان عند نهاية الحلقة)
    act(() => { vi.advanceTimersByTime(31 * MIN) })
    expect(h.logout).toHaveBeenCalledTimes(1)
  })

  it('عند انتهاء المهلة: خروج + انتقال إلى /login مرة واحدة', async () => {
    renderAt({ enabled: true, timeoutMs: 30 * MIN })
    await act(async () => { vi.advanceTimersByTime(31 * MIN); await Promise.resolve() })
    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith('/login', { replace: true })
    await act(async () => { vi.advanceTimersByTime(30 * MIN); await Promise.resolve() })
    expect(h.logout).toHaveBeenCalledTimes(1) // لا تكرار
  })

  it('يُنظّف مستمعاته عند الإزالة', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderAt({ enabled: true, timeoutMs: 30 * MIN })
    unmount()
    const removed = remove.mock.calls.map(([e]) => e as string)
    for (const ev of IDLE_EVENTS) expect(removed).toContain(ev)
    remove.mockRestore()
  })

  it('مُركَّب في قوقعة البوابة للبوابتين الحسّاستين فقط', () => {
    const shell = readFileSync(join(process.cwd(), 'src/components/layout/AppShell.tsx'), 'utf8')
    expect(shell).toContain('<SessionTimeout enabled={idleLock} />')
    expect(shell).toContain("const idleLock = portal === PORTALS.FINANCE || portal === PORTALS.ADMIN")
    // المهلة من الإعداد المركزي 30 دقيقة
    const cfg = readFileSync(join(process.cwd(), 'src/config/app.config.ts'), 'utf8')
    expect(cfg).toContain('sessionIdleTimeoutMs: 30 * 60_000')
  })
})

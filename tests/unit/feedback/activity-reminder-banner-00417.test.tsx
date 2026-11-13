/**
 * 00417 — تذكير كل 30 يومًا (الوجه أ: banner الواجهة).
 * يظهر التذكير الأمني غير المقروء (category = 'security') أعلى المحتوى،
 * ويُقرَأ عند إخفائه. لا يعرض شيئًا إن لم يوجد تذكير.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  session: { id: 'user-1' } as { id: string } | null,
  list: vi.fn(async (): Promise<unknown[]> => []),
  markRead: vi.fn(async (): Promise<void> => undefined),
}))

vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ data: h.session }),
}))

vi.mock('@sdk/notifications.sdk', () => ({
  notifications: {
    list: (...a: unknown[]) => h.list(...a),
    markRead: (...a: unknown[]) => h.markRead(...a),
  },
}))

import { ActivityReminderBanner } from '@components/feedback/ActivityReminderBanner'

beforeEach(() => {
  h.session = { id: 'user-1' }
  h.list.mockReset().mockResolvedValue([])
  h.markRead.mockReset().mockResolvedValue(undefined)
})

describe('00417 — banner تذكير النشاط', () => {
  it('لا يعرض شيئًا عندما لا يوجد تذكير أمني غير مقروء', async () => {
    render(<ActivityReminderBanner />)
    await waitFor(() => expect(h.list).toHaveBeenCalled())
    expect(screen.queryByTestId('activity-reminder-banner')).toBeNull()
  })

  it('لا يعرض شيئًا للمستخدم غير المسجّل', async () => {
    h.session = null
    render(<ActivityReminderBanner />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByTestId('activity-reminder-banner')).toBeNull()
    expect(h.list).not.toHaveBeenCalled()
  })

  it('يعرض أول تذكير أمني غير مقروء', async () => {
    h.list.mockResolvedValue([
      { id: 'n1', title: 'تحديث آخر', body: 'نص', category: 'hr', is_read: false },
      {
        id: 'n2',
        title: 'تذكير بالنشاط — لم تسجل الدخول منذ 30 يومًا',
        body: 'مرحباً، لم تسجل الدخول…',
        category: 'security',
        is_read: false,
      },
    ])
    render(<ActivityReminderBanner />)
    await waitFor(() => expect(screen.getByTestId('activity-reminder-banner')).toBeInTheDocument())
    expect(screen.getByText('تذكير بالنشاط — لم تسجل الدخول منذ 30 يومًا')).toBeInTheDocument()
  })

  it('لا يعرض التذكير المقروء', async () => {
    h.list.mockResolvedValue([
      { id: 'n1', title: 'تذكير قديم', body: 'x', category: 'security', is_read: true },
    ])
    render(<ActivityReminderBanner />)
    await waitFor(() => expect(h.list).toHaveBeenCalled())
    expect(screen.queryByTestId('activity-reminder-banner')).toBeNull()
  })

  it('إخفاء التذكير يقرئه ويزيل الشريط', async () => {
    h.list.mockResolvedValue([
      { id: 'n2', title: 'تذكير بالنشاط', body: 'b', category: 'security', is_read: false },
    ])
    render(<ActivityReminderBanner />)
    await waitFor(() => expect(screen.getByTestId('activity-reminder-banner')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء التذكير' }))
    await waitFor(() => expect(h.markRead).toHaveBeenCalledWith('n2'))
    await waitFor(() => expect(screen.queryByTestId('activity-reminder-banner')).toBeNull())
  })
})

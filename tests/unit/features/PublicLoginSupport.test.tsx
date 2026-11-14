import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockGetPublicSettings = vi.fn()
const mockLoadThread = vi.fn()

vi.mock('@sdk/login-support.sdk', () => ({
  loginSupport: {
    getPublicSettings: (...args: unknown[]) => mockGetPublicSettings(...args),
    loadThread: (...args: unknown[]) => mockLoadThread(...args),
    startRequest: vi.fn(),
    sendMessage: vi.fn(),
  },
}))

import PublicLoginSupport from '@portals/public/pages/Login/PublicLoginSupport'

describe('PublicLoginSupport dialog', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockGetPublicSettings.mockResolvedValue({ settings: { support_phone: null, business_hours: null, is_online: false } })
    mockLoadThread.mockReset()
  })

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
    document.documentElement.style.scrollbarGutter = ''
  })

  it('renders thread timestamps with Latin digits in Baghdad time', async () => {
    sessionStorage.setItem(
      'akram:login-support-session:v1',
      JSON.stringify({ ticketId: 'ticket-1', token: 'token', reference: 'SUP-1' }),
    )
    mockLoadThread.mockResolvedValue({
      ticket: { id: 'ticket-1', reference: 'SUP-1', status: 'open' },
      messages: [
        {
          id: 'message-1',
          sender: 'support',
          body: 'تم استلام طلبك',
          created_at: '2026-10-05T12:53:00Z',
        },
      ],
    })

    render(<PublicLoginSupport open onClose={vi.fn()} />)

    expect(await screen.findByText('03:53 م')).toBeInTheDocument()
  })

  it('renders its responsive dialog through a body portal and restores page scrolling when closed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { unmount } = render(<PublicLoginSupport open onClose={onClose} />)

    expect(await screen.findByRole('dialog', { name: 'مساعدة تسجيل الدخول' })).toBeInTheDocument()
    expect(document.body.querySelector('.login-support-backdrop')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.scrollbarGutter).toBe('auto')
    expect(screen.getByLabelText('البريد الإلكتروني الوظيفي')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()

    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.scrollbarGutter).toBe('')
    expect(document.body.querySelector('.login-support-backdrop')).toBeNull()
  })
})

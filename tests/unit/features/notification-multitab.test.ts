import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimNotificationTone } from '@features/notifications/push.client'

describe('منع تكرار صوت الإشعار بين التبويبات', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })
  it('يسمح بأول تبويب ويمنع التكرار لنفس الإشعار خلال عشر ثوان', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T10:00:00Z'))
    expect(claimNotificationTone('notification-1')).toBe(true)
    expect(claimNotificationTone('notification-1')).toBe(false)
    expect(claimNotificationTone('notification-2')).toBe(true)
    vi.advanceTimersByTime(10_001)
    expect(claimNotificationTone('notification-1')).toBe(true)
  })
  it('لا يمنع الإشعار الذي لا يحمل معرفاً', () => {
    expect(claimNotificationTone()).toBe(true)
  })
})

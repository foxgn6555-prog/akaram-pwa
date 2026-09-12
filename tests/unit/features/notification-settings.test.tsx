import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  disableDevice: vi.fn(),
  toast: vi.fn(),
  devices: [] as Array<{
    id: string
    device_name: string
    platform: string
    is_active: boolean
    health: string
    sent_count: number
    failed_count: number
    pending_count: number
  }>,
  preferences: {
    user_id: 'u',
    in_app_enabled: true,
    sound_enabled: true,
    push_enabled: false,
    critical_only: false,
    quiet_from: null,
    quiet_to: null,
    updated_at: '',
  },
}))
vi.mock('@stores/ui.store', () => ({
  useUiStore: (pick: (s: { addToast: typeof h.toast }) => unknown) => pick({ addToast: h.toast }),
}))
vi.mock('@features/notifications/hooks/useNotifications', () => ({
  useNotificationPreferences: () => ({ data: h.preferences }),
  usePushDevices: () => ({ data: h.devices, refetch: vi.fn() }),
  useDisablePushDevice: () => ({ mutate: h.disableDevice, isPending: false }),
  useUpdateNotificationPreferences: () => ({ mutate: h.mutate, isPending: false }),
}))
vi.mock('@features/notifications/push.client', () => ({
  pushSupport: () => ({ supported: true, permission: 'default', isIos: false, standalone: false }),
  pushReadiness: () => [
    { key: 'secure', label: 'اتصال آمن HTTPS', ready: true },
    { key: 'push', label: 'دعم Web Push', ready: true },
  ],
  currentDevicePushEnabled: async () => false,
  enablePush: h.enable,
  disablePush: h.disable,
}))
import { NotificationSettingsPanel } from '@features/notifications/components/NotificationSettingsPanel'
describe('إعدادات الإشعارات', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.devices.length = 0
    h.enable.mockResolvedValue({})
  })
  it('يعرض فحص جاهزية الجهاز قبل التفعيل', () => {
    render(<NotificationSettingsPanel onClose={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'فحص جاهزية الإشعارات' })).toHaveTextContent('2 من 2')
    expect(screen.getByText('اتصال آمن HTTPS')).toBeInTheDocument()
  })
  it('يفعّل Push من زر المستخدم ويسجل نجاح العملية', async () => {
    render(<NotificationSettingsPanel onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'تفعيل' }))
    await waitFor(() => expect(h.enable).toHaveBeenCalled())
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
  })
  it('يعرض صحة أجهزة Push ويوقف الجهاز المختار', async () => {
    h.devices.push({
      id: 'device-1',
      device_name: 'Chrome · android',
      platform: 'android',
      is_active: true,
      health: 'degraded',
      sent_count: 12,
      failed_count: 3,
      pending_count: 1,
    })
    render(<NotificationSettingsPanel onClose={vi.fn()} />)
    expect(screen.getByText('Chrome · android')).toBeInTheDocument()
    expect(screen.getByText(/يواجه فشل تسليم متكرر/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'إيقاف' }))
    expect(h.disableDevice).toHaveBeenCalledWith('device-1')
  })
  it('يحفظ الصوت والتنبيهات الحرجة وفترة الهدوء', async () => {
    render(<NotificationSettingsPanel onClose={vi.fn()} />)
    const checks = screen.getAllByRole('checkbox')
    await userEvent.click(checks[0]!)
    await userEvent.click(checks[1]!)
    await userEvent.click(checks[2]!)
    await userEvent.click(screen.getByRole('button', { name: 'حفظ الإعدادات' }))
    expect(h.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        sound_enabled: false,
        critical_only: true,
        quiet_from: '22:00',
        quiet_to: '06:00',
      }),
      expect.any(Object),
    )
  })
})

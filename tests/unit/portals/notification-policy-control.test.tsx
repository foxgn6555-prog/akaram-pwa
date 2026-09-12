import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  gpsSave: vi.fn(),
  pushAction: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [{ id: 1, name: 'الرياض' }] }),
}))
vi.mock('@features/gps-lvn/hooks', () => ({
  useGpsAlertNotificationPolicies: () => ({
    data: [
      {
        alert_type: 'gps_offline',
        enabled: true,
        priority: 'critical',
        recipient_roles: ['ops_room'],
        in_app_enabled: true,
        push_enabled: true,
        sound_enabled: true,
        only_during_departure: true,
        escalation_minutes: 15,
        escalation_repeat_minutes: 15,
        escalation_levels: 3,
        updated_at: '',
      },
    ],
    isLoading: false,
  }),
  useGpsAlertNotificationPolicySave: () => ({ mutate: h.gpsSave, isPending: false }),
}))
vi.mock('@features/notifications/hooks/useNotifications', () => ({
  useExportPushDeliveries: () => ({ mutate: vi.fn(), isPending: false }),
  usePushMetrics: () => ({ data: [{ bucket_start: '2026-09-12T10:00:00Z', total: 10, sent: 8, failed: 2, clicked: 4, average_attempts: 1.2, success_rate: 80, interaction_rate: 50 }] }),
  usePushBatchRetry: () => ({ mutate: vi.fn(), isPending: false }),
  usePushAdminAction: () => ({ mutate: h.pushAction, isPending: false }),
  usePushDeliveryPage: () => ({
    data: [
      {
        delivery_id: 'd1',
        subscription_id: 's1',
        title: 'تحديث صيانة',
        device_name: 'Chrome · Android',
        platform: 'android',
        status: 'sent',
        attempts: 1,
        last_http_status: 201,
        sent_at: '2026-09-12T10:00:00Z',
        clicked_at: '2026-09-12T10:05:00Z',
        total_count: 1,
      },
    ],
    isLoading: false,
  }),
  usePushDeliveryOperations: () => ({
    data: {
      active_devices: 8,
      degraded_devices: 1,
      pending: 2,
      processing: 1,
      sent: 40,
      failed: 3,
      clicked: 12,
      stale_processing: 0,
    },
  }),
  useWorkflowPolicies: () => ({
    data: [
      {
        id: 'p1',
        event_key: 'maintenance_dispatch',
        sector_id: null,
        sector_name: null,
        vehicle_category: null,
        mode: 'notify_only',
        emergency_bypass: true,
        enabled: true,
        recipient_roles: ['central_garage_officer'],
        in_app_enabled: true,
        push_enabled: true,
        sound_enabled: true,
        escalation_minutes: 15,
        notes: 'افتراضي',
        updated_at: '',
      },
    ],
    isLoading: false,
  }),
  useSaveWorkflowPolicy: () => ({ mutate: h.save, isPending: false }),
  useDeleteWorkflowPolicy: () => ({ mutate: h.remove }),
}))
import NotificationPolicyControlPage from '@portals/it/pages/Notifications/NotificationPolicyControlPage'
describe('تحكم سياسات الإشعارات', () => {
  it('يعرض الافتراضي ولا يسمح بحذفه', () => {
    render(<NotificationPolicyControlPage />)
    expect(screen.getByText('السياسة الافتراضية')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حذف السياسة' })).not.toBeInTheDocument()
  })
  it('يعرض مراقبة تسليم Push والتفاعل والأجهزة المتعثرة', () => {
    render(<NotificationPolicyControlPage />)
    expect(screen.getByRole('region', { name: 'حالة تسليم Push' })).toBeInTheDocument()
    expect(screen.getByText('أجهزة متعثرة')).toBeInTheDocument()
    expect(screen.getByText('تفاعل المستخدم')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'تفاصيل تسليم Push' })).toBeInTheDocument()
    expect(screen.getByText('Chrome · Android')).toBeInTheDocument()
    expect(screen.getByText('تم الفتح')).toBeInTheDocument()
    expect(screen.queryByText(/endpoint|p256dh|auth_key/i)).not.toBeInTheDocument()
  })
  it('ينفذ تعطيل الجهاز بسبب إلزامي عبر الإجراء المدقق', async () => {
    render(<NotificationPolicyControlPage />)
    await userEvent.click(screen.getByRole('button', { name: 'تعطيل الجهاز' }))
    expect(screen.getByPlaceholderText('سبب الإجراء')).toBeRequired()
    await userEvent.click(screen.getByRole('button', { name: 'تأكيد الإجراء' }))
    expect(h.pushAction).toHaveBeenCalledWith(
      {
        action: 'disable_device',
        deliveryId: undefined,
        subscriptionId: 's1',
        reason: 'تعطيل الجهاز بعد مراجعة حالة التسليم',
      },
      expect.any(Object),
    )
  })
  it('يعرض ويحفظ سياسة تنبيه GPS المستقلة', async () => {
    render(<NotificationPolicyControlPage />)
    expect(screen.getByText('انقطاع GPS')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'حفظ سياسة GPS' }))
    expect(h.gpsSave).toHaveBeenCalledWith(
      expect.objectContaining({ alert_type: 'gps_offline', priority: 'critical' }),
    )
  })
  it('ينشئ سياسة موافقة مخصصة', async () => {
    render(<NotificationPolicyControlPage />)
    await userEvent.click(screen.getByRole('button', { name: /سياسة مخصصة/ }))
    await userEvent.click(screen.getByRole('radio', { name: /موافقة مسبقة/ }))
    await userEvent.click(screen.getByRole('button', { name: 'حفظ السياسة' }))
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        input: expect.objectContaining({ mode: 'approval_required' }),
      }),
      expect.any(Object),
    )
  })
})

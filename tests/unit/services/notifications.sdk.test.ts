import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  on: vi.fn(),
  subscribe: vi.fn(),
  remove: vi.fn(),
  invoke: vi.fn(),
}))
vi.mock('@sdk/client', () => ({
  supabase: {
    rpc: h.rpc,
    channel: () => ({ on: h.on }),
    removeChannel: h.remove,
    functions: { invoke: h.invoke },
  },
  sdkGuard: async (v: Promise<{ data: unknown; error: null }>) => (await v).data,
}))
import { notifications } from '@sdk/notifications.sdk'
describe('Notifications SDK', () => {
  beforeEach(() => {
    h.rpc.mockReset()
    h.rpc.mockResolvedValue({ data: [], error: null })
    h.on.mockReset()
    h.subscribe.mockReset()
    h.on.mockReturnValue({ subscribe: h.subscribe })
    h.invoke.mockReset()
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null })
  })
  it('يقرأ المركز بعدد محدود عبر RPC', async () => {
    await notifications.list(20, '2026-01-01T00:00:00Z')
    expect(h.rpc).toHaveBeenCalledWith('notification_center', {
      p_limit: 20,
      p_before: '2026-01-01T00:00:00Z',
    })
  })
  it('لا يتيح تغيير محتوى الإشعار بل القراءة والإخفاء فقط', async () => {
    await notifications.markRead('n1')
    expect(h.rpc).toHaveBeenLastCalledWith('notification_mark_read', { p_id: 'n1' })
    await notifications.dismiss('n1')
    expect(h.rpc).toHaveBeenLastCalledWith('notification_dismiss', { p_id: 'n1' })
  })
  it('يسجل جهاز Push ويطلب التوزيع من Edge Function', async () => {
    await notifications.registerPush({
      endpoint: 'https://push.test/x',
      p256dh: 'key',
      auth: 'auth',
      expiration: null,
      userAgent: 'ua',
      platform: 'android',
      deviceName: 'phone',
    })
    expect(h.rpc).toHaveBeenCalledWith('notification_register_push', {
      p_endpoint: 'https://push.test/x',
      p_p256dh: 'key',
      p_auth: 'auth',
      p_expiration: null,
      p_user_agent: 'ua',
      p_platform: 'android',
      p_device_name: 'phone',
    })
    await notifications.dispatchPush()
    expect(h.invoke).toHaveBeenCalledWith('notification-push-dispatch', { body: { scope: 'self' } })
  })
  it('يعرض صحة الأجهزة ويسجل تفاعل Push ويوقف الجهاز عبر RPC معزول', async () => {
    await notifications.pushDevices()
    expect(h.rpc).toHaveBeenLastCalledWith('notification_push_devices')
    await notifications.pushMetrics(24)
    expect(h.rpc).toHaveBeenLastCalledWith('notification_push_metrics', { p_hours: 24 })
    await notifications.batchRetryPush(['d1', 'd2'], ' إعادة جماعية ')
    expect(h.rpc).toHaveBeenLastCalledWith('notification_push_batch_retry', {
      p_delivery_ids: ['d1', 'd2'],
      p_reason: 'إعادة جماعية',
    })
    await notifications.pushOperations(48)
    expect(h.rpc).toHaveBeenLastCalledWith('notification_delivery_operations', { p_hours: 48 })
    await notifications.pushDeliveryPage({
      hours: 24,
      status: 'failed',
      platform: 'ios',
      offset: 25,
    })
    expect(h.rpc).toHaveBeenLastCalledWith('notification_push_delivery_page', {
      p_hours: 24,
      p_status: 'failed',
      p_platform: 'ios',
      p_limit: 50,
      p_offset: 25,
    })
    await notifications.recordPushInteraction('d1')
    expect(h.rpc).toHaveBeenLastCalledWith('notification_record_push_interaction', {
      p_delivery_id: 'd1',
    })
    await notifications.disablePushDevice('s1')
    expect(h.rpc).toHaveBeenLastCalledWith('notification_disable_push_device', {
      p_subscription_id: 's1',
    })
    await notifications.pushAdminAction({
      action: 'retry_delivery',
      deliveryId: 'd1',
      reason: ' إعادة بعد الفحص ',
    })
    expect(h.rpc).toHaveBeenLastCalledWith('notification_push_admin_action', {
      p_action: 'retry_delivery',
      p_delivery_id: 'd1',
      p_subscription_id: null,
      p_reason: 'إعادة بعد الفحص',
    })
  })
  it('يحفظ سياسة الانطلاق عبر RPC الخادمي', async () => {
    await notifications.saveWorkflowPolicy(null, {
      sector_id: 1,
      vehicle_category: 'truck',
      mode: 'approval_required',
      emergency_bypass: true,
      enabled: true,
      recipient_roles: ['central_garage_officer'],
      in_app_enabled: true,
      push_enabled: true,
      sound_enabled: true,
      escalation_minutes: 10,
      notes: ' سياسة ',
    })
    expect(h.rpc).toHaveBeenLastCalledWith(
      'notification_workflow_policy_save',
      expect.objectContaining({
        p_sector_id: 1,
        p_vehicle_category: 'truck',
        p_mode: 'approval_required',
        p_notes: 'سياسة',
      }),
    )
  })
  it('يشترك في تغييرات إشعارات المستخدم نفسه', () => {
    const cb = vi.fn(),
      off = notifications.subscribe('u1', cb)
    expect(h.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.u1' },
      cb,
    )
    off()
    expect(h.remove).toHaveBeenCalled()
  })
})

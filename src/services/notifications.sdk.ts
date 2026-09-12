import { sdkGuard, supabase } from './client'
export type NotificationCategory =
  'system' | 'departure' | 'maintenance' | 'garage' | 'station' | 'gps' | 'complaints' | 'security'
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'
export interface AppNotification {
  id: string
  title: string
  body: string | null
  type: 'info' | 'success' | 'warning' | 'error'
  category: NotificationCategory
  priority: NotificationPriority
  link: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
  entity_type: string | null
  entity_id: string | null
  action_label: string | null
  sound_allowed: boolean
}
export interface PushDevice {
  id: string
  platform: 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown'
  device_name: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
  pending_count: number
  sent_count: number
  failed_count: number
  last_sent_at: string | null
  last_clicked_at: string | null
  health: 'new' | 'healthy' | 'degraded' | 'disabled'
}
export interface PushDeliveryRow {
  delivery_id: string
  notification_id: string
  subscription_id: string
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'
  attempts: number
  created_at: string
  next_attempt_at: string
  sent_at: string | null
  clicked_at: string | null
  last_http_status: number | null
  platform: PushDevice['platform']
  device_name: string | null
  priority: NotificationPriority
  category: NotificationCategory
  title: string
  total_count: number
}
export interface PushMetricBucket {
  bucket_start: string
  total: number
  sent: number
  failed: number
  clicked: number
  average_attempts: number
  success_rate: number
  interaction_rate: number
}
export interface PushDeliveryOperations {
  active_devices: number
  degraded_devices: number
  pending: number
  processing: number
  sent: number
  failed: number
  clicked: number
  stale_processing: number
}
export interface WorkflowPolicy {
  id: string
  event_key: 'maintenance_dispatch'
  sector_id: number | null
  sector_name: string | null
  vehicle_category: string | null
  mode: 'notify_only' | 'ack_required' | 'approval_required'
  emergency_bypass: boolean
  enabled: boolean
  recipient_roles: string[]
  in_app_enabled: boolean
  push_enabled: boolean
  sound_enabled: boolean
  escalation_minutes: number
  notes: string | null
  updated_at: string
}
export type WorkflowPolicyInput = Omit<
  WorkflowPolicy,
  'id' | 'event_key' | 'sector_name' | 'updated_at'
>
export interface NotificationPreferences {
  user_id: string
  in_app_enabled: boolean
  sound_enabled: boolean
  push_enabled: boolean
  critical_only: boolean
  quiet_from: string | null
  quiet_to: string | null
  updated_at: string
}
export const notifications = {
  list: async (limit = 30, before?: string) =>
    ((await sdkGuard(
      supabase.rpc('notification_center', { p_limit: limit, p_before: before ?? null }),
    )) ?? []) as unknown as AppNotification[],
  unreadCount: async () => Number((await sdkGuard(supabase.rpc('notification_unread_count'))) ?? 0),
  markRead: async (id: string) => {
    await sdkGuard(supabase.rpc('notification_mark_read', { p_id: id }))
  },
  markAllRead: async () =>
    Number((await sdkGuard(supabase.rpc('notification_mark_all_read'))) ?? 0),
  dismiss: async (id: string) => {
    await sdkGuard(supabase.rpc('notification_dismiss', { p_id: id }))
  },
  preferences: async () =>
    (await sdkGuard(
      supabase.rpc('notification_get_preferences'),
    )) as unknown as NotificationPreferences,
  updatePreferences: async (input: Omit<NotificationPreferences, 'user_id' | 'updated_at'>) =>
    (await sdkGuard(
      supabase.rpc('notification_update_preferences', {
        p_in_app: input.in_app_enabled,
        p_sound: input.sound_enabled,
        p_push: input.push_enabled,
        p_critical_only: input.critical_only,
        p_quiet_from: input.quiet_from,
        p_quiet_to: input.quiet_to,
      }),
    )) as unknown as NotificationPreferences,
  workflowPolicies: async () =>
    ((await sdkGuard(supabase.rpc('notification_workflow_policies_list'))) ??
      []) as unknown as WorkflowPolicy[],
  saveWorkflowPolicy: async (id: string | null, input: WorkflowPolicyInput) =>
    (await sdkGuard(
      supabase.rpc('notification_workflow_policy_save', {
        p_id: id,
        p_sector_id: input.sector_id,
        p_vehicle_category: input.vehicle_category,
        p_mode: input.mode,
        p_emergency_bypass: input.emergency_bypass,
        p_enabled: input.enabled,
        p_recipient_roles: input.recipient_roles,
        p_in_app: input.in_app_enabled,
        p_push: input.push_enabled,
        p_sound: input.sound_enabled,
        p_escalation_minutes: input.escalation_minutes,
        p_notes: input.notes?.trim() || null,
      }),
    )) as unknown as string,
  deleteWorkflowPolicy: async (id: string) => {
    await sdkGuard(supabase.rpc('notification_workflow_policy_delete', { p_id: id }))
  },
  registerPush: async (input: {
    endpoint: string
    p256dh: string
    auth: string
    expiration: number | null
    userAgent: string
    platform: PushDevice['platform']
    deviceName: string
  }) =>
    (await sdkGuard(
      supabase.rpc('notification_register_push', {
        p_endpoint: input.endpoint,
        p_p256dh: input.p256dh,
        p_auth: input.auth,
        p_expiration: input.expiration,
        p_user_agent: input.userAgent,
        p_platform: input.platform,
        p_device_name: input.deviceName,
      }),
    )) as unknown as string,
  unregisterPush: async (endpoint: string) => {
    await sdkGuard(supabase.rpc('notification_unregister_push', { p_endpoint: endpoint }))
  },
  pushDevices: async () =>
    ((await sdkGuard(supabase.rpc('notification_push_devices'))) ?? []) as unknown as PushDevice[],
  pushDeliveryPage: async (filters: {
    hours?: number
    status?: PushDeliveryRow['status']
    platform?: PushDevice['platform']
    limit?: number
    offset?: number
  }) =>
    ((await sdkGuard(
      supabase.rpc('notification_push_delivery_page', {
        p_hours: filters.hours ?? 24,
        p_status: filters.status ?? null,
        p_platform: filters.platform ?? null,
        p_limit: filters.limit ?? 50,
        p_offset: filters.offset ?? 0,
      }),
    )) ?? []) as unknown as PushDeliveryRow[],
  pushMetrics: async (hours = 24) =>
    ((await sdkGuard(supabase.rpc('notification_push_metrics', { p_hours: hours }))) ??
      []) as unknown as PushMetricBucket[],
  batchRetryPush: async (deliveryIds: string[], reason: string) =>
    Number(
      (await sdkGuard(
        supabase.rpc('notification_push_batch_retry', {
          p_delivery_ids: deliveryIds,
          p_reason: reason.trim(),
        }),
      )) ?? 0,
    ),
  pushAdminAction: async (input: {
    action: 'retry_delivery' | 'cancel_delivery' | 'disable_device'
    deliveryId?: string
    subscriptionId?: string
    reason: string
  }) =>
    Boolean(
      await sdkGuard(
        supabase.rpc('notification_push_admin_action', {
          p_action: input.action,
          p_delivery_id: input.deliveryId ?? null,
          p_subscription_id: input.subscriptionId ?? null,
          p_reason: input.reason.trim(),
        }),
      ),
    ),
  pushOperations: async (hours = 24) => {
    const rows = ((await sdkGuard(
      supabase.rpc('notification_delivery_operations', { p_hours: hours }),
    )) ?? []) as unknown as PushDeliveryOperations[]
    return rows[0] ?? null
  },
  disablePushDevice: async (id: string) =>
    Boolean(
      await sdkGuard(supabase.rpc('notification_disable_push_device', { p_subscription_id: id })),
    ),
  recordPushInteraction: async (deliveryId: string) =>
    Boolean(
      await sdkGuard(
        supabase.rpc('notification_record_push_interaction', { p_delivery_id: deliveryId }),
      ),
    ),
  dispatchPush: async () => {
    const { error } = await supabase.functions.invoke('notification-push-dispatch', {
      body: { scope: 'self' },
    })
    if (error) throw error
  },
  subscribe: (
    userId: string,
    onChange: (payload: {
      eventType?: string
      new?: { id?: string; priority?: string; sound_allowed?: boolean }
    }) => void,
  ) => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        onChange,
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  },
}

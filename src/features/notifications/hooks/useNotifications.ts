import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notifications } from '@sdk/notifications.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
import { exportPushDeliveries } from '../export'
import {
  claimNotificationTone,
  playNotificationTone,
  recordPushInteractionFromLocation,
} from '../push.client'
export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => ['notifications', 'list'] as const,
  count: () => ['notifications', 'count'] as const,
  preferences: () => ['notifications', 'preferences'] as const,
  devices: () => ['notifications', 'devices'] as const,
}
export const useNotifications = () =>
  useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => notifications.list(),
    staleTime: 15_000,
  })
export const useNotificationRealtime = (userId?: string, soundEnabled = false) => {
  const qc = useQueryClient()
  useEffect(() => {
    if (!userId) return
    void recordPushInteractionFromLocation()
      .then((recorded) => {
        if (recorded) void qc.invalidateQueries({ queryKey: notificationKeys.all })
      })
      .catch(() => undefined)
    return notifications.subscribe(userId, (payload) => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all })
      if (payload.eventType === 'INSERT') {
        if (
          soundEnabled &&
          payload.new?.sound_allowed !== false &&
          claimNotificationTone(payload.new?.id)
        )
          playNotificationTone(payload.new?.priority === 'critical')
        void notifications.dispatchPush().catch(() => undefined)
      }
    })
  }, [qc, userId, soundEnabled])
}
export const useMarkNotificationRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notifications.markRead,
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notifications.markAllRead,
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
export const useDismissNotification = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notifications.dismiss,
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
export const usePushMetrics = (hours = 24) =>
  useQuery({
    queryKey: ['notifications', 'push-metrics', hours],
    queryFn: () => notifications.pushMetrics(hours),
    refetchInterval: 30_000,
  })
export const usePushDeliveryPage = (filters: {
  hours: number
  status?: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'
  platform?: 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown'
  offset: number
}) =>
  useQuery({
    queryKey: ['notifications', 'push-delivery-page', filters],
    queryFn: () => notifications.pushDeliveryPage({ ...filters, limit: 25 }),
    refetchInterval: 30_000,
  })
export const useExportPushDeliveries = () => {
  const toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: async (filters: {
      hours: number
      status?: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'
      platform?: 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'unknown'
    }) => {
      const rows = await notifications.pushDeliveryPage({ ...filters, limit: 100, offset: 0 })
      await exportPushDeliveries(rows)
      return rows.length
    },
    onSuccess: (count) =>
      toast({ type: 'success', message: `تم تصدير ${count} عملية تسليم مطابقة` }),
    onError: () => toast({ type: 'error', message: 'تعذر تصدير سجل تسليم Push' }),
  })
}
export const usePushBatchRetry = () => {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: { deliveryIds: string[]; reason: string }) =>
      notifications.batchRetryPush(input.deliveryIds, input.reason),
    onSuccess: (count) => {
      void qc.invalidateQueries({ queryKey: ['notifications', 'push-delivery-page'] })
      void qc.invalidateQueries({ queryKey: ['notifications', 'push-operations'] })
      void qc.invalidateQueries({ queryKey: ['notifications', 'push-metrics'] })
      toast({ type: 'success', message: `أعيدت ${count} عملية إلى طابور الإرسال` })
    },
    onError: (error) =>
      toast({ type: 'error', message: handleAppError(error, { scope: 'pushBatchRetry' }).message }),
  })
}
export const usePushAdminAction = () => {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: notifications.pushAdminAction,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', 'push-delivery-page'] })
      void qc.invalidateQueries({ queryKey: ['notifications', 'push-operations'] })
      toast({ type: 'success', message: 'تم تنفيذ إجراء Push وتسجيله في سجل التدقيق' })
    },
    onError: (error) =>
      toast({ type: 'error', message: handleAppError(error, { scope: 'pushAdmin' }).message }),
  })
}
export const usePushDeliveryOperations = () =>
  useQuery({
    queryKey: ['notifications', 'push-operations', 24],
    queryFn: () => notifications.pushOperations(24),
    refetchInterval: 30_000,
  })
export const useWorkflowPolicies = () =>
  useQuery({
    queryKey: ['notifications', 'workflow-policies'],
    queryFn: notifications.workflowPolicies,
  })
export const useSaveWorkflowPolicy = () => {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string | null
      input: Parameters<typeof notifications.saveWorkflowPolicy>[1]
    }) => notifications.saveWorkflowPolicy(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', 'workflow-policies'] })
      toast({ type: 'success', message: 'تم حفظ سياسة الإشعارات والانطلاقات' })
    },
    onError: (e) =>
      toast({ type: 'error', message: handleAppError(e, { scope: 'workflowPolicy' }).message }),
  })
}
export const useDeleteWorkflowPolicy = () => {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: notifications.deleteWorkflowPolicy,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications', 'workflow-policies'] })
      toast({ type: 'success', message: 'تم حذف السياسة المخصصة' })
    },
    onError: (e) =>
      toast({ type: 'error', message: handleAppError(e, { scope: 'workflowPolicy' }).message }),
  })
}
export const usePushDevices = () =>
  useQuery({ queryKey: notificationKeys.devices(), queryFn: notifications.pushDevices })
export const useDisablePushDevice = () => {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: notifications.disablePushDevice,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.devices() })
      void qc.invalidateQueries({ queryKey: notificationKeys.preferences() })
      toast({ type: 'success', message: 'تم إيقاف إشعارات الجهاز' })
    },
    onError: () => toast({ type: 'error', message: 'تعذر إيقاف الجهاز' }),
  })
}
export const useNotificationPreferences = () =>
  useQuery({ queryKey: notificationKeys.preferences(), queryFn: notifications.preferences })
export const useUpdateNotificationPreferences = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notifications.updatePreferences,
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.preferences() }),
  })
}

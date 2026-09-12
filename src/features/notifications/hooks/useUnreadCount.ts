import { useQuery } from '@tanstack/react-query'
import { notifications } from '@sdk/notifications.sdk'
import { notificationKeys } from './useNotifications'
export const useUnreadCount = () =>
  useQuery({
    queryKey: notificationKeys.count(),
    queryFn: notifications.unreadCount,
    staleTime: 10_000,
    refetchInterval: 60_000,
  })

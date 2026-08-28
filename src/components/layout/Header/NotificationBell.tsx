/** جرس الإشعارات — العداد الحقيقي يتصل عند تنفيذ notifications.sdk (TODO v4) */
import { Icon } from '@components/ui/Icon/Icon'
import { useUiStore } from '@stores/ui.store'

export function NotificationBell() {
  const addToast = useUiStore((s) => s.addToast)
  // TODO(v4): useUnreadCount() من features/notifications عند التنفيذ
  const unread = 0

  return (
    <button
      onClick={() =>
        addToast({ type: 'info', message: 'نظام الإشعارات قيد التطوير — سيُفعَّل قريباً' })
      }
      aria-label={unread > 0 ? `الإشعارات (${unread} غير مقروء)` : 'الإشعارات'}
      className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
    >
      <Icon name="bell" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {unread}
        </span>
      )}
    </button>
  )
}

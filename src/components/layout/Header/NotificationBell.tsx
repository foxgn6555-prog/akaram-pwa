import { useState } from 'react'
import { Icon } from '@components/ui/Icon/Icon'
import { useAuth } from '@features/auth'
import { NotificationDropdown } from '@features/notifications/components/NotificationDropdown'
import {
  useNotificationPreferences,
  useNotificationRealtime,
} from '@features/notifications/hooks/useNotifications'
import { useUnreadCount } from '@features/notifications/hooks/useUnreadCount'
export function NotificationBell() {
  const [open, setOpen] = useState(false),
    { data: user } = useAuth(),
    count = useUnreadCount(),
    preferences = useNotificationPreferences()
  useNotificationRealtime(user?.id, preferences.data?.sound_enabled === true)
  const unread = count.data ?? 0
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `الإشعارات (${unread} غير مقروء)` : 'الإشعارات'}
        className={`relative rounded-xl p-2 transition ${open ? 'bg-cyan-50 text-cyan-800' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="absolute -left-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black leading-5 text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && <NotificationDropdown onClose={() => setOpen(false)} />}
    </div>
  )
}

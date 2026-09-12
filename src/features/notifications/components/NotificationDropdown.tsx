import { useState } from 'react'
import { BellRing, CheckCheck, Settings2 } from 'lucide-react'
import {
  useDismissNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks/useNotifications'
import { NotificationItem } from './NotificationItem'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
export function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState(false)
  const q = useNotifications(),
    read = useMarkNotificationRead(),
    all = useMarkAllNotificationsRead(),
    dismiss = useDismissNotification()
  const rows = q.data ?? []
  return (
    <section
      role="dialog"
      aria-label="مركز الإشعارات"
      dir="rtl"
      className="absolute left-0 top-12 z-50 w-[min(92vw,420px)] overflow-hidden rounded-2xl border bg-white shadow-2xl"
    >
      <header className="bg-gradient-to-l from-slate-950 to-cyan-900 p-4 text-white">
        <div className="flex items-center gap-2">
          <BellRing size={19} />
          <div>
            <h2 className="font-black">مركز الإشعارات</h2>
            <p className="text-[11px] text-cyan-100">الحركات والتنبيهات المرتبطة بعملك</p>
          </div>
          <button onClick={onClose} className="mr-auto rounded-lg bg-white/10 px-2 py-1 text-xs">
            إغلاق
          </button>
        </div>
      </header>
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <button
          onClick={() => all.mutate()}
          disabled={!rows.some((x) => !x.is_read)}
          className="flex items-center gap-1 font-bold text-cyan-700 disabled:text-slate-300"
        >
          <CheckCheck size={15} />
          قراءة الكل
        </button>
        <button
          onClick={() => setSettings(true)}
          className="flex items-center gap-1 font-bold text-slate-600 hover:text-cyan-700"
        >
          <Settings2 size={14} />
          إعدادات الصوت وPush
        </button>
      </div>
      {settings && <NotificationSettingsPanel onClose={() => setSettings(false)} />}
      <div className="max-h-[65vh] overflow-y-auto">
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((x) => (
              <div key={x} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : q.isError ? (
          <p className="p-8 text-center text-sm text-rose-700">
            تعذر تحميل الإشعارات. حاول مرة أخرى.
          </p>
        ) : rows.length ? (
          rows.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              onRead={(id) => read.mutate(id)}
              onDismiss={(id) => dismiss.mutate(id)}
            />
          ))
        ) : (
          <div className="p-10 text-center">
            <BellRing className="mx-auto text-slate-300" />
            <b className="mt-3 block text-sm">لا توجد إشعارات حالياً</b>
            <p className="mt-1 text-xs text-slate-500">
              ستظهر هنا تنبيهات الانطلاقات والصيانة وGPS.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

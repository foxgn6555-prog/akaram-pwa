import { useEffect, useState } from 'react'
import { notifications, type AppNotification } from '@sdk/notifications.sdk'
import { useAuth } from '@features/auth/hooks/useAuth'

/**
 * 00417 — تذكير كل 30 يومًا (الوجه أ).
 *
 * عند الدخول، إذا كان لدى المستخدم تذكير أمني غير مقروء (category = 'security' —
 * ينشئه app.activity_monthly_report دورياً)، يظهر شريط تذكير قابل للإخفاء أعلى
 * منطقة المحتوى. يُقرَأ التذكير عند إخفائه أو النقر عليه.
 *
 * لا يغيّر أي صلاحية ولا سياسة — يعرض إشعارًا موجودًا في جرس الإشعارات.
 */
export function ActivityReminderBanner() {
  const { data: session } = useAuth()
  const userId = session?.id ?? null
  const [reminder, setReminder] = useState<AppNotification | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) {
      setReminder(null)
      return
    }
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const rows = await notifications.list(30)
        if (cancelled) return
        // أول تذكير أمني غير مقروء (أحدثها)
        const sec = rows.filter((n) => n.category === 'security' && !n.is_read)
        setReminder(sec[0] ?? null)
      } catch {
        // تذكير اختياري — لا يعيق الدخول إن فشل التحميل
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!reminder) return null

  const dismiss = (): void => {
    setBusy(true)
    void notifications.markRead(reminder.id).finally(() => {
      setBusy(false)
      setReminder(null)
    })
  }

  return (
    <div
      role="status"
      data-testid="activity-reminder-banner"
      className="flex items-start gap-3 bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-300"
    >
      <span className="flex-1">
        <span className="font-semibold">{reminder.title}</span>
        {reminder.body ? <span className="block mt-0.5 opacity-90">{reminder.body}</span> : null}
      </span>
      <button
        type="button"
        onClick={dismiss}
        disabled={busy}
        className="flex-none rounded-lg px-2 py-1 text-xs font-bold text-amber-800 hover:bg-amber-200 disabled:opacity-50"
        aria-label="إخفاء التذكير"
      >
        {busy ? '…' : 'أيقاف التذكير'}
      </button>
    </div>
  )
}

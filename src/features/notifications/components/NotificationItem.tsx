import { Link } from 'react-router'
import { BellRing, CheckCheck, MapPin, ShieldAlert, Trash2, Wrench } from 'lucide-react'
import type { AppNotification } from '@sdk/notifications.sdk'
const icons = { maintenance: Wrench, gps: MapPin, security: ShieldAlert } as const
const dt = (v: string) =>
  new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(v))
export function NotificationItem({
  item,
  onRead,
  onDismiss,
}: {
  item: AppNotification
  onRead: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const Icon = icons[item.category as keyof typeof icons] ?? BellRing
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.priority === 'critical' ? 'bg-rose-100 text-rose-700' : item.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-cyan-50 text-cyan-700'}`}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <b className="text-sm leading-5 text-slate-900">{item.title}</b>
            {!item.is_read && <span className="mt-1 size-2 shrink-0 rounded-full bg-cyan-600" />}
          </div>
          {item.body && (
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{item.body}</p>
          )}
          <time className="mt-1 block text-[10px] text-slate-400">{dt(item.created_at)}</time>
        </div>
      </div>
    </>
  )
  return (
    <article
      className={`group relative border-b p-3 transition hover:bg-slate-50 ${item.is_read ? 'bg-white' : 'bg-cyan-50/40'}`}
    >
      {item.link ? (
        <Link
          to={item.link}
          onClick={() => !item.is_read && onRead(item.id)}
          className="block pl-14"
        >
          {content}
        </Link>
      ) : (
        <div className="pl-14">{content}</div>
      )}
      <div className="absolute bottom-3 left-3 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        {!item.is_read && (
          <button
            onClick={() => onRead(item.id)}
            title="تحديد كمقروء"
            className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50"
          >
            <CheckCheck size={15} />
          </button>
        )}
        <button
          onClick={() => onDismiss(item.id)}
          title="إخفاء من المركز"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  )
}

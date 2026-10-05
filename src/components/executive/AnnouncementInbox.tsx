/**
 * وارد التبليغات لكل مستخدم (يُركَّب في كل بوابة على /<portal>/announcements/inbox) + بطاقة التبليغ + صفحة التفصيل مع الإقرار.
 * الإشعار يحمل الرابط /announcements/:id الذي يعيد التوجيه إلى بوابة المستخدم.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Link, useLocation, useParams } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon } from '@components/ui/Icon/Icon'
import { AUDIENCE_AR, PRIORITY_AR, ROLE_AR, fmtInt, useAckAnnouncement, useAnnouncement, useAnnouncementFeed, type Announcement } from '@features/executive'

const PRIO_STYLE = { normal: 'bg-slate-100 text-slate-600', important: 'bg-amber-100 text-amber-800', urgent: 'bg-red-100 text-red-800' } as const
const when = (iso: string) => new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })

export function AnnouncementCard({ a, mode, onOpen, onArchive }: { a: Announcement; mode: 'inbox' | 'sent'; onOpen?: () => void; onArchive?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const { pathname } = useLocation()
  // رابط التفصيل مطلق داخل بوابة المستخدم الحالية (يعمل من صفحة التبليغات ومن الوارد على السواء)
  const detailHref = `/${pathname.split('/')[1] ?? ''}/announcements/inbox/${a.id}`
  const unread = mode === 'inbox' && !a.my_read_at
  return (
    <article className={clsx('rounded-2xl border bg-white p-3 shadow-sm transition', unread ? 'border-slate-900/30 ring-1 ring-slate-900/10' : 'border-slate-200', a.archived_at && 'opacity-60')} data-testid="announcement-card" data-unread={unread} data-priority={a.priority}>
      <div className="flex items-start gap-2">
        {a.pinned && <Icon name="check-square" size={14} className="mt-1 shrink-0 text-slate-400" aria-label="مثبت" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', PRIO_STYLE[a.priority])}>{PRIORITY_AR[a.priority]}</span>
            {unread && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black text-white">جديد</span>}
            {a.requires_ack && <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', a.my_acked_at ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700')}>{a.my_acked_at ? 'تم الإقرار' : 'يتطلب إقراراً'}</span>}
            {a.archived_at && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">مؤرشف</span>}
          </div>
          <h3 className="mt-1 text-sm font-black text-slate-900">{mode === 'inbox' ? <Link to={detailHref} className="hover:underline" data-testid="ann-open-link">{a.title}</Link> : a.title}</h3>
          <p className={clsx('mt-1 whitespace-pre-wrap text-[12px] leading-6 text-slate-700', !expanded && 'line-clamp-2')}>{a.body}</p>
          {a.body.length > 140 && <button type="button" onClick={() => setExpanded((x) => !x)} className="text-[11px] font-bold text-slate-500 hover:underline">{expanded ? 'إخفاء' : 'عرض الكل'}</button>}
          <p className="mt-1 text-[10px] text-slate-400">{ROLE_AR[a.publisher_role] ?? a.publisher_role} — {a.publisher_name} · {when(a.published_at)} · {AUDIENCE_AR[a.audience_kind]}{a.expires_at ? ` · ينتهي ${when(a.expires_at)}` : ''}</p>
        </div>
        {mode === 'sent' && (
          <div className="flex shrink-0 flex-col items-end gap-1 text-[10px]">
            <button type="button" onClick={onOpen} className="rounded-xl bg-slate-100 px-2 py-1 font-bold text-slate-700 hover:bg-slate-200" data-testid="ann-stats">
              <span className="tabular-nums">{fmtInt(a.read_count)}/{fmtInt(a.recipients_count)}</span> قرأ{a.requires_ack && <> · <span className="tabular-nums">{fmtInt(a.ack_count)}</span> أقرّ</>}
            </button>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${a.recipients_count ? Math.round((a.read_count / a.recipients_count) * 100) : 0}%` }} /></div>
            {onArchive && <button type="button" onClick={onArchive} className="text-red-600 hover:underline" data-testid="ann-archive">أرشفة</button>}
          </div>
        )}
      </div>
    </article>
  )
}

/** الوارد داخل أي بوابة */
export default function AnnouncementInbox() {
  const { data, isLoading } = useAnnouncementFeed('inbox')
  return (
    <div className="space-y-3" data-testid="announcement-inbox">
      <header><h1 className="text-xl font-black">التبليغات الواردة</h1><p className="text-xs text-slate-500">منشورات الإدارة الموجَّهة إليك — افتح التبليغ لتسجيل اطلاعك</p></header>
      {isLoading && <LoadingSpinner />}
      {!isLoading && !data?.length && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">لا تبليغات واردة</p>}
      {data?.map((a) => <AnnouncementCard key={a.id} a={a} mode="inbox" />)}
    </div>
  )
}

/** تفصيل تبليغ واحد — فتحه يسجّل القراءة؛ زر الإقرار عند الطلب */
export function AnnouncementDetail() {
  const { announcementId } = useParams()
  const { data: a, isLoading, error } = useAnnouncement(announcementId ?? null)
  const ack = useAckAnnouncement()
  if (isLoading) return <LoadingSpinner />
  if (error || !a) return <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="ann-detail-error">تعذّر فتح التبليغ — قد لا يكون موجَّهاً إليك.</p>
  return (
    <article className="mx-auto max-w-2xl space-y-4" data-testid="announcement-detail">
      <Link to=".." relative="path" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:underline"><Icon name="chevron-right" size={14} />كل التبليغات</Link>
      <div className={clsx('rounded-3xl border p-5 shadow-sm', a.priority === 'urgent' ? 'border-red-200 bg-red-50/40' : a.priority === 'important' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white')}>
        <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', PRIO_STYLE[a.priority])}>{PRIORITY_AR[a.priority]}</span>
        <h1 className="mt-2 text-xl font-black">{a.title}</h1>
        <p className="mt-1 text-[11px] text-slate-500">{ROLE_AR[a.publisher_role] ?? a.publisher_role} — {a.publisher_name} · {when(a.published_at)}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-8 text-slate-800">{a.body}</p>
        {a.requires_ack && (
          <div className="mt-5 rounded-2xl bg-white/80 p-3 ring-1 ring-slate-200">
            {a.my_acked_at ? <p className="text-xs font-bold text-emerald-700" data-testid="acked">✓ سجّلت إقرارك بالاطلاع في {when(a.my_acked_at)}</p>
              : <button type="button" onClick={() => ack.mutate(a.id)} disabled={ack.isPending} className="h-10 w-full rounded-xl bg-slate-900 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50" data-testid="ack-btn">أقرّ بأنني اطلعت على هذا التبليغ</button>}
          </div>
        )}
      </div>
    </article>
  )
}

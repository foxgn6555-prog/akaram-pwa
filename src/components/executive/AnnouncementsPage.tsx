/**
 * «التبليغات» — نشر منشور داخل المنصة يصل للجهة المقصودة أو للمنصة كاملة مع إشعار فوري للمستهدفين،
 * ومتابعة من قرأ ومن أقرّ. الصادر للناشر، والوارد لكل مستخدم.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon } from '@components/ui/Icon/Icon'
import {
  AUDIENCE_AR, PRIORITY_AR, ROLE_AR, fmtInt, useAnnouncementFeed, useAnnouncementRecipients, useAnnouncementTargets, useArchiveAnnouncement, usePublishAnnouncement,
  type Announcement, type AnnouncementInput, type AnnouncementPriority, type AudienceKind,
} from '@features/executive'
import { AnnouncementCard } from './AnnouncementInbox'

const field = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm'
const lbl = 'mb-1 block text-xs font-semibold text-slate-600'

export function AnnouncementsPage({ canPublish = true }: { canPublish?: boolean }) {
  const [tab, setTab] = useState<'compose' | 'sent' | 'inbox'>(canPublish ? 'sent' : 'inbox')
  return (
    <div className="space-y-4" data-testid="announcements-page">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-black">التبليغات</h1><p className="text-xs text-slate-500">منشورات داخلية موجَّهة — تصل كإشعار فوري للمستهدفين مع متابعة القراءة والإقرار</p></div>
        {canPublish && <button type="button" onClick={() => setTab('compose')} className="inline-flex h-9 items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-black text-white shadow hover:bg-slate-800" data-testid="new-announcement"><Icon name="send" size={14} />تبليغ جديد</button>}
      </header>
      <nav className="flex gap-1 rounded-2xl bg-slate-100 p-1 text-xs font-bold" data-testid="ann-tabs">
        {canPublish && <Tab active={tab === 'compose'} onClick={() => setTab('compose')} id="compose">إنشاء</Tab>}
        {canPublish && <Tab active={tab === 'sent'} onClick={() => setTab('sent')} id="sent">الصادر</Tab>}
        <Tab active={tab === 'inbox'} onClick={() => setTab('inbox')} id="inbox">الوارد إليّ</Tab>
      </nav>
      {tab === 'compose' && canPublish && <Compose onDone={() => setTab('sent')} />}
      {tab === 'sent' && canPublish && <SentList />}
      {tab === 'inbox' && <InboxList />}
    </div>
  )
}
function Tab({ active, onClick, children, id }: { active: boolean; onClick: () => void; children: React.ReactNode; id: string }) {
  return <button type="button" onClick={onClick} data-testid={`tab-${id}`} aria-pressed={active} className={clsx('h-8 flex-1 rounded-xl transition', active ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-700')}>{children}</button>
}

// ── الإنشاء ──
export function Compose({ onDone }: { onDone: () => void }) {
  const { data: targets, isLoading } = useAnnouncementTargets()
  const publish = usePublishAnnouncement()
  const [v, setV] = useState<AnnouncementInput>({ title: '', body: '', priority: 'normal', audience_kind: 'all', roles: [], departments: [], users: [], requires_ack: false, pinned: false, expires_at: null })
  const [userQuery, setUserQuery] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const recipients = useMemo(() => {
    if (!targets) return 0
    if (v.audience_kind === 'all') return targets.total_users
    if (v.audience_kind === 'roles') return targets.roles.filter((r) => v.roles.includes(r.role)).reduce((s, r) => s + r.count, 0)
    if (v.audience_kind === 'departments') return targets.departments.filter((d) => v.departments.includes(d.id)).reduce((s, d) => s + d.count, 0)
    return v.users.length
  }, [targets, v])

  const toggle = (k: 'roles' | 'departments' | 'users', id: string) => setV((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }))
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null)
    if (v.title.trim().length < 3) return setErr('عنوان التبليغ مطلوب (3 أحرف على الأقل)')
    if (v.body.trim().length < 3) return setErr('نص التبليغ مطلوب')
    if (v.audience_kind !== 'all' && recipients === 0) return setErr('اختر جهة مستهدفة واحدة على الأقل')
    publish.mutate({ ...v, title: v.title.trim(), body: v.body.trim() }, { onSuccess: onDone })
  }
  const filteredUsers = (targets?.users ?? []).filter((u) => !userQuery || u.name.includes(userQuery) || (u.department ?? '').includes(userQuery)).slice(0, 60)

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3" data-testid="ann-compose">
      <div className="space-y-3 lg:col-span-2">
        <div><label htmlFor="ann-title" className={lbl}>العنوان</label><input id="ann-title" className={field} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={160} placeholder="مثال: تعميم بشأن الدوام الرسمي" data-testid="ann-title" /></div>
        <div><label htmlFor="ann-body" className={lbl}>نص التبليغ</label><textarea id="ann-body" className={clsx(field, 'h-40 resize-y py-2 leading-7')} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} maxLength={6000} placeholder="اكتب نص التبليغ بوضوح…" data-testid="ann-body" /><p className="mt-0.5 text-[10px] text-slate-400">{v.body.length} / 6000</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><span className={lbl}>الأولوية</span><div className="flex gap-1">{(['normal', 'important', 'urgent'] as AnnouncementPriority[]).map((p) => <button key={p} type="button" onClick={() => setV({ ...v, priority: p })} aria-pressed={v.priority === p} data-testid={`prio-${p}`} className={clsx('h-9 flex-1 rounded-xl border text-xs font-bold', v.priority === p ? (p === 'urgent' ? 'border-red-600 bg-red-600 text-white' : p === 'important' ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-900 bg-slate-900 text-white') : 'border-slate-300 bg-white text-slate-600')}>{PRIORITY_AR[p]}</button>)}</div></div>
          <div><label htmlFor="ann-exp" className={lbl}>ينتهي في (اختياري)</label><input id="ann-exp" type="datetime-local" className={field} value={v.expires_at ?? ''} onChange={(e) => setV({ ...v, expires_at: e.target.value || null })} data-testid="ann-expires" /></div>
          <div className="flex flex-col justify-end gap-1 text-xs font-bold text-slate-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.requires_ack} onChange={(e) => setV({ ...v, requires_ack: e.target.checked })} data-testid="ann-ack" />يتطلب إقراراً بالاطلاع</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.pinned} onChange={(e) => setV({ ...v, pinned: e.target.checked })} data-testid="ann-pinned" />مثبَّت في أعلى الوارد</label>
          </div>
        </div>
      </div>
      <aside className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
        <span className={lbl}>الجهة المستهدفة</span>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(AUDIENCE_AR) as AudienceKind[]).map((k) => <button key={k} type="button" onClick={() => setV({ ...v, audience_kind: k })} aria-pressed={v.audience_kind === k} data-testid={`aud-${k}`} className={clsx('h-9 rounded-xl border text-[11px] font-bold', v.audience_kind === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600')}>{AUDIENCE_AR[k]}</button>)}
        </div>
        {isLoading && <LoadingSpinner />}
        {targets && v.audience_kind === 'roles' && (
          <ul className="max-h-64 space-y-1 overflow-auto text-xs" data-testid="aud-roles-list">{targets.roles.map((r) => <li key={r.role}><label className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5"><span className="flex items-center gap-2"><input type="checkbox" checked={v.roles.includes(r.role)} onChange={() => toggle('roles', r.role)} />{ROLE_AR[r.role] ?? r.role}</span><span className="text-[10px] text-slate-400">{fmtInt(r.count)}</span></label></li>)}</ul>
        )}
        {targets && v.audience_kind === 'departments' && (
          <ul className="max-h-64 space-y-1 overflow-auto text-xs" data-testid="aud-depts-list">{targets.departments.map((d) => <li key={d.id}><label className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5"><span className="flex items-center gap-2"><input type="checkbox" checked={v.departments.includes(d.id)} onChange={() => toggle('departments', d.id)} />{d.name}</span><span className="text-[10px] text-slate-400">{fmtInt(d.count)} حساب</span></label></li>)}</ul>
        )}
        {targets && v.audience_kind === 'users' && (
          <div className="space-y-1">
            <input className={clsx(field, 'h-9')} placeholder="ابحث بالاسم أو القسم…" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} data-testid="aud-user-search" />
            <ul className="max-h-56 space-y-1 overflow-auto text-xs" data-testid="aud-users-list">{filteredUsers.map((u) => <li key={u.id}><label className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5"><span className="flex items-center gap-2"><input type="checkbox" checked={v.users.includes(u.id)} onChange={() => toggle('users', u.id)} />{u.name}</span><span className="text-[10px] text-slate-400">{u.department ?? ''}</span></label></li>)}</ul>
          </div>
        )}
        <div className="rounded-2xl bg-white p-3 text-center" data-testid="recipients-preview"><p className="text-[11px] text-slate-500">سيصل التبليغ إلى</p><p className="text-2xl font-black tabular-nums">{fmtInt(recipients)}</p><p className="text-[10px] text-slate-400">مستخدماً — إشعار فوري + الوارد</p></div>
        {err && <p className="rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700" data-testid="ann-error">{err}</p>}
        <button type="submit" disabled={publish.isPending} className="h-10 w-full rounded-xl bg-slate-900 text-sm font-black text-white shadow hover:bg-slate-800 disabled:opacity-50" data-testid="ann-submit">{publish.isPending ? 'جارٍ النشر…' : 'نشر التبليغ'}</button>
      </aside>
    </form>
  )
}

// ── الصادر ──
function SentList() {
  const [archived, setArchived] = useState(false)
  const { data, isLoading } = useAnnouncementFeed('sent', archived)
  const [open, setOpen] = useState<Announcement | null>(null)
  const archive = useArchiveAnnouncement()
  if (isLoading) return <LoadingSpinner />
  return (
    <div className="space-y-2" data-testid="sent-list">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} data-testid="show-archived" />إظهار المؤرشفة</label>
      {!data?.length && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">لا تبليغات صادرة بعد</p>}
      {data?.map((a) => (
        <AnnouncementCard key={a.id} a={a} mode="sent" onOpen={() => setOpen(a)}
          onArchive={a.archived_at ? undefined : () => { const reason = window.prompt('سبب الأرشفة (اختياري)') ?? undefined; archive.mutate({ id: a.id, reason }) }} />
      ))}
      {open && <RecipientsModal a={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function RecipientsModal({ a, onClose }: { a: Announcement; onClose: () => void }) {
  const { data, isLoading } = useAnnouncementRecipients(a.id)
  const [q, setQ] = useState('')
  const rows = (data ?? []).filter((r) => !q || r.full_name.includes(q) || (r.department_name ?? '').includes(q))
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" data-testid="recipients-modal" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 p-4"><div><h3 className="text-sm font-black">{a.title}</h3><p className="text-[11px] text-slate-500">{fmtInt(a.recipients_count)} مستلم · قرأ {fmtInt(a.read_count)}{a.requires_ack ? ` · أقرّ ${fmtInt(a.ack_count)}` : ''}</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-slate-100" aria-label="إغلاق"><Icon name="x" size={16} /></button></header>
        <div className="p-3"><input className={clsx(field, 'h-9')} placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="max-h-[60dvh] overflow-auto px-3 pb-3">
          {isLoading && <LoadingSpinner />}
          <ul className="divide-y divide-slate-100 text-xs">
            {rows.map((r) => (
              <li key={r.user_id} className="flex items-center justify-between gap-2 py-2" data-testid="recipient-row">
                <span><span className="font-bold">{r.full_name}</span>{r.department_name && <span className="text-[10px] text-slate-400"> · {r.department_name}</span>}</span>
                <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', r.acked_at ? 'bg-emerald-50 text-emerald-700' : r.read_at ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500')}>{r.acked_at ? 'أقرّ' : r.read_at ? 'قرأ' : 'لم يقرأ'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── الوارد ──
function InboxList() {
  const { data, isLoading } = useAnnouncementFeed('inbox')
  if (isLoading) return <LoadingSpinner />
  return (
    <div className="space-y-2" data-testid="inbox-list">
      {!data?.length && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">لا تبليغات واردة</p>}
      {data?.map((a) => <AnnouncementCard key={a.id} a={a} mode="inbox" />)}
    </div>
  )
}

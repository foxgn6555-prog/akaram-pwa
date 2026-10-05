/** غرفة العمليات — وحدة «استقبال الشكاوى» (00168):
 *  ① شكاوى المواطنين الواردة من الصفحة العامة: فلترة، تفاصيل، صور، موقع، إسناد لمسؤول قسم (⇒ قيد المعالجة)، تعليق/إنجاز بسبب، ملاحظات.
 *  ② الدعم الفني المباشر: طابور الطلبات، استلام المحادثة، الرد، الإغلاق.
 *  ③ التقرير: مؤشرات الفترة (تذهب أيضاً لبوابتي معاون المدير المفوض والمدير المفوض).
 *  ④ إعدادات الصفحة العامة: النبذة، أرقام التواصل، ساعات العمل، العنوان، ورابط النشر. */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import { Archive, Check, Copy, ExternalLink, Headset, Images, Link2, MapPin, MessageSquareText, Phone, Printer, Search, Send, Settings2, Star, UserCheck, X } from 'lucide-react'
import {
  CITIZEN_STATUS_LABEL, CITIZEN_STATUS_ORDER, useAddCitizenNote, useAssignCitizenComplaint, useCitizenInfo, useCitizenManagers, useCitizenPhotoUrls, useCitizenPublicUrl, useCitizenQueue,
  useOpsChatActions, useOpsChatDays, useOpsChatHistory, useOpsChatSession, useOpsCitizenComplaints, useSaveCitizenSettings, useSetCitizenStatus, type CitizenChat, type CitizenComplaint, type CitizenStatus,
} from '@features/citizen'
import { CitizenReportPanel } from '@components/citizen/CitizenReportPanel'
import { baghdadDay } from '@features/media/constants'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

type Tab = 'complaints' | 'support' | 'archive' | 'report' | 'settings'
const TABS: Array<{ key: Tab; label: string; icon: typeof Headset }> = [
  { key: 'complaints', label: 'شكاوى المواطنين', icon: MessageSquareText }, { key: 'support', label: 'الدعم الفني المباشر', icon: Headset }, { key: 'archive', label: 'أرشيف المحادثات', icon: Archive },
  { key: 'report', label: 'التقرير', icon: Printer }, { key: 'settings', label: 'صفحة المواطن', icon: Settings2 },
]
export const STATUS_TONE: Record<CitizenStatus, string> = {
  new: 'bg-sky-100 text-sky-800', in_progress: 'bg-amber-100 text-amber-900', on_hold: 'bg-slate-200 text-slate-800', resolved: 'bg-emerald-100 text-emerald-800',
}
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const ageHours = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 36e5))

export default function OpsCitizenComplaintsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'complaints') as Tab
  const { data: queue = [] } = useCitizenQueue(true)
  const waiting = queue.filter((q) => q.status === 'waiting').length
  return (
    <section className="space-y-4" dir="rtl" data-testid="ops-citizen-page">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-blue-950 to-sky-900 p-5 text-white shadow-xl">
        <h1 className="text-xl font-black sm:text-2xl">استقبال الشكاوى</h1>
        <p className="mt-1 text-xs leading-6 text-blue-100">شكاوى المواطنين من الصفحة العامة والدعم الفني المباشر — لا تصبح الشكوى «قيد المعالجة» إلا بإسنادها لمسؤول قسم.</p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="التبويبات">
        {TABS.map(({ key, label, icon: I }) => (
          <button key={key} type="button" onClick={() => setParams((p) => { p.set('tab', key); p.delete('c'); return p })} className={clsx('inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black', tab === key ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200')} data-testid={`tab-${key}`}>
            <I size={16} />{label}{key === 'support' && waiting > 0 && <span className="rounded-full bg-red-600 px-2 text-[11px] text-white">{waiting}</span>}
          </button>
        ))}
      </nav>
      {tab === 'complaints' && <ComplaintsTab selectedId={params.get('c')} onSelect={(id) => setParams((p) => { if (id) p.set('c', id); else p.delete('c'); return p })} />}
      {tab === 'support' && <SupportTab />}
      {tab === 'archive' && <ArchiveTab />}
      {tab === 'report' && <ReportTab />}
      {tab === 'settings' && <SettingsTab />}
    </section>
  )
}

// ═══════════════ ① الشكاوى ═══════════════
function ComplaintsTab({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [status, setStatus] = useState<CitizenStatus | null>(null); const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const { data = [], isLoading } = useOpsCitizenComplaints({ status, search, from: from || null, to: to || null })
  const counts = useMemo(() => CITIZEN_STATUS_ORDER.map((s) => [s, data.filter((c) => c.status === s).length] as const), [data])
  const selected = data.find((c) => c.id === selectedId) ?? null
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(360px,1.1fr)]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {counts.map(([s, n]) => <button key={s} type="button" onClick={() => setStatus(status === s ? null : s)} className={clsx('rounded-2xl p-3 text-right ring-1 ring-slate-200', status === s ? 'bg-slate-900 text-white' : 'bg-white')} data-testid={`count-${s}`}><p className="text-[11px] font-bold opacity-80">{CITIZEN_STATUS_LABEL[s]}</p><p className="text-2xl font-black">{n}</p></button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={15} className="text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم / اسم / هاتف / نص" className="w-full py-2 text-sm outline-none" aria-label="بحث" /></label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-2 text-xs" aria-label="من" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-2 text-xs" aria-label="إلى" />
        </div>
        {isLoading && <LoadingSpinner />}
        {!isLoading && !data.length && <div className="rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">لا توجد شكاوى مطابقة</div>}
        <ul className="space-y-2" data-testid="cc-list">
          {data.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onSelect(c.id)} className={clsx('w-full rounded-2xl bg-white p-3 text-right ring-1 transition hover:shadow', selectedId === c.id ? 'ring-2 ring-sky-500' : 'ring-slate-200')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="text-[11px] font-black tracking-wider text-sky-800" dir="ltr">{c.ref_no}</p><p className="truncate text-sm font-black">{c.full_name}</p><p className="text-[11px] text-slate-500" dir="ltr">{c.phone}</p></div>
                  <span className={clsx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black', STATUS_TONE[c.status])}>{c.status_label}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{c.details}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span>{fmt(c.created_at)}</span>{c.status === 'new' && <span className={clsx('font-bold', ageHours(c.created_at) >= 24 ? 'text-red-600' : 'text-amber-700')}>بلا إسناد منذ {ageHours(c.created_at)} س</span>}
                  {c.assignee_name && <span className="inline-flex items-center gap-1"><UserCheck size={12} />{c.assignee_name}</span>}
                  {c.lat != null && <span className="inline-flex items-center gap-1"><MapPin size={12} />موقع</span>}{c.photos.length > 0 && <span className="inline-flex items-center gap-1"><Images size={12} />{c.photos.length}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="lg:sticky lg:top-2 lg:self-start">
        {selected ? <ComplaintDetail c={selected} onClose={() => onSelect(null)} /> : <div className="hidden rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-slate-500 lg:block">اختر شكوى لعرض تفاصيلها</div>}
      </div>
    </div>
  )
}

export function ComplaintDetail({ c, onClose, managerMode = false }: { c: CitizenComplaint; onClose?: () => void; managerMode?: boolean }) {
  const paths = useMemo(() => c.photos.map((p) => p.path), [c.photos])
  const { data: urls = {} } = useCitizenPhotoUrls(paths)
  const { data: managers = [] } = useCitizenManagers()
  const assign = useAssignCitizenComplaint(); const setStatus = useSetCitizenStatus(); const addNote = useAddCitizenNote()
  const [manager, setManager] = useState(''); const [note, setNote] = useState(''); const [action, setAction] = useState<'on_hold' | 'resolved' | 'note' | null>(null)
  useEffect(() => { setManager(c.assigned_to ?? ''); setAction(null); setNote('') }, [c.id, c.assigned_to])
  const busy = assign.isPending || setStatus.isPending || addNote.isPending
  const mapsUrl = c.lat != null ? `https://www.google.com/maps?q=${c.lat},${c.lng}` : null
  return (
    <article className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid="cc-detail">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-xs font-black tracking-wider text-sky-800" dir="ltr">{c.ref_no}</p><h2 className="text-lg font-black">{c.full_name}</h2>
          <a href={`tel:${c.phone}`} dir="ltr" className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><Phone size={13} />{c.phone}</a></div>
        <div className="flex items-center gap-2"><span className={clsx('rounded-full px-3 py-1 text-xs font-black', STATUS_TONE[c.status])}>{c.status_label}</span>{onClose && <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X size={16} /></button>}</div>
      </div>
      <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-7">{c.details}</p>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <p className="rounded-xl bg-slate-50 p-2"><b>الاستلام:</b> {fmt(c.created_at)}</p>
        <p className="rounded-xl bg-slate-50 p-2"><b>المسؤول:</b> {c.assignee_name ?? 'غير مسندة'}{c.assigned_at ? ` · ${fmt(c.assigned_at)}` : ''}</p>
        {(c.address_text || mapsUrl) && <p className="rounded-xl bg-slate-50 p-2 sm:col-span-2"><b>الموقع:</b> {c.address_text ?? ''} {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-sky-700" data-testid="cc-map-link"><MapPin size={12} />فتح الخريطة ({c.lat}, {c.lng})</a>}</p>}
        {c.hold_reason && <p className="rounded-xl bg-slate-100 p-2 sm:col-span-2"><b>سبب التعليق:</b> {c.hold_reason}</p>}
        {c.resolution_note && <p className="rounded-xl bg-emerald-50 p-2 text-emerald-900 sm:col-span-2"><b>نتيجة المعالجة:</b> {c.resolution_note}{c.citizen_rating ? ` · تقييم المواطن ${c.citizen_rating}/5` : ''}</p>}
      </div>
      {c.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2" data-testid="cc-photos">
          {c.photos.map((p) => urls[p.path] ? <a key={p.id} href={urls[p.path]} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl ring-1 ring-slate-200"><img src={urls[p.path]} alt="صورة الشكوى" className="h-full w-full object-cover" loading="lazy" /></a> : <div key={p.id} className="aspect-square animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      )}
      {!managerMode && c.status !== 'resolved' && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3" data-testid="cc-assign">
          <p className="text-xs font-black text-sky-900">{c.assigned_to ? 'إعادة الإسناد لمسؤول قسم' : 'إسناد لمسؤول قسم (⇒ قيد المعالجة)'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={manager} onChange={(e) => setManager(e.target.value)} className="min-w-[200px] flex-1 rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm" aria-label="مسؤول القسم">
              <option value="">— اختر مسؤول القسم —</option>{managers.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}{m.department_name ? ` · ${m.department_name}` : ''}</option>)}
            </select>
            <button type="button" disabled={!manager || manager === c.assigned_to || busy} onClick={() => assign.mutate({ id: c.id, userId: manager })} className="inline-flex items-center gap-1 rounded-xl bg-sky-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50" data-testid="cc-assign-btn"><UserCheck size={15} />إسناد</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {c.status !== 'resolved' && c.assigned_to && <button type="button" onClick={() => setAction('resolved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">تمت المعالجة</button>}
        {c.status !== 'resolved' && c.status !== 'on_hold' && <button type="button" onClick={() => setAction('on_hold')} className="rounded-xl bg-slate-700 px-3 py-2 text-xs font-black text-white">تعليق</button>}
        {c.status === 'on_hold' && c.assigned_to && <button type="button" disabled={busy} onClick={() => setStatus.mutate({ id: c.id, status: 'in_progress' })} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white">استئناف المعالجة</button>}
        {!managerMode && c.status === 'resolved' && <button type="button" disabled={busy} onClick={() => setStatus.mutate({ id: c.id, status: 'new' })} className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-black">إعادة فتح</button>}
        <button type="button" onClick={() => setAction('note')} className="rounded-xl bg-white px-3 py-2 text-xs font-black ring-1 ring-slate-300">+ ملاحظة</button>
      </div>
      {action && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (action === 'note') addNote.mutate({ id: c.id, note }, { onSuccess: () => setAction(null) }); else setStatus.mutate({ id: c.id, status: action, note }, { onSuccess: () => setAction(null) }) }} className="space-y-2 rounded-2xl bg-slate-50 p-3" data-testid="cc-action-form">
          <p className="text-xs font-black">{action === 'resolved' ? 'نتيجة المعالجة (تظهر للمواطن)' : action === 'on_hold' ? 'سبب التعليق (يظهر للمواطن)' : 'ملاحظة داخلية'}</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} required minLength={3} className="w-full rounded-xl border border-slate-300 p-2 text-sm" data-testid="cc-action-note" />
          <div className="flex gap-2"><button type="submit" disabled={busy || note.trim().length < 3} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50">حفظ</button><button type="button" onClick={() => setAction(null)} className="rounded-xl px-3 py-2 text-xs font-bold">إلغاء</button></div>
        </form>
      )}
      <details className="text-xs"><summary className="cursor-pointer font-black text-slate-600">سجل المتابعة ({c.events.length})</summary>
        <ol className="mt-2 space-y-1 border-r-2 border-slate-200 pr-3">{c.events.map((e, i) => <li key={i}><span className="text-slate-400">{fmt(e.at)}</span> · <b>{e.actor ?? ''}</b> — {e.kind === 'created' ? 'استلام الشكوى' : e.kind === 'assigned' ? 'إسناد' : e.kind === 'status' ? `الحالة → ${e.to_label}` : e.kind === 'rated' ? `تقييم المواطن ${e.note}` : 'ملاحظة'}{e.note && e.kind !== 'rated' ? `: ${e.note}` : ''}</li>)}</ol>
      </details>
    </article>
  )
}

// ═══════════════ ② الدعم المباشر ═══════════════
function SupportTab() {
  const { data: queue = [], isLoading } = useCitizenQueue(true)
  const [sid, setSid] = useState<string | null>(null)
  const { data: chat } = useOpsChatSession(sid)
  const { accept, send, close } = useOpsChatActions()
  const [text, setText] = useState(''); const endRef = useRef<HTMLDivElement>(null)
  const n = chat?.messages.length ?? 0
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [n, sid])
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_1.4fr]">
      <div className="space-y-2" data-testid="chat-queue">
        <h2 className="text-sm font-black">الطلبات ({queue.filter((q) => q.status !== 'closed').length})</h2>
        {isLoading && <LoadingSpinner />}
        {!isLoading && !queue.length && <div className="rounded-3xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">لا توجد طلبات محادثة الآن</div>}
        {queue.map((q) => (
          <button key={q.id} type="button" onClick={() => setSid(q.id)} className={clsx('w-full rounded-2xl bg-white p-3 text-right ring-1', sid === q.id ? 'ring-2 ring-sky-500' : 'ring-slate-200')} data-testid="queue-item">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-black">{q.citizen_name}</p>
              <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', q.status === 'waiting' ? 'animate-pulse bg-red-100 text-red-700' : q.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>{q.status === 'waiting' ? 'بانتظار الرد' : q.status === 'active' ? (q.mine ? 'معي' : q.agent_name) : 'مغلقة'}</span></div>
            <p className="text-[11px] text-slate-500" dir="ltr">{q.phone}</p>
            {q.last_message && <p className="mt-1 line-clamp-1 text-xs text-slate-600">{q.last_message}</p>}
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400"><span>{fmt(q.last_at ?? q.requested_at)}</span>{q.unread > 0 && q.status !== 'closed' && <span className="rounded-full bg-sky-600 px-1.5 text-white">{q.unread}</span>}</div>
          </button>
        ))}
      </div>
      <div>
        {!sid || !chat ? <div className="hidden rounded-3xl border border-dashed bg-white p-10 text-center text-sm text-slate-500 lg:block">اختر محادثة</div> : (
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200" data-testid="ops-chat">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div><p className="text-sm font-black">{chat.citizen_name}</p><p className="text-[11px] text-slate-500" dir="ltr">{chat.phone}</p></div>
              <div className="flex gap-2">
                {chat.status === 'waiting' && <button type="button" onClick={() => accept.mutate(sid)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white" data-testid="chat-accept">استلام المحادثة</button>}
                {chat.status !== 'closed' && <button type="button" onClick={() => close.mutate(sid)} className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-black text-red-700">إغلاق</button>}
                {chat.status === 'closed' && <span className="text-xs font-bold text-slate-500">مغلقة{chat.rating ? ` · تقييم ${chat.rating}/5` : ''}</span>}
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
              <ChatMessages chat={chat} />
              <div ref={endRef} />
            </div>
            {chat.status !== 'closed' && (
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); if (text.trim()) send.mutate({ id: sid, body: text.trim() }, { onSuccess: () => setText('') }) }} className="flex items-center gap-2 border-t border-slate-100 p-3">
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="اكتب الرد…" className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none" data-testid="ops-chat-input" />
                <button type="submit" disabled={!text.trim() || send.isPending} className="grid h-11 w-11 place-items-center rounded-xl bg-sky-700 text-white disabled:opacity-50" aria-label="إرسال"><Send size={18} /></button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** فقاعات المحادثة (مشتركة بين الدعم الحيّ والأرشيف) — تعرض صور المواطن بروابط موقّعة */
function ChatMessages({ chat }: { chat: CitizenChat }) {
  const paths = chat.messages.map((m) => m.attachment).filter((p): p is string => !!p)
  const { data: urls } = useCitizenPhotoUrls(paths)
  return (
    <>
      {chat.messages.map((m) => (
        <div key={m.id} className={clsx('flex', m.sender === 'agent' ? 'justify-start' : m.sender === 'citizen' ? 'justify-end' : 'justify-center')}>
          <div className={clsx('max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6', m.sender === 'agent' ? 'bg-sky-700 text-white' : m.sender === 'citizen' ? 'bg-white ring-1 ring-slate-200' : 'bg-amber-50 text-[11px] text-amber-900')}>
            {m.attachment && (urls?.[m.attachment]
              ? <a href={urls[m.attachment]} target="_blank" rel="noreferrer"><img src={urls[m.attachment]} alt="صورة من المواطن" className="mb-1 max-h-64 rounded-xl object-cover" data-testid="ops-chat-image" /></a>
              : <div className="mb-1 grid h-24 w-40 place-items-center rounded-xl bg-slate-100 text-[10px] text-slate-500">جارٍ تحميل الصورة…</div>)}
            {m.body !== '📷 صورة' && <p className="whitespace-pre-wrap">{m.body}</p>}
            <p className={clsx('mt-1 text-[10px]', m.sender === 'agent' ? 'text-sky-100' : 'text-slate-400')}>{new Date(m.at).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      ))}
    </>
  )
}

// ═══════════════ ③ أرشيف المحادثات — حسب اليوم ═══════════════
function ArchiveTab() {
  const { data: days = [], isLoading } = useOpsChatDays()
  const [day, setDay] = useState<string | null>(null)
  const [sid, setSid] = useState<string | null>(null)
  const current = day ?? days[0]?.day ?? null
  const { data: items = [], isFetching } = useOpsChatHistory(current)
  const { data: chat } = useOpsChatSession(sid)
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const mins = (n: number | null) => (n === null ? '—' : n < 60 ? `${n} د` : `${Math.floor(n / 60)} س ${n % 60} د`)
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.7fr)_1.6fr]" data-testid="chat-archive">
      <div className="space-y-2">
        <label className="block rounded-2xl bg-white p-3 ring-1 ring-slate-200 text-xs font-bold">اختر يوماً
          <input type="date" value={current ?? ''} max={baghdadDay()} onChange={(e) => { setDay(e.target.value || null); setSid(null) }} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-xs" data-testid="archive-date" />
        </label>
        <h2 className="px-1 text-xs font-black text-slate-600">الأيام التي فيها محادثات</h2>
        {isLoading && <LoadingSpinner />}
        {!isLoading && !days.length && <div className="rounded-3xl border border-dashed bg-white p-6 text-center text-xs text-slate-500">لا توجد محادثات مؤرشفة بعد</div>}
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto" data-testid="archive-days">
          {days.map((d) => (
            <li key={d.day}>
              <button type="button" onClick={() => { setDay(d.day); setSid(null) }} className={clsx('flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-right text-xs ring-1', current === d.day ? 'ring-2 ring-sky-500' : 'ring-slate-200')} data-testid="archive-day">
                <span><b>{dayLabel(d.day)}</b><span className="block text-[10px] text-slate-400" dir="ltr">{d.day}</span></span>
                <span className="text-left"><span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black text-white">{d.count}</span>{d.avg_rating !== null && <span className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-amber-600"><Star size={10} className="fill-amber-400" />{d.avg_rating}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        {current && (
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black">محادثات {dayLabel(current)}</h2><span className="text-xs text-slate-500">{items.length} محادثة{isFetching ? ' · تحديث…' : ''}</span></div>
            {!items.length && !isFetching && <p className="mt-3 rounded-xl border border-dashed p-4 text-center text-xs text-slate-500" data-testid="archive-empty">لا توجد محادثات في هذا اليوم</p>}
            {items.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs" data-testid="archive-table">
                  <thead><tr className="bg-slate-50 text-right text-[11px] text-slate-500"><th className="p-2">المواطن</th><th className="p-2">الوقت</th><th className="p-2">الموظف</th><th className="p-2">انتظار</th><th className="p-2">المدة</th><th className="p-2">رسائل</th><th className="p-2">التقييم</th><th className="p-2">الحالة</th></tr></thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} onClick={() => setSid(it.id)} className={clsx('cursor-pointer border-t border-slate-100 hover:bg-sky-50', sid === it.id && 'bg-sky-50')} data-testid="archive-row">
                        <td className="p-2"><b>{it.citizen_name}</b><span className="block text-[10px] text-slate-400" dir="ltr">{it.phone}</span></td>
                        <td className="p-2 tabular-nums">{new Date(it.requested_at).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="p-2">{it.agent_name ?? '—'}</td>
                        <td className="p-2">{mins(it.wait_minutes)}</td>
                        <td className="p-2">{mins(it.duration_minutes)}</td>
                        <td className="p-2">{it.messages}{it.attachments ? <span className="mr-1 inline-flex items-center gap-0.5 text-[10px] text-slate-500"><Images size={10} />{it.attachments}</span> : null}</td>
                        <td className="p-2">{it.rating ? <span className="inline-flex items-center gap-0.5 text-amber-600"><Star size={11} className="fill-amber-400" />{it.rating}</span> : '—'}</td>
                        <td className="p-2"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', it.status === 'closed' ? 'bg-slate-100 text-slate-600' : it.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>{it.status === 'closed' ? `مغلقة${it.closed_by === 'citizen' ? ' (المواطن)' : it.closed_by === 'agent' ? ' (الموظف)' : ''}` : it.status === 'active' ? 'جارية' : 'بانتظار'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {sid && chat && (
          <div className="flex max-h-[60vh] flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200" data-testid="archive-transcript">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div><p className="text-sm font-black">{chat.citizen_name}</p><p className="text-[11px] text-slate-500">{chat.agent_name ? `الموظف: ${chat.agent_name}` : 'لم تُستلم'} · {fmt(chat.requested_at)}{chat.rating ? ` · تقييم ${chat.rating}/5${chat.rating_note ? ` — ${chat.rating_note}` : ''}` : ''}</p></div>
              <button type="button" onClick={() => setSid(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="إغلاق"><X size={16} /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4"><ChatMessages chat={chat} /></div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════ ④ التقرير ═══════════════
function ReportTab() {
  const today = baghdadDay()
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`); const [to, setTo] = useState(today)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200 print:hidden">
        <label className="text-xs font-bold">من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-2 text-xs" /></label>
        <label className="text-xs font-bold">إلى <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-2 text-xs" /></label>
        <button type="button" onClick={() => window.print()} className="mr-auto inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"><Printer size={14} />طباعة</button>
      </div>
      <CitizenReportPanel from={from} to={to} />
    </div>
  )
}

// ═══════════════ ⑤ إعدادات الصفحة ═══════════════
function SettingsTab() {
  const { data: info } = useCitizenInfo(); const save = useSaveCitizenSettings(); const url = useCitizenPublicUrl()
  const [about, setAbout] = useState(''); const [hours, setHours] = useState(''); const [address, setAddress] = useState(''); const [orgName, setOrgName] = useState('')
  const [phones, setPhones] = useState<Array<{ label: string; number: string }>>([]); const [copied, setCopied] = useState(false)
  useEffect(() => { if (info) { setAbout(info.about); setHours(info.hours); setAddress(info.address ?? ''); setOrgName(info.org_name); setPhones(info.phones ?? []) } }, [info])
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate({ about, hours, address: address || null, orgName, phones: phones.filter((p) => p.number.trim()) }) }} className="space-y-4" data-testid="cc-settings">
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <p className="flex items-center gap-2 text-sm font-black"><Link2 size={16} />رابط صفحة المواطن للنشر</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code dir="ltr" className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs" data-testid="public-url">{url}</code>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'نُسخ' : 'نسخ'}</button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black ring-1 ring-slate-300"><ExternalLink size={14} />فتح</a>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">انشر هذا الرابط على صفحات الشركة ولوحات الأحياء — لا يحتاج المواطن أي حساب.</p>
      </div>
      <div className="grid gap-4 rounded-3xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2">
        <label className="text-xs font-black sm:col-span-2">اسم الجهة<input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-black sm:col-span-2">النبذة التعريفية<textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-black">ساعات الدعم<input value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="text-xs font-black">العنوان<input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
        <div className="sm:col-span-2">
          <p className="text-xs font-black">أرقام التواصل</p>
          {phones.map((p, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <input value={p.label} onChange={(e) => setPhones((o) => o.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="الوصف (الخط الساخن)" className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <input value={p.number} onChange={(e) => setPhones((o) => o.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} placeholder="07XXXXXXXXX" dir="ltr" className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <button type="button" onClick={() => setPhones((o) => o.filter((_, j) => j !== i))} className="rounded-xl px-2 text-red-600" aria-label="حذف"><X size={16} /></button>
            </div>
          ))}
          <button type="button" onClick={() => setPhones((o) => [...o, { label: '', number: '' }])} className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">+ رقم</button>
        </div>
      </div>
      <button type="submit" disabled={save.isPending} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50">حفظ</button>
    </form>
  )
}



/**
 * الجولة ٥ — صندوق تذاكر «الدعم الفني» المرسلة من داخل البوابات.
 * المصدر: support_tickets (محروس بدالة support_tickets_list: تقنية المعلومات فقط).
 * استعلامات مباشرة بحالة محلية مثل بقية هذه الصفحة — بلا مزوّد استعلامات.
 */
import { useCallback, useEffect, useState } from 'react'
import { Image as ImageIcon, LifeBuoy, RefreshCw } from 'lucide-react'
import {
  support,
  type SupportStatus,
  type SupportTicket,
} from '@sdk/support.sdk'

const STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد المعالجة',
  resolved: 'معالَجة',
  closed: 'مغلقة',
}
const STATUS_CLASS: Record<SupportStatus, string> = {
  open: 'bg-amber-100 text-amber-900',
  in_progress: 'bg-sky-100 text-sky-900',
  resolved: 'bg-emerald-100 text-emerald-900',
  closed: 'bg-slate-200 text-slate-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  critical: 'حرجة',
}
const FILTERS: { id: SupportStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'open', label: 'مفتوحة' },
  { id: 'in_progress', label: 'قيد المعالجة' },
  { id: 'resolved', label: 'معالَجة' },
  { id: 'closed', label: 'مغلقة' },
]

export function PortalTicketsPanel() {
  const [filter, setFilter] = useState<SupportStatus | 'all'>('all')
  const [rows, setRows] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [images, setImages] = useState<Record<string, string>>({})

  const load = useCallback(async (next: SupportStatus | 'all') => {
    setLoading(true)
    setError('')
    try {
      setRows(await support.list(next === 'all' ? null : next))
    } catch {
      setError('تعذّر تحميل تذاكر الدعم — تحقق من صلاحية تقنية المعلومات.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filter)
  }, [filter, load])

  const decide = async (ticket: SupportTicket, status: SupportStatus): Promise<void> => {
    setBusyId(ticket.id)
    setError('')
    try {
      await support.decide(ticket.id, status, note.trim() || null)
      setNote('')
      await load(filter)
    } catch {
      setError('تعذّر تحديث التذكرة')
    } finally {
      setBusyId('')
    }
  }

  const showImages = async (ticket: SupportTicket): Promise<void> => {
    try {
      setImages(await support.attachmentUrls(ticket.attachment_paths))
    } catch {
      setError('تعذّر جلب المرفقات')
    }
  }

  return (
    <div className="space-y-4" data-testid="portal-tickets">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <LifeBuoy size={18} className="text-brand-700" />
          <div>
            <h2 className="text-sm font-black">تذاكر الدعم الواردة من البوابات</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              الطلبات المرسلة من زر «الدعم الفني» داخل أي بوابة. صاحب التذكرة يُشعَر تلقائياً عند التحديث.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(filter)}
          disabled={loading}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
              filter === f.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800" role="alert">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-xs text-slate-400">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
          لا تذاكر في هذا التصنيف.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-800">
                    #{t.ticket_number} · {t.title}
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {PRIORITY_LABEL[t.priority] ?? t.priority}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t.requester_name ?? '—'} · {t.source_portal ?? '—'} ·{' '}
                    {new Date(t.created_at).toLocaleString('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' })}
                    {t.contact_phone ? ` · ${t.contact_phone}` : ''}
                  </p>
                </div>
                {t.attachment_paths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void showImages(t)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700"
                  >
                    <ImageIcon size={13} /> {t.attachment_paths.length} مرفق
                  </button>
                )}
              </div>

              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">{t.description}</p>

              {t.attachment_paths.some((p) => images[p]) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.attachment_paths.filter((p) => images[p]).map((p) => (
                    <a key={p} href={images[p]} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-lg border border-slate-200">
                      <img src={images[p]} alt="مرفق التذكرة" className="size-full object-cover" />
                    </a>
                  ))}
                </div>
              )}

              {t.admin_note && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">ملاحظة: {t.admin_note}</p>}

              {t.status !== 'closed' && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    placeholder="ملاحظة تُرسل لصاحب التذكرة (اختياري)"
                    className="h-9 min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 text-xs"
                  />
                  {(['in_progress', 'resolved', 'closed'] as SupportStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busyId === t.id || t.status === s}
                      onClick={() => void decide(t, s)}
                      className="h-9 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

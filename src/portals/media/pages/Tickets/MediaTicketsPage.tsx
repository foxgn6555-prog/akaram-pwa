/**
 * وحدة قاطع (كرادة/الزعفرانية) — تذكرات الصور الواردة من مسؤولي الأقسام
 * فتح التذكرة: عرض الصور مفلترة حسب النوع + تعديل المعلومات + تحديد → إرسال للتصميم
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Archive, Images, Pencil, Send, Ticket } from 'lucide-react'
import {
  autoPeriodType,
  MODE_LABEL,
  PERIODS,
  SECTOR_LABEL,
  WORK_TYPES,
  type MediaMode,
  type PeriodType,
  type SectorParent,
} from '@features/media/constants'
import {
  useAddDesignPhotos,
  useArchiveSubmission,
  useCreateDesign,
  useDesigns,
  useMediaTemplates,
  useSubmissionPhotos,
  useSubmissions,
  useUpdatePhotoCaption,
  useUpdateSubmission,
} from '@features/media/hooks'
import PhotoGrid from '../../components/PhotoGrid'
import { DayFilter } from '../../components/DayFilter'
import { baghdadDay } from '@features/media/constants'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))

export default function MediaTicketsPage({ sector }: { sector: SectorParent }) {
  const [workType, setWorkType] = useState('')
  const [day, setDay] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const tickets = useSubmissions(sector, 'active', workType || null)
  const rows = (tickets.data ?? []).filter(
    (t) => !day || (t.event_date ?? t.created_at).slice(0, 10) === day,
  )
  const photoTotal = rows.reduce((sum, t) => sum + t.photo_count, 0)

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-cyan-900 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <Ticket size={17} />
          تذكرات الصور الواردة من مسؤولي الأقسام
        </p>
        <h1 className="mt-2 text-2xl font-black">{SECTOR_LABEL[sector]} — التذكرات</h1>
        <p className="mt-1 text-sm text-cyan-100">
          افتح التذكرة، راجع الصور حسب النوع، عدّل المعلومات، ثم حدّد الصور وأرسلها للتصميم.
        </p>
      </header>

      <div className="space-y-3 rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="تصفية حسب النوع"
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            className="h-11 rounded-xl border px-3 text-sm"
          >
            <option value="">كل الأنواع</option>
            {WORK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <DayFilter value={day} onChange={setDay} />
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-black">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">{rows.length} تذكرة</span>
          <span className="rounded-full bg-cyan-50 px-3 py-1.5 text-cyan-800">{photoTotal} صورة</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">
            {rows.filter((t) => (t.event_date ?? t.created_at).slice(0, 10) === baghdadDay()).length} تذكرة اليوم
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {rows.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpenId(t.id)}
            className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 text-right shadow-sm transition hover:border-cyan-400"
          >
            <span
              className={`rounded-lg px-2 py-1 text-[11px] font-black text-white ${
                t.mode === 'campaign' ? 'bg-emerald-700' : t.mode === 'school' ? 'bg-violet-700' : 'bg-slate-700'
              }`}
            >
              {MODE_LABEL[t.mode as MediaMode] ?? t.mode}
            </span>
            <b className="text-sm">{t.title}</b>
            {t.work_type && (
              <span className="rounded-full bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-800">{t.work_type}</span>
            )}
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Images size={13} />
              {t.photo_count} صورة
            </span>
            <span className="mr-auto text-xs text-slate-400">
              {t.submitted_by_name} · {dt(t.created_at)}
            </span>
          </button>
        ))}
        {!tickets.isLoading && rows.length === 0 && (
          <p className="rounded-2xl border bg-white p-12 text-center text-slate-500">
            <Ticket className="mx-auto mb-2 text-slate-300" size={32} />
            لا توجد تذكرات {workType ? `من نوع «${workType}»` : 'حالياً'} في هذا القاطع.
          </p>
        )}
      </div>

      {openId && <TicketDialog sector={sector} ticketId={openId} close={() => setOpenId(null)} />}
    </section>
  )
}

function TicketDialog({
  sector,
  ticketId,
  close,
}: {
  sector: SectorParent
  ticketId: string
  close: () => void
}) {
  const navigate = useNavigate()
  const tickets = useSubmissions(sector)
  const ticket = (tickets.data ?? []).find((t) => t.id === ticketId)
  const photos = useSubmissionPhotos(ticketId)
  const update = useUpdateSubmission()
  const updateCaption = useUpdatePhotoCaption()
  const archive = useArchiveSubmission()
  const createDesign = useCreateDesign()
  const addDesignPhotos = useAddDesignPhotos()
  const designs = useDesigns(sector)
  const templates = useMediaTemplates()
  const [templateId, setTemplateId] = useState('')
  const sectorTemplates = (templates.data ?? []).filter(
    (t) => t.status === 'active' && (t.sector_parent === null || t.sector_parent === sector),
  )

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [period, setPeriod] = useState<PeriodType>(autoPeriodType())
  const [title, setTitle] = useState(ticket?.title ?? '')
  const [workType, setWorkType] = useState(ticket?.work_type ?? '')
  const [eventDate, setEventDate] = useState((ticket?.event_date ?? '').slice(0, 10))
  const [notes, setNotes] = useState(ticket?.notes ?? '')
  const [captionEdit, setCaptionEdit] = useState<Record<string, string>>({})

  const photoItems = useMemo(
    () =>
      (photos.data ?? []).map((p) => ({
        id: p.id,
        path: p.storage_path,
        caption: captionEdit[p.id] ?? p.caption,
      })),
    [photos.data, captionEdit],
  )

  if (!ticket) {
    return (
      <DialogShell title="تذكرة" close={close}>
        <p className="py-10 text-center text-sm text-slate-500">
          {photos.isLoading ? (
            <LoadingSpinner label="جارٍ فتح التذكرة…" />
          ) : (
            'التذكرة غير موجودة أو أُغلقت.'
          )}
        </p>
      </DialogShell>
    )
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const saveInfo = () => {
    update.mutate(
      [ticket.id, { title, workType: workType || null, eventDate: eventDate || null, notes }],
      { onSuccess: close },
    )
  }

  const sendToDesign = async () => {
    if (!selected.size) return
    const chosen = (photos.data ?? []).filter((p) => selected.has(p.id))
    const payload = chosen.map((p) => ({
      photoId: p.id,
      workType: ticket.work_type ?? 'عام',
      caption: captionEdit[p.id] ?? p.caption ?? '',
    }))
    // يوجد تصميم لنفس الدورة؟ أضِف إليه، وإلا أنشئ جديداً
    const existing = (designs.data ?? []).find(
      (d) => d.period_type === period && d.status === 'draft',
    )
    try {
      let designId = existing?.id
      if (existing) {
        const d = await addDesignPhotos.mutateAsync([existing.id, payload])
        designId = d.id
      } else {
        const tpl = sectorTemplates.find((t) => t.id === templateId)
        const d = await createDesign.mutateAsync([
          sector,
          tpl?.period_type ? (tpl.period_type as PeriodType) : period,
          tpl?.title?.trim()
            ? tpl.title.trim()
            : `${SECTOR_LABEL[sector]} — تصميم ${PERIODS.find((p) => p.value === period)?.label ?? ''}`,
          tpl?.cover_path ?? null,
          payload,
        ])
        designId = d.id
      }
      close()
      navigate(`/media/designs?open=${designId}`)
    } catch {
      // الخطأ معروض عبر toast
    }
  }

  return (
    <DialogShell title={`تذكرة: ${ticket.title}`} close={close} wide>
      {/* معلومات التذكرة (قابلة للتعديل) */}
      <section className="rounded-2xl bg-slate-50 p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-black">
          <Pencil size={14} />
          معلومات التذكرة (قابلة للتعديل)
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm"
            placeholder="العنوان"
          />
          <select
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            className="h-10 rounded-xl border bg-white px-3 text-sm"
          >
            <option value="">دون نوع عمل</option>
            {WORK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm"
            placeholder="ملاحظات"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={saveInfo}
            disabled={update.isPending}
            className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-40"
          >
            حفظ التعديلات
          </button>
          <button
            onClick={() => archive.mutate([ticket.id, 'أُرشفت بعد المتابعة'], { onSuccess: close })}
            disabled={archive.isPending}
            className="flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-bold text-slate-600 disabled:opacity-40"
          >
            <Archive size={13} />
            أرشفة التذكرة
          </button>
          <span className="mr-auto self-center text-[11px] text-slate-400">
            {MODE_LABEL[ticket.mode as MediaMode] ?? ticket.mode} · {ticket.submitted_by_name} ·{' '}
            {dt(ticket.created_at)}
          </span>
        </div>
      </section>

      {/* الصور — محددة للتصميم */}
      <section className="mt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-black">الصور ({photoItems.length})</h3>
          <span className="text-xs text-slate-500">
            {selected.size ? `المحدد للتصميم: ${selected.size}` : 'حدّد الصور التي تدخل التصميم'}
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set((photos.data ?? []).map((p) => p.id)))}
            className="mr-auto rounded-lg border px-2 py-1 text-[11px] font-bold text-cyan-800 hover:bg-cyan-50"
          >
            تحديد الكل
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50"
            >
              إلغاء التحديد
            </button>
          )}
        </div>
        {photos.isLoading ? (
          <LoadingSpinner label="جارٍ تحميل الصور…" />
        ) : (
          <PhotoGrid items={photoItems} selectable selected={selected} onToggle={toggle} />
        )}
        {/* وصف الصورة المختارة */}
        {selected.size > 0 && (
          <details className="mt-3 rounded-xl border bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-600">
              تعديل أوصاف الصور المحددة ({selected.size})
            </summary>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {(photos.data ?? [])
                .filter((p) => selected.has(p.id))
                .map((p) => (
                  <label key={p.id} className="block text-xs">
                    <span className="mb-1 block truncate text-[10px] text-slate-400">{p.storage_path}</span>
                    <input
                      defaultValue={p.caption ?? ''}
                      onChange={(e) => setCaptionEdit((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={() =>
                        updateCaption.mutate([p.id, captionEdit[p.id] ?? p.caption ?? ''])
                      }
                      className="h-9 w-full rounded-lg border px-2"
                      placeholder="وصف الصورة"
                    />
                  </label>
                ))}
            </div>
          </details>
        )}
      </section>

      {/* الإرسال للتصميم */}
      <section className="mt-4 rounded-2xl bg-emerald-900 p-4 text-white">
        <div className="flex flex-wrap items-center gap-3">
          <b className="text-sm">إرسال المحدد ({selected.size}) إلى التصميم</b>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodType)}
            className="h-10 rounded-xl bg-white/10 px-3 text-sm"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value} className="text-slate-900">
                {p.label}
              </option>
            ))}
          </select>
          <select
            aria-label="قالب التصميم"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="h-10 rounded-xl bg-white/10 px-3 text-sm"
          >
            <option value="" className="text-slate-900">
              بدون قالب
            </option>
            {sectorTemplates.map((t) => (
              <option key={t.id} value={t.id} className="text-slate-900">
                قالب: {t.title}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-emerald-200">
            الصور المحددة فقط تدخل التصميم — التذكرة كاملة تبقى في فولدر {SECTOR_LABEL[sector]}
          </span>
          <button
            onClick={sendToDesign}
            disabled={!selected.size || createDesign.isPending || addDesignPhotos.isPending}
            className="mr-auto flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-emerald-900 disabled:opacity-40"
          >
            <Send size={15} />
            إرسال للتصميم
          </button>
        </div>
      </section>
    </DialogShell>
  )
}

export function DialogShell({
  title,
  close,
  children,
  wide = false,
}: {
  title: string
  close: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className={`max-h-[94vh] w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} overflow-y-auto rounded-3xl bg-white p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button onClick={close} className="rounded-lg border px-3 py-1 text-sm font-bold">
            إغلاق
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

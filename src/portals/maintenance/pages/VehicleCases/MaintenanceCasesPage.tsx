import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, History, Package, Paperclip, Timer, UserCog, Wrench } from 'lucide-react'
import {
  useMaintenanceCompleteCase,
  useMaintenanceConfirmArrival,
  useMaintenanceDays,
  useMaintenanceDispatch,
  useMaintenanceEvents,
  useMaintenanceForDay,
  useMaintenanceInventory,
  useMaintenanceTechnicianOptions,
  useMaintenanceTimeline,
  useMaintenanceUploadAttachment,
} from '@features/vehicle-operations/hooks'
import { money } from '@features/vehicle-operations/purchase-schemas'
import type { MaintenanceCase } from '@sdk/vehicle-operations.sdk'

const labels: Record<string, string> = {
  to_maintenance: 'في الطريق إلى الصيانة',
  at_maintenance: 'قيد التشخيص والإصلاح',
  diagnosing: 'قيد التشخيص والإصلاح',
  waiting_parts: 'قيد التشخيص والإصلاح',
  in_repair: 'قيد التشخيص والإصلاح',
  paused: 'قيد التشخيص والإصلاح',
  ready: 'جاهزة للإرسال',
  to_work: 'في الطريق إلى العمل',
  to_garage: 'في الطريق إلى الكراج',
  returned_to_work: 'عادت إلى العمل',
  closed_at_garage: 'أُغلقت في الكراج',
}
const priorityLabels: Record<string, string> = { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة', critical: 'حرجة' }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))
const minutesText = (m: number | null | undefined) =>
  m === null || m === undefined ? '—' : m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`
/** الحالة داخل الورشة قبل الإنهاء (وقت الصيانة يعدّ تلقائياً) */
const inWorkshop = (c: MaintenanceCase) => Boolean(c.arrived_at) && !c.readiness_approved_at && !c.completed_at && c.status !== 'to_maintenance'

/** عدّاد حي: الدقائق منذ الوصول حتى الآن (أو حتى مغادرة الصيانة) */
function useElapsed(from: string | null, until: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [until])
  if (!from) return null
  const end = until ? new Date(until).getTime() : now
  return Math.max(0, Math.round((end - new Date(from).getTime()) / 60000))
}

export default function MaintenanceCasesPage() {
  const [day, setDay] = useState(today()),
    [finishing, setFinishing] = useState<MaintenanceCase | null>(null),
    [detail, setDetail] = useState<MaintenanceCase | null>(null)
  const days = useMaintenanceDays(),
    q = useMaintenanceForDay(day),
    arrival = useMaintenanceConfirmArrival(),
    dispatch = useMaintenanceDispatch()
  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-rose-800 p-6 text-white">
        <p className="flex gap-2 text-xs">
          <Wrench size={16} />
          وصول → تشخيص وإصلاح (الوقت يُحسب تلقائياً) → إنهاء الصيانة → إرسال
        </p>
        <h1 className="mt-2 text-2xl font-black">حالات صيانة الآليات</h1>
      </header>
      <section className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="size-5 text-rose-700" />
          <b>مجلدات أيام الصيانة</b>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="mr-auto h-9 rounded-xl border px-2" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(days.data ?? []).map((x) => (
            <button key={x.case_day} onClick={() => setDay(x.case_day)} className={`min-w-40 rounded-xl border p-3 text-xs ${day === x.case_day ? 'border-rose-600 bg-rose-50' : ''}`}>
              <b>{x.case_day}</b>
              <span className="mt-1 block">{x.total_count} حالة · {x.open_count} مفتوحة</span>
            </button>
          ))}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {(q.data ?? []).map((c) => (
          <CaseCard key={c.case_id} c={c} onArrival={() => arrival.mutate({ caseId: c.case_id })} onFinish={() => setFinishing(c)} onDetail={() => setDetail(c)} onDispatch={(destination) => dispatch.mutate({ caseId: c.case_id, destination })} />
        ))}
      </div>
      {!(q.data ?? []).length && <p className="rounded-2xl border bg-white p-12 text-center text-slate-500">لا توجد حالات في هذا اليوم.</p>}
      {finishing && <FinishDialog item={finishing} close={() => setFinishing(null)} />}
      {detail && <DetailsDialog item={detail} close={() => setDetail(null)} />}
    </section>
  )
}

function CaseCard({ c, onArrival, onFinish, onDetail, onDispatch }: { c: MaintenanceCase; onArrival: () => void; onFinish: () => void; onDetail: () => void; onDispatch: (d: 'work_site' | 'garage') => void }) {
  const elapsed = useElapsed(c.arrived_at, c.departed_maintenance_at ?? c.completed_at)
  const done = Boolean(c.readiness_approved_at)
  return (
    <article className="rounded-3xl border bg-white p-5 shadow-sm" data-testid={`case-${c.case_id}`}>
      <div className="flex justify-between">
        <div>
          <b className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white">DB {c.db_number}</b>
          <h2 className="mt-3 font-black">{c.vehicle_name}</h2>
          <p className="text-xs text-slate-500">{c.driver_name} · {c.area_name} · {c.manager_name}</p>
        </div>
        <span className={`h-fit rounded-full px-3 py-1 text-xs font-black ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{labels[c.status] ?? c.status}</span>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-3 text-xs" data-testid={`case-summary-${c.case_id}`}>
        <dt className="text-slate-500">العطل</dt><dd className="font-bold">{c.fault_type} · {priorityLabels[c.priority] ?? c.priority}</dd>
        <dt className="text-slate-500">البلاغ</dt><dd className="font-bold">{dt(c.reported_at)}</dd>
        <dt className="text-slate-500">الوصول</dt><dd className="font-bold">{c.arrived_at ? dt(c.arrived_at) : 'لم تصل بعد'}</dd>
        {c.arrived_at && (<><dt className="flex items-center gap-1 text-slate-500"><Timer size={12} />وقت الصيانة</dt><dd className="font-black text-rose-800" data-testid={`elapsed-${c.case_id}`}>{minutesText(elapsed)}{!done && ' (مستمر)'}</dd></>)}
        {(c.technicians || c.assigned_technician) && (<><dt className="text-slate-500">الفنيون</dt><dd className="font-bold">{c.technicians ?? c.assigned_technician}</dd></>)}
        {c.parts_summary && (<><dt className="text-slate-500">القطع</dt><dd className="font-bold">{c.parts_summary}</dd></>)}
        {c.diagnosis && (<><dt className="text-slate-500">التشخيص</dt><dd className="font-bold">{c.diagnosis}</dd></>)}
        {c.work_notes && (<><dt className="text-slate-500">الأعمال</dt><dd className="font-bold">{c.work_notes}</dd></>)}
        {done && (<><dt className="text-slate-500">الكلفة</dt><dd className="font-bold">قطع {money(c.parts_actual_cost ?? 0)}{Number(c.service_cost) > 0 ? ` + أجور ${money(c.service_cost)}` : ''} = {money(c.actual_cost ?? 0)} د.ع</dd></>)}
      </dl>
      <button onClick={onDetail} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border font-bold">
        <History size={15} />
        السجل والمرفقات
      </button>
      {c.status === 'to_maintenance' && (
        <button onClick={onArrival} className="mt-3 h-11 w-full rounded-xl bg-emerald-700 font-black text-white">تأكيد وصول الآلية إلى الصيانة</button>
      )}
      {inWorkshop(c) && (
        <button data-testid={`finish-${c.case_id}`} onClick={onFinish} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 font-black text-white">
          <CheckCircle2 size={16} />
          إنهاء الصيانة وإدخال البيانات
        </button>
      )}
      {c.status === 'ready' && done && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => onDispatch('work_site')} className="h-11 rounded-xl bg-cyan-700 text-xs font-black text-white">إعادتها إلى موقع العمل</button>
          <button onClick={() => onDispatch('garage')} className="h-11 rounded-xl bg-slate-800 text-xs font-black text-white">إرسالها إلى الكراج</button>
        </div>
      )}
    </article>
  )
}

/** نموذج الإنهاء الواحد: الفنيون + القطع من المخزن + التشخيص والأعمال + أجور خارجية (اختياري) */
function FinishDialog({ item, close }: { item: MaintenanceCase; close: () => void }) {
  const complete = useMaintenanceCompleteCase(),
    options = useMaintenanceTechnicianOptions(),
    inventory = useMaintenanceInventory()
  const [techIds, setTechIds] = useState<string[]>([]),
    [parts, setParts] = useState<{ itemId: string; quantity: number }[]>([]),
    [diagnosis, setDiagnosis] = useState(item.diagnosis ?? ''),
    [workNotes, setWorkNotes] = useState(item.work_notes ?? ''),
    [serviceCost, setServiceCost] = useState<number | ''>('')
  const stock = new Map((inventory.data ?? []).map((s) => [s.id, s]))
  const partsCost = parts.reduce((sum, p) => sum + p.quantity * (stock.get(p.itemId)?.average_unit_cost ?? 0), 0)
  const grouped = new Map<string, NonNullable<typeof options.data>>()
  for (const o of options.data ?? []) grouped.set(o.specialty_label, [...(grouped.get(o.specialty_label) ?? []), o])
  const missing = [
    techIds.length === 0 ? 'اختيار فني' : null,
    !diagnosis.trim() ? 'التشخيص' : null,
    !workNotes.trim() ? 'الأعمال المنفذة' : null,
    parts.some((p) => !p.itemId || p.quantity <= 0) ? 'إكمال سطور القطع' : null,
  ].filter(Boolean) as string[]
  const toggleTech = (id: string) => setTechIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4">
      <form
        data-testid="finish-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (missing.length) return
          complete.mutate(
            { caseId: item.case_id, diagnosis, workNotes, technicianIds: techIds, parts: parts.filter((p) => p.itemId), serviceCost: serviceCost === '' ? 0 : Number(serviceCost) },
            { onSuccess: close },
          )
        }}
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">إنهاء الصيانة · DB {item.db_number}</h2>
            <p className="text-xs text-slate-500">{item.vehicle_name} · {item.fault_type}</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg border px-3 py-1 text-xs">إغلاق</button>
        </div>

        <h3 className="mt-5 flex items-center gap-1 text-sm font-black"><UserCog size={15} />الفنيون الذين عملوا على الآلية</h3>
        {[...grouped.entries()].map(([spec, list]) => (
          <div key={spec} className="mt-2">
            <span className="text-[11px] font-bold text-slate-500">{spec}</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {list.map((o) => (
                <label key={o.employee_id} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold ${techIds.includes(o.employee_id) ? 'border-indigo-700 bg-indigo-700 text-white' : 'bg-white'}`}>
                  <input type="checkbox" className="sr-only" data-testid={`tech-${o.employee_id}`} checked={techIds.includes(o.employee_id)} onChange={() => toggleTech(o.employee_id)} />
                  {o.full_name}
                </label>
              ))}
            </div>
          </div>
        ))}
        {!options.isLoading && !(options.data ?? []).length && (
          <p className="mt-2 text-xs text-amber-700">لا يوجد فنيون بعد — يُضبط «تخصص صيانة» على المسمى الوظيفي في الهيكل التنظيمي (HR) ثم يُوظَّف الفنيون عليه.</p>
        )}

        <h3 className="mt-5 flex items-center gap-1 text-sm font-black"><Package size={15} />المواد المستخدمة من المخزن</h3>
        <div className="mt-2 space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2">
              <select data-testid={`part-item-${i}`} value={p.itemId} onChange={(e) => setParts((s) => s.map((x, k) => (k === i ? { ...x, itemId: e.target.value } : x)))} className="h-10 rounded-xl border px-2 text-sm">
                <option value="">اختر مادة…</option>
                {(inventory.data ?? []).map((s) => (
                  <option key={s.id} value={s.id} disabled={s.current_quantity <= 0}>{s.item_name} — متاح {s.current_quantity} {s.unit}</option>
                ))}
              </select>
              <input data-testid={`part-qty-${i}`} type="number" min="0.001" step="0.001" value={p.quantity} onChange={(e) => setParts((s) => s.map((x, k) => (k === i ? { ...x, quantity: Number(e.target.value) } : x)))} className="h-10 rounded-xl border px-2 text-sm" aria-label="الكمية" />
              <button type="button" onClick={() => setParts((s) => s.filter((_, k) => k !== i))} className="h-10 rounded-xl border px-3 text-xs">حذف</button>
            </div>
          ))}
          <button type="button" data-testid="add-part" onClick={() => setParts((s) => [...s, { itemId: '', quantity: 1 }])} className="h-10 rounded-xl border border-dashed px-4 text-xs font-bold">+ إضافة مادة</button>
        </div>

        <label className="mt-5 block text-xs font-bold text-slate-600">
          التشخيص (وصف العطل)
          <textarea data-testid="finish-diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="mt-1 min-h-16 w-full rounded-xl border p-3 text-sm" />
        </label>
        <label className="mt-3 block text-xs font-bold text-slate-600">
          الأعمال المنفذة
          <textarea data-testid="finish-work-notes" value={workNotes} onChange={(e) => setWorkNotes(e.target.value)} className="mt-1 min-h-16 w-full rounded-xl border p-3 text-sm" />
        </label>
        <label className="mt-3 block text-xs font-bold text-slate-600">
          أجور خارجية (اختياري، د.ع)
          <input data-testid="finish-service-cost" type="number" min="0" value={serviceCost} onChange={(e) => setServiceCost(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 h-10 w-full rounded-xl border px-3 text-sm" placeholder="0" />
        </label>
        <p className="mt-3 rounded-xl bg-slate-900 p-3 text-xs text-white" data-testid="finish-cost">
          كلفة المواد (تلقائية من المخزن): <b>{money(partsCost)}</b>{Number(serviceCost) > 0 ? <> + أجور <b>{money(Number(serviceCost))}</b></> : null} = <b>{money(partsCost + Number(serviceCost || 0))} د.ع</b>
        </p>
        {missing.length > 0 && <p data-testid="finish-missing" className="mt-3 text-xs font-bold text-amber-800">المطلوب: {missing.join('، ')}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={close} className="h-11 rounded-xl border">إلغاء</button>
          <button disabled={missing.length > 0 || complete.isPending} className="h-11 rounded-xl bg-rose-700 font-black text-white disabled:opacity-50">إنهاء الصيانة</button>
        </div>
      </form>
    </div>
  )
}

function DetailsDialog({ item, close }: { item: MaintenanceCase; close: () => void }) {
  const q = useMaintenanceTimeline(item.case_id),
    events = useMaintenanceEvents(item.case_id),
    upload = useMaintenanceUploadAttachment()
  const [file, setFile] = useState<File | null>(null),
    [caption, setCaption] = useState('')
  const refresh = () => {
    void q.refetch()
    void events.refetch()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6">
        <div className="flex justify-between">
          <h2 className="text-xl font-black">السجل الكامل · DB {item.db_number}</h2>
          <button onClick={close}>إغلاق</button>
        </div>
        <section
          className="mt-5 rounded-2xl bg-slate-950 p-4 text-white"
          aria-label="التسلسل الزمني لدورة الصيانة"
        >
          <h3 className="flex items-center gap-2 font-black">
            <History size={16} />
            التسلسل الزمني الموحد
          </h3>
          <p className="mt-1 text-[11px] text-slate-300">
            من تسجيل العطل إلى تأكيد الوصول الفعلي والعودة.
          </p>
          <div className="mt-4 space-y-1">
            {(events.data ?? []).map((event, index) => (
              <article key={event.event_key} className="relative flex gap-3 pb-4">
                <span
                  className={`mt-1 size-3 shrink-0 rounded-full ring-4 ring-slate-800 ${event.event_type === 'completion' ? 'bg-emerald-400' : event.event_type === 'movement' ? 'bg-cyan-400' : event.event_type === 'part' ? 'bg-amber-400' : 'bg-rose-400'}`}
                />
                {index < (events.data?.length ?? 0) - 1 && (
                  <i className="absolute right-[5px] top-4 h-full w-px bg-slate-700" />
                )}
                <div>
                  <b className="text-xs">{event.title}</b>
                  <span className="mr-2 text-[10px] text-slate-400">{dt(event.happened_at)}</span>
                  {event.details && (
                    <p className="mt-1 text-[11px] text-slate-300">{event.details}</p>
                  )}
                  {event.progress !== null && (
                    <span className="mt-1 inline-block rounded bg-white/10 px-2 py-0.5 text-[10px]">
                      الإنجاز {event.progress}%
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!events.isLoading && !(events.data ?? []).length && (
            <p className="py-4 text-center text-xs text-slate-400">لا توجد أحداث مسجلة.</p>
          )}
        </section>
        <h3 className="mt-5 flex items-center gap-2 font-black">
          <Paperclip size={16} />
          الصور والمرفقات
        </h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(q.data?.attachments ?? []).map((a) => (
            <a
              key={a.id}
              href={a.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border bg-slate-50 p-3 text-xs font-bold"
            >
              {a.original_name}
              <span className="mt-1 block text-[10px] text-slate-500">
                {a.caption ?? a.mime_type} · {(a.size_bytes / 1024 / 1024).toFixed(1)} MB
              </span>
            </a>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!file) return
            upload.mutate(
              { caseId: item.case_id, file, caption },
              {
                onSuccess: () => {
                  setFile(null)
                  setCaption('')
                  refresh()
                },
              },
            )
          }}
          className="mt-3 grid gap-2 sm:grid-cols-3"
        >
          <input
            data-testid="maintenance-attachment-file"
            required
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-xl border p-2 text-xs"
          />
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="h-10 rounded-xl border px-2 text-xs"
            placeholder="وصف المرفق"
          />
          <button
            disabled={!file || upload.isPending}
            className="h-10 rounded-xl bg-indigo-700 text-xs font-black text-white disabled:opacity-40"
          >
            رفع المرفق
          </button>
        </form>
        <h3 className="mt-5 font-black">تحديثات الصيانة</h3>
        <div className="mt-2 space-y-2">
          {(q.data?.updates ?? []).map((u) => (
            <div
              key={u.id}
              className="rounded-xl border-r-4 border-rose-600 bg-slate-50 p-3 text-xs"
            >
              <b>
                {labels[u.status] ?? u.status} · {u.progress}%
              </b>
              <span className="mr-2 text-slate-500">{dt(u.created_at)}</span>
              <p className="mt-1">{u.diagnosis ?? u.work_notes ?? 'تحديث حالة'}</p>
            </div>
          ))}
        </div>
        <h3 className="mt-5 font-black">القطع المستخدمة</h3>
        <div className="mt-2 space-y-2">
          {(q.data?.parts ?? []).map((p) => (
            <div key={p.id} className="rounded-xl bg-amber-50 p-3 text-xs">
              <div className="flex justify-between">
                <span>
                  {p.part_name} · {p.quantity} {p.unit} ·{' '}
                  {(p.unit_cost ?? 0).toLocaleString('ar-IQ')}
                </span>
                <b>
                  {p.part_status === 'issued'
                    ? 'مصروفة بانتظار التركيب'
                    : p.part_status === 'installed'
                      ? 'تم تركيبها'
                      : 'أعيدت للمخزون'}
                </b>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-3 text-xs text-white">
          <span>
            كلفة القطع: <b>{item.parts_actual_cost.toLocaleString('ar-IQ')}</b>
          </span>
          <span>
            الكلفة الفعلية الإجمالية: <b>{(item.actual_cost ?? 0).toLocaleString('ar-IQ')}</b>
          </span>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Archive, ArrowLeftRight, CalendarDays, CheckCircle2, History, Lock, Package, Timer, UserCog, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { MaintenanceCaseHistoryDialog } from '@features/vehicle-operations/components/MaintenanceCaseHistoryDialog'
import {
  useMaintenanceCompleteCase,
  useMaintenanceConfirmArrival,
  useMaintenanceDays,
  useMaintenanceDispatch,
  useMaintenanceForDay,
  useMaintenanceForwardToCentral,
  useMaintenanceInventory,
  useMaintenanceTechnicianOptions,
} from '@features/vehicle-operations/hooks'
import { money } from '@features/vehicle-operations/purchase-schemas'
import type { MaintenanceCase } from '@sdk/vehicle-operations.sdk'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

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
  new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))
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
    [forwarding, setForwarding] = useState<MaintenanceCase | null>(null),
    [detail, setDetail] = useState<MaintenanceCase | null>(null)
  const days = useMaintenanceDays(),
    q = useMaintenanceForDay(day),
    arrival = useMaintenanceConfirmArrival(),
    dispatch = useMaintenanceDispatch()
  // المكتملة (استلمها الكراج/الموقع) تختفي من هنا وتبقى في الأرشيف
  const open = (q.data ?? []).filter((c) => !c.completed_at),
    archivedCount = (q.data ?? []).length - open.length
  return (
    <section dir="rtl" className="space-y-5">
      <ExecPageHeader icon="settings" iconNode={<Wrench size={22} className="text-[#f3d06a]" />} title="حالات صيانة الآليات" subtitle="وصول → تشخيص وإصلاح (الوقت يُحسب تلقائياً) → إنهاء الصيانة → إرسال" />
      <section className="rounded-2xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="size-5 text-[#0b3d6b]" />
          <b>مجلدات أيام الصيانة</b>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="mr-auto h-9 rounded-xl border px-2" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(days.data ?? []).map((x) => (
            <button key={x.case_day} onClick={() => setDay(x.case_day)} className={`min-w-40 rounded-xl border p-3 text-xs ${day === x.case_day ? 'border-[#0b3d6b] bg-blue-50' : ''}`}>
              <b>{x.case_day}</b>
              <span className="mt-1 block">{x.open_count} مفتوحة · {x.total_count - x.open_count} في الأرشيف</span>
            </button>
          ))}
        </div>
      </section>
      {archivedCount > 0 && (
        <p data-testid="archived-note" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <Archive size={14} />
          {archivedCount} حالة اكتملت هذا اليوم (استلمها الكراج أو الموقع) وانتقلت إلى الأرشيف.
          <Link to="/maintenance/archive" className="underline">فتح الأرشيف</Link>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {open.map((c) => (
          <CaseCard key={c.case_id} c={c} onArrival={() => arrival.mutate({ caseId: c.case_id })} onFinish={() => setFinishing(c)} onDetail={() => setDetail(c)} onDispatch={(destination) => dispatch.mutate({ caseId: c.case_id, destination })} onForward={() => setForwarding(c)} />
        ))}
      </div>
      {!open.length && <p className="rounded-2xl border bg-white p-12 text-center text-slate-500">لا توجد حالات مفتوحة في هذا اليوم.</p>}
      {finishing && <FinishDialog item={finishing} close={() => setFinishing(null)} />}
      {forwarding && <ForwardDialog item={forwarding} close={() => setForwarding(null)} />}
      {detail && <MaintenanceCaseHistoryDialog item={detail} close={() => setDetail(null)} />}
    </section>
  )
}

function CaseCard({ c, onArrival, onFinish, onDetail, onDispatch, onForward }: { c: MaintenanceCase; onArrival: () => void; onFinish: () => void; onDetail: () => void; onDispatch: (d: 'work_site' | 'garage') => void; onForward: () => void }) {
  const elapsed = useElapsed(c.arrived_at, c.departed_maintenance_at ?? c.completed_at)
  const done = Boolean(c.readiness_approved_at)
  // (00272) حالة محوَّلة إلى المركزية: الورشة المحوِّلة تراها للقراءة فقط؛ التحويل متاح فقط لورشة فرعية تملك الحالة وهي داخل الورشة
  const readOnly = c.can_edit === false
  const canForward = !readOnly && c.workshop_key !== undefined && c.workshop_key !== 'central' && inWorkshop(c)
  return (
    <article className="rounded-3xl border bg-white p-5 shadow-sm" data-testid={`case-${c.case_id}`}>
      {c.origin_workshop_key && (
        <p data-testid={`forwarded-${c.case_id}`} className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <ArrowLeftRight size={14} className="mt-0.5 shrink-0" />
          <span><b>محوَّلة من {c.origin_workshop_name ?? c.origin_workshop_key} إلى {c.workshop_name ?? 'الصيانة المركزية'}</b>{c.forwarded_at ? ` · ${dt(c.forwarded_at)}` : ''}{c.forward_reason ? <> — السبب: {c.forward_reason}</> : null}</span>
        </p>
      )}
      {readOnly && (
        <p data-testid={`readonly-${c.case_id}`} className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-xs font-bold text-slate-700">
          <Lock size={14} />
          للقراءة فقط — تتابعها {c.workshop_name ?? 'الصيانة المركزية'} الآن.
        </p>
      )}
      <div className="flex justify-between">
        <div>
          <b className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white">DB {c.db_number}</b>
          <h2 className="mt-3 font-black">{c.vehicle_name}</h2>
          <p className="text-xs text-slate-500">{c.driver_name} · {c.area_name} · {c.manager_name}</p>
        </div>
        <span className={`h-fit rounded-full px-3 py-1 text-xs font-black ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-[#0b3d6b]'}`}>{labels[c.status] ?? c.status}</span>
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
      {!readOnly && c.status === 'to_maintenance' && (
        <button onClick={onArrival} className="mt-3 h-11 w-full rounded-xl bg-emerald-700 font-black text-white">تأكيد وصول الآلية إلى الصيانة</button>
      )}
      {!readOnly && inWorkshop(c) && (
        <button data-testid={`finish-${c.case_id}`} onClick={onFinish} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 font-black text-white">
          <CheckCircle2 size={16} />
          إنهاء الصيانة وإدخال البيانات
        </button>
      )}
      {canForward && (
        <button data-testid={`forward-${c.case_id}`} onClick={onForward} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-400 bg-amber-50 font-black text-amber-900">
          <ArrowLeftRight size={16} />
          تحويل إلى الصيانة المركزية
        </button>
      )}
      {!readOnly && c.status === 'ready' && done && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => onDispatch('work_site')} className="h-11 rounded-xl bg-cyan-700 text-xs font-black text-white">إعادتها إلى موقع العمل</button>
          <button onClick={() => onDispatch('garage')} className="h-11 rounded-xl bg-slate-800 text-xs font-black text-white">إرسالها إلى الكراج</button>
        </div>
      )}
    </article>
  )
}

/** (00272) تحويل الحالة إلى الصيانة المركزية — السبب إلزامي (٥ أحرف فأكثر)؛ الحالة نفسها تنتقل بسجلها وتصبح للقراءة هنا */
function ForwardDialog({ item, close }: { item: MaintenanceCase; close: () => void }) {
  const forward = useMaintenanceForwardToCentral()
  const [reason, setReason] = useState('')
  const ok = reason.trim().length >= 5
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4">
      <form
        data-testid="forward-form"
        onSubmit={(e) => { e.preventDefault(); if (!ok) return; forward.mutate({ caseId: item.case_id, reason }, { onSuccess: close }) }}
        className="w-full max-w-lg rounded-3xl bg-white p-5 sm:p-6"
      >
        <h2 className="flex items-center gap-2 text-xl font-black"><ArrowLeftRight size={20} className="text-amber-700" />تحويل إلى الصيانة المركزية · DB {item.db_number}</h2>
        <p className="mt-1 text-xs text-slate-500">{item.vehicle_name} · {item.fault_type}</p>
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">تنتقل الحالة نفسها بكل سجلها (التشخيص، الأعمال، القطع، المرفقات، الفنيون) إلى الصيانة المركزية، وتبقى هنا للقراءة فقط. تُفتح ساق رحلة من هذه الورشة إلى المركزية وتؤكد المركزية الوصول. يُبلَّغ مسؤول القاطع وغرفة العمليات.</p>
        <label className="mt-4 block text-xs font-bold text-slate-600">
          سبب التحويل (إلزامي)
          <textarea data-testid="forward-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border p-3 text-sm" placeholder="مثال: يحتاج رافعة هيدروليكية غير متوفرة في الورشة" />
        </label>
        {!ok && <p data-testid="forward-missing" className="mt-2 text-xs font-bold text-amber-800">اكتب سبباً واضحاً (٥ أحرف فأكثر).</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={close} className="h-11 rounded-xl border">إلغاء</button>
          <button data-testid="forward-submit" disabled={!ok || forward.isPending} className="h-11 rounded-xl bg-amber-700 font-black text-white disabled:opacity-50">تأكيد التحويل</button>
        </div>
      </form>
    </div>
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


import { useState } from 'react'
import { History, Paperclip } from 'lucide-react'
import { useMaintenanceEvents, useMaintenanceTimeline, useMaintenanceUploadAttachment } from '@features/vehicle-operations/hooks'

const labels: Record<string, string> = {
  to_maintenance: 'في الطريق إلى الصيانة', at_maintenance: 'قيد التشخيص والإصلاح', diagnosing: 'قيد التشخيص والإصلاح', waiting_parts: 'قيد التشخيص والإصلاح',
  in_repair: 'قيد التشخيص والإصلاح', paused: 'قيد التشخيص والإصلاح', ready: 'جاهزة للإرسال', to_work: 'في الطريق إلى العمل', to_garage: 'في الطريق إلى الكراج',
  returned_to_work: 'عادت إلى العمل', closed_at_garage: 'أُغلقت في الكراج',
}
const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))

export interface CaseHistoryTarget {
  case_id: string
  db_number: string
  parts_actual_cost: number
  actual_cost: number | null
}
/** السجل الكامل + المرفقات لحالة صيانة — يُستخدم من صفحة الحالات (مع رفع مرفقات) ومن الأرشيف (للعرض) */
export function MaintenanceCaseHistoryDialog({ item, close, allowUpload = true }: { item: CaseHistoryTarget; close: () => void; allowUpload?: boolean }) {
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
        {allowUpload && (
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
        )}
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
                  {(p.unit_cost ?? 0).toLocaleString('ar-IQ-u-nu-latn')}
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
            كلفة القطع: <b>{item.parts_actual_cost.toLocaleString('ar-IQ-u-nu-latn')}</b>
          </span>
          <span>
            الكلفة الفعلية الإجمالية: <b>{(item.actual_cost ?? 0).toLocaleString('ar-IQ-u-nu-latn')}</b>
          </span>
        </div>
      </div>
    </div>
  )
}

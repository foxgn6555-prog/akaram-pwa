/**
 * وحدة «قوالب التصميم» — الهوية البصرية القابلة لإعادة الاستخدام
 * إنشاء/تعديل/أرشفة قوالب: عنوان، قطاع، دورة، غلاف جاهز، أنواع عمل افتراضية.
 * يُستخدم القالب عند إنشاء تصميم جديد من وحدة التذاكر لتعبئة الغلاف والعنوان.
 */
import { useRef, useState } from 'react'
import { Archive, LayoutTemplate, Palette, Pencil, Plus, Upload, X } from 'lucide-react'
import {
  PERIODS,
  PERIOD_LABEL,
  SECTOR_LABEL,
  WORK_TYPES,
  type PeriodType,
  type SectorParent,
} from '@features/media/constants'
import {
  useArchiveMediaTemplate,
  useCreateMediaTemplate,
  useMediaTemplates,
  useSignedPhotoUrls,
  useUpdateMediaTemplate,
  useUploadCover,
  type MediaTemplateInput,
} from '@features/media/hooks'
import type { MediaDesignTemplate } from '@sdk/media.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { DialogShell } from '../Tickets/MediaTicketsPage'

export default function MediaTemplatesPage() {
  const [editorFor, setEditorFor] = useState<MediaDesignTemplate | 'new' | null>(null)
  const templates = useMediaTemplates()
  const rows = templates.data ?? []

  return (
    <section dir="rtl" className="space-y-5">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-fuchsia-950 to-rose-900 p-7 text-white shadow-xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/85">
          <Palette size={15} />
          الهوية البصرية
        </span>
        <h1 className="mt-4 text-2xl font-black sm:text-3xl">قوالب التصميم</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">
          قالب جاهز = غلاف الورقة الأولى + العنوان والدورة وأنواع العمل الافتراضية؛ يُطبق عند إنشاء
          تصميم جديد من وحدة التذاكر.
        </p>
        <button
          onClick={() => setEditorFor('new')}
          className="mt-4 flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-fuchsia-900 shadow hover:bg-fuchsia-50"
        >
          <Plus size={16} />
          قالب جديد
        </button>
      </header>

      {templates.isLoading ? (
        <LoadingSpinner label="جارٍ تحميل القوالب…" />
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <LayoutTemplate className="mx-auto text-slate-300" size={34} />
          <h2 className="mt-3 font-black text-slate-900">لا توجد قوالب بعد</h2>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-500">
            أنشئ قالباً بغلاف جاهز وعنوان ودورة وأنواع عمل، ليصبح إنشاء التصاميم نقرة واحدة.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <TemplateCard key={t.id} template={t} onEdit={() => setEditorFor(t)} />
          ))}
        </div>
      )}

      {editorFor && <TemplateEditor template={editorFor === 'new' ? null : editorFor} close={() => setEditorFor(null)} />}
    </section>
  )
}

function TemplateCard({ template, onEdit }: { template: MediaDesignTemplate; onEdit: () => void }) {
  const archive = useArchiveMediaTemplate()
  const cover = useSignedPhotoUrls(template.cover_path ? [template.cover_path] : [])
  const coverUrl = template.cover_path ? cover.data?.[template.cover_path] : null
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative h-32 bg-slate-100">
        {coverUrl ? (
          <img src={coverUrl} alt={`غلاف ${template.title}`} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-slate-300">
            <LayoutTemplate size={30} />
          </div>
        )}
        {template.status === 'archived' && (
          <span className="absolute right-2 top-2 rounded-full bg-slate-900/80 px-2 py-1 text-[10px] font-black text-white">
            مؤرشف
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="text-sm font-black text-slate-800">{template.title}</h3>
        <p className="text-[11px] text-slate-500">
          {template.sector_parent ? SECTOR_LABEL[template.sector_parent as SectorParent] : 'عام (لكلا القاطعين)'}
          {' · '}
          {PERIOD_LABEL[template.period_type as PeriodType] ?? template.period_type}
        </p>
        {(template.work_types ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(template.work_types ?? []).slice(0, 4).map((w) => (
              <span key={w} className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-800">
                {w}
              </span>
            ))}
            {(template.work_types ?? []).length > 4 && (
              <span className="text-[10px] text-slate-400">+{template.work_types.length - 4}</span>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onEdit}
            className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:border-fuchsia-400"
          >
            <Pencil size={13} />
            تعديل
          </button>
          {template.status === 'active' && (
            <button
              onClick={() => {
                if (window.confirm('أرشفة القالب؟ لن يظهر في قوائم الإنشاء الجديدة.')) archive.mutate([template.id])
              }}
              className="flex h-9 items-center gap-1 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              <Archive size={13} />
              أرشفة
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function TemplateEditor({ template, close }: { template: MediaDesignTemplate | null; close: () => void }) {
  const create = useCreateMediaTemplate()
  const update = useUpdateMediaTemplate()
  const uploadCover = useUploadCover()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(template?.title ?? '')
  const [sector, setSector] = useState<string>(template?.sector_parent ?? '')
  const [period, setPeriod] = useState<PeriodType>((template?.period_type as PeriodType) ?? 'first_half')
  const [workTypes, setWorkTypes] = useState<string[]>(template?.work_types ?? [])
  const [notes, setNotes] = useState(template?.notes ?? '')
  const [coverPath, setCoverPath] = useState<string | null>(template?.cover_path ?? null)
  const [error, setError] = useState('')

  const cover = useSignedPhotoUrls(coverPath ? [coverPath] : [])
  const coverUrl = coverPath ? cover.data?.[coverPath] : null
  const busy = create.isPending || update.isPending || uploadCover.isPending

  const toggleType = (w: string) =>
    setWorkTypes((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]))

  const save = () => {
    setError('')
    if (title.trim().length < 2) {
      setError('اكتب اسماً للقالب (حرفان على الأقل)')
      return
    }
    const payload: MediaTemplateInput = {
      title: title.trim(),
      sectorParent: sector || null,
      periodType: period,
      coverPath,
      workTypes,
      notes: notes.trim(),
    }
    if (template) update.mutate([template.id, payload], { onSuccess: close })
    else create.mutate([payload], { onSuccess: close })
  }

  return (
    <DialogShell title={template ? 'تعديل قالب' : 'قالب تصميم جديد'} close={close} wide>
      <div className="space-y-4 p-5" dir="rtl">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="md:col-span-3">
            <span className="mb-1 block text-xs font-bold text-slate-600">اسم القالب</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: غلاف تقرير الكرادة الرسمي"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-fuchsia-500"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-600">القطاع</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">عام (لكلا القاطعين)</option>
              <option value="karrada">{SECTOR_LABEL.karrada}</option>
              <option value="zaafaraniya">{SECTOR_LABEL.zaafaraniya}</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-slate-600">الدورة الافتراضية</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodType)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-xs font-bold text-slate-600">غلاف الورقة الأولى (جاهز)</span>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  uploadCover.mutate([f], { onSuccess: (path) => setCoverPath(path) })
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:border-fuchsia-400 disabled:opacity-40"
              >
                <Upload size={14} />
                {uploadCover.isPending ? 'جارٍ الرفع…' : 'رفع غلاف'}
              </button>
              {coverPath && (
                <button
                  type="button"
                  onClick={() => setCoverPath(null)}
                  className="flex h-11 items-center gap-1 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-600"
                >
                  <X size={13} />
                  إزالة
                </button>
              )}
            </div>
            {coverUrl && (
              <img src={coverUrl} alt="غلاف القالب" className="mt-2 h-24 rounded-xl border object-cover" />
            )}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-xs font-bold text-slate-600">أنواع العمل الافتراضية</span>
          <div className="flex flex-wrap gap-1.5">
            {WORK_TYPES.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => toggleType(w)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                  workTypes.includes(w)
                    ? 'bg-fuchsia-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-fuchsia-50'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-600">ملاحظات (اختياري)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
          />
        </label>

        {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="h-11 flex-1 rounded-xl bg-fuchsia-700 text-sm font-black text-white hover:bg-fuchsia-800 disabled:opacity-40"
          >
            {template ? 'حفظ التعديلات' : 'إنشاء القالب'}
          </button>
          <button onClick={close} className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">
            إغلاق
          </button>
        </div>
      </div>
    </DialogShell>
  )
}

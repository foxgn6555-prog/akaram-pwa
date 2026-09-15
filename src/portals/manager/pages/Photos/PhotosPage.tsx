/**
 * إرسال صور — بوابة مسؤول القسم
 * ثلاث طرق: صورة شارع · حملة · حملة مدارس — حتى 500 صورة
 * القاطع والقسم يُشتقان تلقائياً من حساب المسؤول، والتذكرة تصل بوابة الإعلام
 */
import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, ImagePlus, Send, Trash2 } from 'lucide-react'
import {
  MEDIA_MODES,
  MODE_LABEL,
  SECTOR_LABEL,
  CUSTOM_WORK_TYPE,
  MAX_PHOTOS,
  type MediaMode,
  type SectorParent,
  submissionModeTitleField,
  workTypesForMode,
} from '@features/media/constants'
import { effectiveWorkType, sendFormSchema } from '@features/media/schemas'
import { useMySubmissions, useSendPhotos, useUploadPhotos } from '@features/media/hooks'
import { sector } from '@sdk/sector.sdk'
import { Icon } from '@components/ui/Icon/Icon'
import { CameraCapture } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const todayBaghdad = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())

export default function PhotosPage() {
  const [mode, setMode] = useState<MediaMode>('street')
  const [title, setTitle] = useState('')
  const [workType, setWorkType] = useState('')
  const [customType, setCustomType] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  const send = useSendPhotos()
  const upload = useUploadPhotos()
  const mine = useMySubmissions()
  const isBusy = busy || send.isPending || upload.isPending

  // اشتقاق القاطع والقسم تلقائياً من حساب المسؤول
  const sectorsQ = useQuery({ queryKey: ['sector', 'sectors'], queryFn: () => sector.listSectors(), staleTime: Infinity })
  const profileQ = useQuery({ queryKey: ['sector', 'my-profile'], queryFn: () => sector.myProfile(), staleTime: Infinity })
  const mySectors = useMemo(() => {
    const ids = profileQ.data?.sectors ?? []
    const all = sectorsQ.data ?? []
    return all.filter((s) => ids.includes(s.id))
  }, [profileQ.data, sectorsQ.data])
  const parent: SectorParent | null = mySectors[0]?.parent_sector ?? null
  const sectionNames = mySectors.map((s) => s.name).join('، ')

  const appendFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    setFiles((prev) => {
      const room = MAX_PHOTOS - prev.length
      if (room <= 0) return prev
      return [...prev, ...list.slice(0, room)]
    })
  }

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index))
  const clearAll = () => setFiles([])

  const resetForm = () => {
    setTitle('')
    setWorkType('')
    setCustomType('')
    setNotes('')
    clearAll()
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const result = sendFormSchema(mode).safeParse({
      title,
      work_type: workType,
      custom_type: customType,
      notes,
      photo_count: files.length,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'تحقق من الحقول')
      return
    }
    const work = effectiveWorkType(workType, customType, mode)
    if (mode !== 'street' && !work) {
      setError('حدد نوع العمل (أو اكتب النوع المخصص)')
      return
    }
    setBusy(true)
    try {
      // 1) رفع الصور إلى التخزين (دفعة متوازية)
      const paths = await upload.mutateAsync(files)
      // 2) تسجيل التذكرة بكل المسارات
      await send.mutateAsync([
        mode,
        title.trim(),
        work,
        notes.trim(),
        paths.map((p) => ({ storagePath: p, caption: '' })),
      ])
      resetForm()
    } catch {
      // الخطأ معروض عبر toast
    } finally {
      setBusy(false)
    }
  }

  const field = submissionModeTitleField[mode]
  const types = workTypesForMode(mode)

  return (
    <div className="space-y-6" data-testid="photos-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">إرسال صور إلى الإعلام</h1>
        <p className="text-sm text-slate-500">
          القاطع والقسم يُحدَّدان تلقائياً من حسابك — املأ التفاصيل واختر حتى {MAX_PHOTOS} صورة.
        </p>
      </div>

      {/* المنطقة التلقائية من الحساب */}
      <div className="grid gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-bold text-cyan-900">القاطع (تلقائي)</p>
          <b className="text-sm">{parent ? SECTOR_LABEL[parent] : '—'}</b>
        </div>
        <div>
          <p className="text-[11px] font-bold text-cyan-900">القسم (تلقائي)</p>
          <b className="text-sm">{sectionNames || '—'}</b>
        </div>
        <div>
          <p className="text-[11px] font-bold text-cyan-900">التاريخ (تلقائي)</p>
          <b className="text-sm">{todayBaghdad()}</b>
        </div>
      </div>

      <form onSubmit={submit} data-testid="photo-form" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* اختيار الطريقة */}
        <div className="flex flex-wrap gap-2">
          {MEDIA_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              data-testid={`mode-${m.value}`}
              onClick={() => {
                setMode(m.value)
                setWorkType('')
              }}
              className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${
                mode === m.value
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'bg-white text-slate-700 hover:border-cyan-400'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{MEDIA_MODES.find((m) => m.value === mode)?.hint}</p>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            data-testid="f-photo-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={field.placeholder}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
          />
          {mode !== 'street' && (
            <select
              data-testid="f-photo-worktype"
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500"
            >
              <option value="">نوع العمل…</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={CUSTOM_WORK_TYPE}>{CUSTOM_WORK_TYPE}…</option>
            </select>
          )}
        </div>

        {workType === CUSTOM_WORK_TYPE && (
          <input
            data-testid="f-photo-customtype"
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="اكتب نوع العمل المخصص (مثال: تعبيث حفر طريق)"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
          />
        )}

        <input
          data-testid="f-photo-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات (اختياري)"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
        />

        {/* الصور */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              data-testid="f-photo-files"
              onChange={(e) => e.target.files && appendFiles(e.target.files)}
              className="h-11 min-w-0 flex-1 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-brand-700"
            />
            <button
              type="button"
              data-testid="photo-camera"
              onClick={() => setCameraOpen(true)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-brand-400"
            >
              <Camera size={16} /> كاميرا
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={!files.length}
              className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-600 disabled:opacity-40"
            >
              <Trash2 size={15} /> مسح الكل
            </button>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-600">
            {files.length} / {MAX_PHOTOS} صورة
            {files.length >= MAX_PHOTOS && <span className="mr-2 text-amber-700">(بلغت الحد الأقصى)</span>}
          </p>

          {files.length > 0 && (
            <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5 lg:grid-cols-8">
              {files.map((f, i) => (
                <figure key={`${f.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <img src={URL.createObjectURL(f)} alt={f.name} className="size-full object-cover" loading="lazy" />
                  <button
                    type="button"
                    aria-label="حذف الصورة"
                    onClick={() => removeFile(i)}
                    className="absolute left-1 top-1 rounded-md bg-slate-900/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </figure>
              ))}
            </div>
          )}
        </div>

        {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}

        <button
          type="submit"
          data-testid="photo-submit"
          disabled={files.length === 0 || isBusy}
          className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
        >
          <Send size={16} />
          {isBusy ? `جارٍ رفع ${files.length || ''} صور وإرسال التذكرة…` : 'إرسال التذكرة إلى الإعلام'}
        </button>
      </form>

      {/* تذكراتي */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-700">تذكراتي المرسلة ({(mine.data ?? []).length})</h2>
        {mine.isLoading ? (
          <LoadingSpinner label="جارٍ الجلب…" />
        ) : (mine.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            <ImagePlus className="mx-auto mb-2 text-slate-300" size={28} />
            لم ترسل أي تذكرة بعد
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(mine.data ?? []).map((s) => (
              <article key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white">
                    {MODE_LABEL[s.mode as MediaMode] ?? s.mode}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-black ${
                      s.status === 'archived' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {s.status === 'archived' ? 'مؤرشفة' : 'عند الإعلام'}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-bold text-slate-800">{s.title}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {s.work_type ? `النوع: ${s.work_type}` : 'دون نوع عمل'} · {s.photo_count} صورة
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {s.sector_parent === 'karrada' ? SECTOR_LABEL.karrada : SECTOR_LABEL.zaafaraniya} · {s.event_date}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(f) => {
          setCameraOpen(false)
          setFiles((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, f]))
        }}
      />
    </div>
  )
}

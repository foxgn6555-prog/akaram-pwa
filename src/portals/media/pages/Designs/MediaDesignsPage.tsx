/**
 * وحدة «التصاميم» — فولدر التصاميم الخاص
 * مصمّم بملء الشاشة: غلاف يدوي، صور حسب نوع العمل مع سحب وإفلات
 * (إعادة ترتيب ونقل بين الأنواع)، وفتح الصور بعرض كبير، ومعاينة التقرير وطباعته
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router'
import {
  Eye,
  ImagePlus,
  LayoutTemplate,
  Palette,
  Printer,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  PERIODS,
  PERIOD_LABEL,
  SECTOR_LABEL,
  periodRange,
  type PeriodType,
  type SectorParent,
  designGroupLabel,
} from '@features/media/constants'
import {
  useAddDesignPhotos,
  useCompleteDesign,
  useDeleteDesign,
  useDesignDetail,
  useDesigns,
  useRemoveDesignPhoto,
  useRemoveDesignPhotos,
  useReorderDesignPhotos,
  useSaveDesignReport,
  useSignedPhotoUrls,
  useSubmissions,
  useSubmissionPhotos,
  useUpdateDesign,
  useUploadCover,
  useSetDesignShift,
} from '@features/media/hooks'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import type { MediaDesignDetail } from '@sdk/media.sdk'
import { DialogShell } from '../Tickets/MediaTicketsPage'
import PhotoGrid from '../../components/PhotoGrid'
import { PickCoverButton, SaveCoverToLibraryButton } from '../../components/CoverLibrary'
import DesignCover from '../../components/DesignCover'
import { SHIFT_LABEL, SHIFT_OPTIONS, isBuiltinCover, type CoverShift } from '@features/media/lib/cover-templates'
import DesignExportMenu, { type WordDataRef } from './DesignExportMenu'
import DesignReportView, {
  type ReportColors,
  type ReportStyle,
  type ReportSummary,
} from './DesignReportView'

export default function MediaDesignsPage() {
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const designs = useDesigns(null)
  const [shiftFilter, setShiftFilter] = useState<'' | CoverShift>('')
  const [sectorFilter, setSectorFilter] = useState<'' | SectorParent>('')
  const rows = (designs.data ?? []).filter((d) => (!shiftFilter || d.shift === shiftFilter) && (!sectorFilter || d.sector_parent === sectorFilter))

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-fuchsia-900 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <Palette size={17} />
          فولدر التصاميم — التصميم مرتين شهرياً (1–14 / 15–آخر) أو شهري كامل
        </p>
        <h1 className="mt-2 text-2xl font-black">التصاميم</h1>
        <p className="mt-1 text-sm text-fuchsia-100">
          الغلاف يُرفع يدوياً (الورقة الأولى) — والتقرير ولوحات الصور تُعبأ من النظام تلقائياً (الورقة الثانية).
        </p>
      </header>

      {/* 00200: ترشيح بالقاطع والشفت */}
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="designs-filters">
        {([['', 'كل القواطع'], ['karrada', SECTOR_LABEL.karrada], ['zaafaraniya', SECTOR_LABEL.zaafaraniya]] as Array<['' | SectorParent, string]>).map(([v, l]) => (
          <button key={`s-${v}`} type="button" data-testid={`filter-sector-${v || 'all'}`} onClick={() => setSectorFilter(v)} className={`h-9 rounded-full border px-3 font-bold ${sectorFilter === v ? 'border-fuchsia-700 bg-fuchsia-700 text-white' : 'bg-white text-slate-700'}`}>
            {l}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-300" />
        {([['', 'كل الشفتات'], ['morning', SHIFT_LABEL.morning], ['night', SHIFT_LABEL.night]] as Array<['' | CoverShift, string]>).map(([v, l]) => (
          <button key={`sh-${v}`} type="button" data-testid={`filter-shift-${v || 'all'}`} onClick={() => setShiftFilter(v)} className={`h-9 rounded-full border px-3 font-bold ${shiftFilter === v ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((d) => (
          <button
            key={d.id}
            onClick={() => setParams({ open: d.id })}
            className="rounded-2xl border bg-white p-4 text-right shadow-sm transition hover:border-fuchsia-400"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-fuchsia-700 px-2 py-1 text-[11px] font-black text-white">
                {SECTOR_LABEL[d.sector_parent as SectorParent] ?? d.sector_parent}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-black ${
                  d.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {d.status === 'completed' ? 'مكتمل' : 'مسودة'}
              </span>
              {d.shift && (
                <span className="rounded-full bg-slate-900 px-2 py-1 text-[11px] font-black text-white" data-testid={`design-shift-${d.id}`}>
                  {SHIFT_LABEL[d.shift]}
                </span>
              )}
              <span className="mr-auto text-[11px] text-slate-400">{d.photo_count} صورة</span>
            </div>
            <h3 className="mt-2 text-sm font-black text-slate-800">{d.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {PERIOD_LABEL[d.period_type as PeriodType] ?? d.period_type} · {d.period_start} ← {d.period_end}
            </p>
          </button>
        ))}
        {!designs.isLoading && rows.length === 0 && (
          <p className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500 sm:col-span-2">
            <LayoutTemplate className="mx-auto mb-2 text-slate-300" size={30} />
            {designs.data?.length ? 'لا توجد تصاميم مطابقة للترشيح الحالي.' : 'لا توجد تصاميم بعد — راجع تذكرة من وحدة القاطع واضغط «إرسال للتصميم».'}
          </p>
        )}
      </div>

      {openId && <DesignComposer designId={openId} close={() => setParams({})} />}
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────── */

interface ThumbPhoto {
  id: string
  rowId: string
  path: string
  caption: string | null
  reportCaption: string | null
  fit: 'contain' | 'cover'
  zoom: number
}
interface ThumbGroup {
  workType: string
  photos: ThumbPhoto[]
}

/** إسقاط صورة قبل صورة أخرى (أو نهاية المجموعة) مع إمكانية تغيير نوع العمل */
function applyMove(
  gs: ThumbGroup[],
  dragRowId: string,
  toWork: string,
  beforeRowId: string | null,
): ThumbGroup[] {
  let moved: ThumbPhoto | null = null
  const stripped = gs
    .map((g) => ({
      ...g,
      photos: g.photos.filter((p) => {
        if (p.rowId === dragRowId) {
          moved = p
          return false
        }
        return true
      }),
    }))
    .filter((g) => g.photos.length > 0 || g.workType === toWork)
  if (!moved) return gs
  const target = stripped.find((g) => g.workType === toWork)
  if (!target) return gs
  let idx = target.photos.length
  if (beforeRowId) {
    const f = target.photos.findIndex((p) => p.rowId === beforeRowId)
    if (f >= 0) idx = f
  }
  target.photos.splice(idx, 0, moved)
  return stripped
}

/** 00198 — يُحمِّل التصميم أولاً ثم يفتح المحرر بحالته الحقيقية (النوع/الغلاف/العنوان)؛
 *  قبل ذلك كان المحرر يُهيّئ حالته والبيانات لم تصل بعد، فيظهر «نصف شهري» بلا غلاف مهما كان القالب. */
function DesignComposer({ designId, close }: { designId: string; close: () => void }) {
  const detail = useDesignDetail(designId)
  if (detail.isLoading || !detail.data) {
    return createPortal(
      <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-100" dir="rtl">
        <LoadingSpinner label="جارٍ فتح التصميم…" />
      </div>,
      document.body,
    )
  }
  return <DesignComposerEditor key={designId} designId={designId} initial={detail.data} close={close} />
}

function DesignComposerEditor({ designId, initial, close }: { designId: string; initial: MediaDesignDetail; close: () => void }) {
  const detail = useDesignDetail(designId)
  const update = useUpdateDesign()
  const complete = useCompleteDesign()
  const removePhoto = useRemoveDesignPhoto()
  const removePhotos = useRemoveDesignPhotos()
  const addPhotos = useAddDesignPhotos()
  const uploadCover = useUploadCover()
  const wordRef: WordDataRef = useRef<WordDataRef["current"]>(null)
  const deleteDesign = useDeleteDesign()
  const saveReport = useSaveDesignReport(designId)
  const reorder = useReorderDesignPhotos(designId)

  const data = detail.data ?? initial
  const [title, setTitle] = useState(initial.design.title)
  const [periodType, setPeriodType] = useState<PeriodType>(initial.design.period_type as PeriodType)
  /** يوم التقرير المرجعي (لليومي: اليوم نفسه؛ لغيره: يوم داخل الفترة) — مثبّت على التصميم ولا ينزلق مع الأيام */
  const [refDay, setRefDay] = useState<string>(initial.design.period_start)
  const [preview, setPreview] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [coverPath, setCoverPath] = useState<string | null>(initial.design.cover_image_path)
  const [dragRow, setDragRow] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; caption: string | null } | null>(null)

  /** الفترة المعروضة: ما حفظه الخادم إن طابق الاختيار الحالي، وإلا احتساب محلي من اليوم المرجعي */
  const period = useMemo(() => {
    if (periodType === data.design.period_type && refDay === data.design.period_start)
      return { start: data.design.period_start, end: data.design.period_end }
    return periodRange(periodType, new Date(`${refDay}T12:00:00`))
  }, [periodType, refDay, data.design.period_type, data.design.period_start, data.design.period_end])
  const periodDirty = periodType !== data.design.period_type || period.start !== data.design.period_start

  const locked = data.design.status === 'completed'
  const sector = (data.design.sector_parent ?? 'karrada') as SectorParent

  const coverUrls = useSignedPhotoUrls(coverPath && !isBuiltinCover(coverPath) ? [coverPath] : [])
  const coverUrl = coverPath && !isBuiltinCover(coverPath) ? coverUrls.data?.[coverPath] : null
  const [shift, setShift] = useState<CoverShift | null>(initial.design.shift ?? null)
  const setShiftRpc = useSetDesignShift()
  const coverCtx = { periodType, sector, periodStart: period.start, periodEnd: period.end, shift }
  const hasCover = !!coverUrl || isBuiltinCover(coverPath)

  // عنوان الوثيقة أثناء المعاينة ليظهر اسم التقرير في ترويسة الطباعة بدل عنوان التطبيق
  useEffect(() => {
    if (!preview) return
    const prev = document.title
    document.title = `جزيرة الأكارم — تقرير ${title || data.design.title}`
    return () => {
      document.title = prev
    }
  }, [preview, title, data.design.title])

  const groups = useMemo<ThumbGroup[]>(() => {
    const map = new Map<string, ThumbPhoto[]>()
    for (const p of data.photos) {
      const arr = map.get(p.work_type) ?? []
      arr.push({
        id: p.photo_id,
        path: p.storage_path,
        caption: p.caption,
        reportCaption: p.report_caption,
        fit: p.display_fit,
        zoom: p.display_zoom,
        rowId: p.photo_id,
      })
      map.set(p.work_type, arr)
    }
    return [...map.entries()].map(([workType, photos]) => ({ workType, photos }))
  }, [data.photos])

  const meta = () => ({ title, periodType, coverPath, refDay: periodDirty ? refDay : null })
  const save = () =>
    update.mutate([designId, meta()], {
      onSuccess: () => detail.refetch(),
    })
  const removeMany = (ids: string[], label: string) => {
    if (!ids.length) return
    if (!window.confirm(`حذف ${ids.length} صورة ${label} من هذا التصميم؟\nلا تُحذف الصور من التذاكر الأصلية.`)) return
    removePhotos.mutate([ids], { onSuccess: () => detail.refetch() })
  }

  const onCover = (file: File | null) => {
    if (!file) return
    uploadCover.mutate([file], {
      onSuccess: (path) => {
        setCoverPath(path)
        update.mutate([designId, { ...meta(), coverPath: path }], { onSuccess: () => detail.refetch() })
      },
    })
  }

  const commitMove = (toWork: string, beforeRowId: string | null) => {
    if (!dragRow || dragRow === beforeRowId) return
    const next = applyMove(groups, dragRow, toWork, beforeRowId)
    setDragRow(null)
    reorder.mutate(
      [
        next.flatMap((g, gi) =>
          g.photos.map((p, i) => ({
            rowId: p.rowId,
            workType: g.workType,
            sortOrder: gi * 100 + i + 1,
          })),
        ),
      ],
      { onSuccess: () => detail.refetch() },
    )
  }

  // يُرسم في body حتى يعلو الشريط الجانبي (z-30) وقائمة الهاتف — كان يُرسم داخل عمود المحتوى (z-0) فيغطيه الشريط
  return createPortal(
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-slate-100"
      dir="rtl"
      data-testid="composer-fullscreen"
      data-rp-overlay
    >
      {/* ترويسة المصمم */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-slate-300 bg-white/95 px-4 py-3 backdrop-blur">
        <h2 className="text-base font-black text-slate-800">
          {locked ? 'التصميم (مكتمل)' : 'مُصمم التصميم — ملء الشاشة'}
        </h2>
        <span className="text-[11px] text-slate-400">
          اسحب الصور لإعادة ترتيبها أو نقلها لنوع آخر · انقر صورة لعرضها
        </span>
        <button
          onClick={close}
          className="mr-auto flex h-10 items-center gap-1 rounded-xl border px-4 text-sm font-black text-slate-700 hover:bg-slate-100"
        >
          <X size={15} />
          إغلاق
        </button>
      </div>

      <div className="no-print mx-auto max-w-6xl space-y-4 p-4 pb-24">
        {!locked && (
          <section className="grid gap-2 rounded-2xl border bg-white p-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 rounded-xl border px-3 text-sm font-bold"
              placeholder="عنوان التقرير"
            />
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              className="h-11 rounded-xl border bg-white px-3 text-sm"
              data-testid="composer-period"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <label className="flex h-11 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold text-slate-600" title={periodType === 'daily' ? 'يوم التقرير' : 'أي يوم داخل الفترة المطلوبة'}>
              {periodType === 'daily' ? 'يوم التقرير' : 'يوم مرجعي'}
              <input type="date" value={refDay} onChange={(e) => e.target.value && setRefDay(e.target.value)} className="text-sm font-normal outline-none" data-testid="composer-ref-day" />
            </label>
            <button
              onClick={save}
              disabled={update.isPending}
              className="flex h-11 items-center gap-2 rounded-xl bg-fuchsia-700 px-4 text-sm font-black text-white disabled:opacity-40"
            >
              <Save size={15} />
              حفظ
            </button>
          </section>
        )}
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          الشفت
          <select
            data-testid="composer-shift"
            value={shift ?? ''}
            disabled={locked}
            onChange={(e) => {
              const v = (e.target.value || null) as CoverShift | null
              setShift(v)
              setShiftRpc.mutate([designId, v], { onSuccess: () => detail.refetch() })
            }}
            className="h-9 rounded-lg border bg-white px-2 font-bold"
          >
            {SHIFT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="font-normal text-slate-400">يظهر على غلاف القالب الجاهز ويُستخدم للترشيح</span>
        </label>
                <p className="text-xs text-slate-500">
          {SECTOR_LABEL[sector]} · الدورة:{' '}
          <b data-testid="composer-period-range">
            {period.start === period.end ? period.start : `${period.start} ← ${period.end}`}
          </b>
          {periodDirty && <span className="mr-1 font-bold text-amber-700">(غير محفوظ — اضغط حفظ)</span>}{' '}
          · {data.design.photo_count} صورة · {locked ? 'مقفل بعد الإكمال' : 'مسودة قابلة للتعديل'}
        </p>

        {/* الغلاف (الورقة الأولى — يدوي) */}
        <section className="rounded-2xl border bg-white p-4">
          <h3 className="mb-2 text-sm font-black">الورقة الأولى — الغلاف (من المكتبة أو رفع يدوي)</h3>
          <div className="flex flex-wrap items-center gap-3">
            {isBuiltinCover(coverPath) ? (
              <div className="w-24 overflow-hidden rounded-xl border shadow-sm" data-testid="composer-builtin-cover">
                <DesignCover coverPath={coverPath} ctx={coverCtx} />
              </div>
            ) : coverUrl ? (
              <button onClick={() => setLightbox({ url: coverUrl, caption: 'الغلاف' })}>
                <img src={coverUrl} alt="الغلاف" className="h-24 w-40 rounded-xl object-cover" />
              </button>
            ) : (
              <div className="grid h-24 w-40 place-items-center rounded-xl border border-dashed text-xs text-slate-400">
                بلا غلاف
              </div>
            )}
            {!locked && (
              <PickCoverButton
                current={coverPath}
                defaultSector={sector}
                defaultPeriod={periodType}
                ctx={coverCtx}
                onPick={(path) => {
                  setCoverPath(path)
                  update.mutate([designId, { ...meta(), coverPath: path }], { onSuccess: () => detail.refetch() })
                }}
              />
            )}
            {!locked && (
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-4 text-xs font-bold hover:bg-slate-50">
                <Upload size={14} />
                {hasCover ? 'استبدال الغلاف' : 'رفع الغلاف'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onCover(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {coverPath && !isBuiltinCover(coverPath) && <SaveCoverToLibraryButton storagePath={coverPath} defaultTitle={title || data.design.title} defaultSector={sector} defaultPeriod={periodType} />}
            {!locked && hasCover && (
              <button
                onClick={() => {
                  setCoverPath(null)
                  update.mutate([designId, { ...meta(), coverPath: null }], { onSuccess: () => detail.refetch() })
                }}
                className="flex h-10 items-center gap-1 rounded-xl border px-3 text-xs font-bold text-red-600"
              >
                <X size={13} />
                إزالة
              </button>
            )}
          </div>
        </section>

        {/* الصور حسب النوع: سحب وإفلات + فتح */}
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black">صور التصميم حسب نوع العمل</h3>
            {!locked && (
              <div className="mr-auto flex flex-wrap items-center gap-2">
                {groups.length > 0 && (
                  <button
                    onClick={() => removeMany(groups.flatMap((g) => g.photos.map((p) => p.rowId)), '(كل الصور)')}
                    disabled={removePhotos.isPending}
                    className="flex h-9 items-center gap-1 rounded-lg border border-red-300 px-3 text-xs font-black text-red-700 hover:bg-red-50 disabled:opacity-40"
                    data-testid="remove-all-photos"
                  >
                    <Trash2 size={13} />
                    حذف كل الصور ({data.design.photo_count})
                  </button>
                )}
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex h-9 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white"
                >
                  <ImagePlus size={14} />
                  إضافة صور من تذكرات
                </button>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {groups.map((g) => (
              <div
                key={g.workType}
                data-testid={`drop-group-${g.workType}`}
                onDragOver={(e) => {
                  if (!locked) e.preventDefault()
                }}
                onDrop={(e) => {
                  if (locked) return
                  e.preventDefault()
                  commitMove(g.workType, null)
                }}
                className={`rounded-xl border bg-white p-3 transition ${
                  dragRow ? 'border-dashed border-emerald-500' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <b className="text-xs text-sky-900">
                    {g.workType} <span className="text-slate-400">({g.photos.length})</span>
                  </b>
                  {!locked && (
                    <button
                      onClick={() => removeMany(g.photos.map((p) => p.rowId), `من فقرة «${g.workType}»`)}
                      disabled={removePhotos.isPending}
                      className="mr-auto flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                      data-testid={`remove-group-${g.workType}`}
                    >
                      <Trash2 size={12} />
                      حذف صور الفقرة
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {g.photos.map((p) => (
                    <div
                      key={p.rowId}
                      data-testid={`drag-${p.rowId}`}
                      draggable={!locked}
                      onDragStart={() => setDragRow(p.rowId)}
                      onDragEnd={() => setDragRow(null)}
                      onDragOver={(e) => {
                        if (!locked) {
                          e.preventDefault()
                          e.stopPropagation()
                        }
                      }}
                      onDrop={(e) => {
                        if (locked) return
                        e.preventDefault()
                        e.stopPropagation()
                        commitMove(g.workType, p.rowId)
                      }}
                      className={`relative cursor-grab active:cursor-grabbing ${
                        dragRow === p.rowId ? 'opacity-40' : ''
                      }`}
                    >
                      <DesignThumb path={p.path} caption={p.caption} onOpen={setLightbox} />
                      <span className="absolute right-0 top-0 grid size-5 place-items-center rounded-br-lg bg-slate-800/70 text-white">
                        ⠿
                      </span>
                      {!locked && (
                        <button
                          aria-label="إزالة من التصميم"
                          onClick={() => removePhoto.mutate([p.rowId], { onSuccess: () => detail.refetch() })}
                          className="absolute -left-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length && (
              <p className="rounded-xl border border-dashed bg-white p-6 text-center text-xs text-slate-400">
                لا توجد صور في هذا التصميم بعد.
              </p>
            )}
          </div>
        </section>

        {/* الأزرار */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPreview(!preview)}
            className="flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white"
          >
            <LayoutTemplate size={15} />
            {preview ? 'إخفاء المعاينة' : 'معاينة التقرير'}
          </button>
          {preview && (
            <>
              <button
                onClick={() => window.print()}
                className="no-print flex h-11 items-center gap-2 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white"
              >
                <Printer size={15} />
                طباعة
              </button>
              <DesignExportMenu title={title || data.design.title} wordData={wordRef} />
            </>
          )}
          {!locked && (
            <>
              <button
                onClick={() => complete.mutate([designId], { onSuccess: () => detail.refetch() })}
                disabled={data.design.photo_count === 0 || complete.isPending}
                className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-black text-white disabled:opacity-40"
              >
                إكمال التصميم وقفله
              </button>
              <button
                onClick={() => deleteIfConfirmed()}
                disabled={deleteDesign.isPending}
                className="flex h-11 items-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-sm font-bold text-red-600"
              >
                <Trash2 size={14} />
                حذف المسودة
              </button>
            </>
          )}
        </div>
      </div>

      {/* المعاينة الحية — خارج المحتوى المخفي حتى تُفصل الأوراق فصلاً سليماً عند الطباعة */}
        {preview && (
          <div data-rp-preview className="p-4">
            <p className="no-print mx-auto mb-3 max-w-6xl rounded-xl border border-emerald-300 bg-emerald-50 p-2 text-center text-[11px] font-bold text-emerald-800">
              الطباعة جاهزة: كل ورقة على صفحة مستقلة، الألوان تُطبع كما هي، ورؤوس المتصفح (التاريخ
              والعنوان والرابط والترقيم) مُلغاة تلقائياً.
            </p>
            <DesignReportView
              title={title || data.design.title}
              sector={sector}
              periodType={periodType}
              periodStart={period.start}
              periodEnd={period.end}
              coverUrl={coverUrl}
              coverPath={coverPath}
              shift={shift}
              sheets={Object.fromEntries((data.sheets ?? []).map((s) => [s.work_type, s.sheet_text]))}
              summary={(data.design.summary as unknown as ReportSummary | null) ?? null}
              colors={(data.design.template_colors as unknown as ReportColors | null) ?? null}
              style={(data.design.template_style as unknown as ReportStyle | null) ?? null}
              groups={groups.map((g) => ({
                workType: g.workType,
                photos: g.photos.map((p) => ({
                  id: p.id,
                  rowId: p.rowId,
                  path: p.path,
                  caption: p.caption,
                  reportCaption: p.reportCaption,
                  fit: p.fit,
                  zoom: p.zoom,
                })),
              }))}
              onSaveReport={(sh, caps, extra) => saveReport.mutateAsync([sh, caps, extra])}
              wordDataRef={wordRef}
            />
          </div>
        )}

      {/* عارض الصور */}
      {lightbox && (
        <button
          data-testid="lightbox"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-6"
          aria-label="إغلاق العارض"
        >
          <img
            src={lightbox.url}
            alt={lightbox.caption ?? ''}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <span className="absolute bottom-4 rounded-full bg-white/10 px-4 py-1 text-xs font-bold text-white">
            {lightbox.caption ?? ''} — انقر للإغلاق
          </span>
        </button>
      )}

      {addOpen && (
        <AddPhotosDialog
          sector={sector}
          excludePhotoIds={new Set(
            (data.photos ?? [])
              .map((p) => p.source_photo_id)
              .filter((id): id is string => Boolean(id)),
          )}
          onAdd={(photos) => {
            addPhotos.mutate(
              [designId, photos.map((p) => ({ photoId: p.photoId, workType: p.workType, caption: p.caption }))],
              {
                onSuccess: () => {
                  setAddOpen(false)
                  detail.refetch()
                },
              },
            )
          }}
          close={() => setAddOpen(false)}
        />
      )}
    </div>,
    document.body,
  )

  function deleteIfConfirmed() {
    if (window.confirm('حذف هذا التصميم (المسودة) نهائياً؟')) {
      void deleteDesign.mutate([designId], { onSuccess: close })
    }
  }
}

function DesignThumb({
  path,
  caption,
  onOpen,
}: {
  path: string
  caption: string | null
  onOpen: (v: { url: string; caption: string | null }) => void
}) {
  const urls = useSignedPhotoUrls([path])
  const url = urls.data?.[path]
  return (
    <figure className="w-32 overflow-hidden rounded-lg border bg-white">
      <button
        type="button"
        aria-label="فتح الصورة"
        onClick={() => url && onOpen({ url, caption })}
        className="block aspect-video w-full relative bg-slate-100"
      >
        {url ? (
          <span className="flex size-full items-center justify-center">
            <img src={url} alt={caption ?? ''} className="size-full object-cover" loading="lazy" />
            <span className="absolute grid size-7 place-items-center rounded-full bg-black/45 text-white">
              <Eye size={14} />
            </span>
          </span>
        ) : (
          <span className="grid size-full place-items-center text-[10px] text-slate-300">…</span>
        )}
      </button>
      {caption && <figcaption className="truncate px-1.5 py-1 text-[9px] text-slate-500">{caption}</figcaption>}
    </figure>
  )
}

/* إضافة صور من تذكرات القاطع */
function AddPhotosDialog({
  sector,
  excludePhotoIds,
  onAdd,
  close,
}: {
  sector: SectorParent
  excludePhotoIds: Set<string>
  onAdd: (photos: Array<{ photoId: string; workType: string; caption: string }>) => void
  close: () => void
}) {
  const tickets = useSubmissions(sector, 'all')
  const [ticketId, setTicketId] = useState('')
  const ticket = (tickets.data ?? []).find((t) => t.id === ticketId)
  const photos = useSubmissionPhotos(ticketId || null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <DialogShell title="إضافة صور من تذكرات" close={close}>
      <select
        value={ticketId}
        onChange={(e) => {
          setTicketId(e.target.value)
          setSelected(new Set())
        }}
        className="h-11 w-full rounded-xl border px-3 text-sm"
      >
        <option value="">اختر التذكرة…</option>
        {(tickets.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} ({t.work_type ?? 'دون نوع'} · {t.photo_count} صورة)
          </option>
        ))}
      </select>

      {ticketId && (
        <div className="mt-3 max-h-72 overflow-y-auto">
          {photos.isLoading ? (
            <LoadingSpinner label="…" />
          ) : (
            <PhotoGrid
              items={(photos.data ?? [])
                .filter((p) => !excludePhotoIds.has(p.id))
                .map((p) => ({ id: p.id, path: p.storage_path, caption: p.caption }))}
              selectable
              selected={selected}
              onToggle={toggle}
            />
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={close} className="h-11 rounded-xl border">
          إلغاء
        </button>
        <button
          disabled={!selected.size}
          onClick={() =>
            onAdd(
              (photos.data ?? [])
                .filter((p) => selected.has(p.id))
                .map((p) => ({ photoId: p.id, workType: ticket ? designGroupLabel(ticket) : 'عام', caption: p.caption ?? '' })),
            )
          }
          className="h-11 rounded-xl bg-emerald-700 text-sm font-black text-white disabled:opacity-40"
        >
          إضافة المحدد ({selected.size})
        </button>
      </div>
    </DialogShell>
  )
}

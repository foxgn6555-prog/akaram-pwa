/**
 * 00199 — مكتبة الغلافات (بوابة الإعلام).
 * أغلفة احترافية جاهزة تُحفظ مرة واحدة ويُختار منها غلاف التصميم/القالب بضغطة.
 *  · `CoverLibraryDialog`: نافذة اختيار (شبكة أغلفة + ترشيح بالقاطع/الفترة/البحث) مع إضافة غلاف جديد للمكتبة، تعديل بياناته، أرشفة/استعادة.
 *  · `SaveCoverToLibraryButton`: زر «حفظ هذا الغلاف في المكتبة» لغلاف مرفوع يدوياً.
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Archive, Check, Images, Pencil, RotateCcw, Save, Search, Upload, X } from 'lucide-react'
import {
  useAddMediaCover,
  useMediaCovers,
  useSaveCoverToLibrary,
  useSetMediaCoverStatus,
  useSignedPhotoUrls,
  useTouchMediaCover,
  useUpdateMediaCover,
  type MediaCover,
  type MediaCoverInput,
} from '@features/media/hooks'
import { PERIODS, PERIOD_LABEL, SECTOR_LABEL, type PeriodType, type SectorParent } from '@features/media/constants'
import { COVER_TEMPLATES, SHIFT_LABEL, builtinCoverPath, rankTemplates, type CoverContext, type CoverShift } from '@features/media/lib/cover-templates'
import CoverTemplate from './CoverTemplate'

/** ترشيح نقي (مُختبر): القاطع/الفترة «العامة» (null) تظهر دائماً؛ البحث في العنوان والوسوم */
export function filterCovers(covers: MediaCover[], f: { sector?: string | null; periodType?: string | null; shift?: string | null; q?: string }): MediaCover[] {
  const q = (f.q ?? '').trim()
  return covers.filter(
    (c) =>
      (!f.sector || !c.sector_parent || c.sector_parent === f.sector) &&
      (!f.periodType || !c.period_type || c.period_type === f.periodType) &&
      (!f.shift || !c.shift || c.shift === f.shift) &&
      (!q || c.title.includes(q) || c.tags.includes(q)),
  )
}

const SECTOR_OPTIONS: Array<{ value: SectorParent | ''; label: string }> = [
  { value: '', label: 'كل القواطع' },
  { value: 'karrada', label: SECTOR_LABEL.karrada },
  { value: 'zaafaraniya', label: SECTOR_LABEL.zaafaraniya },
]

function CoverMetaForm({
  initial,
  onSubmit,
  busy,
  submitLabel,
  cancel,
}: {
  initial: MediaCoverInput
  onSubmit: (v: MediaCoverInput) => void
  busy: boolean
  submitLabel: string
  cancel: () => void
}) {
  const [v, setV] = useState<MediaCoverInput>(initial)
  const valid = v.title.trim().length >= 2
  return (
    <form
      className="grid gap-2 rounded-xl border bg-slate-50 p-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit({ ...v, title: v.title.trim(), tags: v.tags.trim() })
      }}
    >
      <label>
        <span className="mb-1 block font-bold text-slate-600">عنوان الغلاف</span>
        <input data-testid="cover-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className="h-10 w-full rounded-lg border px-2" placeholder="مثال: الإنجاز اليومي — الكرادة (ليلي)" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block font-bold text-slate-600">القاطع</span>
          <select data-testid="cover-sector" value={v.sector ?? ''} onChange={(e) => setV({ ...v, sector: e.target.value || null })} className="h-10 w-full rounded-lg border bg-white px-2">
            <option value="">عام (كل القواطع)</option>
            <option value="karrada">{SECTOR_LABEL.karrada}</option>
            <option value="zaafaraniya">{SECTOR_LABEL.zaafaraniya}</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block font-bold text-slate-600">نوع التقرير</span>
          <select data-testid="cover-period" value={v.periodType ?? ''} onChange={(e) => setV({ ...v, periodType: e.target.value || null })} className="h-10 w-full rounded-lg border bg-white px-2">
            <option value="">عام (كل الأنواع)</option>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span className="mb-1 block font-bold text-slate-600">وسوم (اختياري)</span>
        <input value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} className="h-10 w-full rounded-lg border px-2" placeholder="ليلي، صباحي، رسمي…" />
      </label>
      <div className="flex gap-2">
        <button type="submit" data-testid="cover-meta-submit" disabled={!valid || busy} className="flex h-10 items-center gap-1 rounded-lg bg-fuchsia-700 px-4 font-black text-white disabled:opacity-40">
          <Save size={13} /> {busy ? 'جارٍ الحفظ…' : submitLabel}
        </button>
        <button type="button" onClick={cancel} className="h-10 rounded-lg border px-3 font-bold">
          إلغاء
        </button>
      </div>
    </form>
  )
}

export function CoverLibraryDialog({
  close,
  onPick,
  defaultSector,
  defaultPeriod,
  current,
  ctx,
}: {
  close: () => void
  /** يُستدعى بمسار الغلاف المختار (مع تسجيل الاستخدام) */
  onPick?: (storagePath: string, cover: MediaCover) => void
  defaultSector?: SectorParent | null
  defaultPeriod?: PeriodType | null
  /** المسار الحالي للتصميم/القالب لتمييزه */
  current?: string | null
  /** 00200: سياق التصميم لمعاينة القوالب الجاهزة بنصوصها الحيّة */
  ctx?: CoverContext
}) {
  const [showArchived, setShowArchived] = useState(false)
  const [shift, setShift] = useState<string>(ctx?.shift ?? '')
  const covers = useMediaCovers(showArchived)
  const [sector, setSector] = useState<string>(defaultSector ?? '')
  const [periodType, setPeriodType] = useState<string>(defaultPeriod ?? '')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState<File | null>(null)
  const [editing, setEditing] = useState<MediaCover | null>(null)
  const add = useAddMediaCover()
  const update = useUpdateMediaCover()
  const setStatus = useSetMediaCoverStatus()
  const touch = useTouchMediaCover()

  const list = useMemo(() => filterCovers(covers.data ?? [], { sector, periodType, shift, q }), [covers.data, sector, periodType, shift, q])
  const previewCtx: CoverContext = ctx ?? { periodType: (periodType as PeriodType) || 'daily', sector: (sector as SectorParent) || 'karrada', periodStart: new Date().toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), shift: (shift as CoverShift) || null }
  const templates = useMemo(() => rankTemplates(COVER_TEMPLATES, (shift as CoverShift) || null), [shift])
  const urls = useSignedPhotoUrls(list.map((c) => c.storage_path)).data ?? {}

  const pick = (c: MediaCover) => {
    touch.mutate([c.id])
    onPick?.(c.storage_path, c)
    close()
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="مكتبة الغلافات" data-testid="cover-library">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <Images size={16} className="text-fuchsia-700" /> مكتبة الغلافات
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{list.length}</span>
          </h2>
          <button type="button" onClick={close} aria-label="إغلاق" className="rounded-lg p-1 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
          <label className="relative">
            <Search size={13} className="absolute end-2 top-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالعنوان/الوسم" className="h-9 w-44 rounded-lg border pe-7 ps-2" data-testid="cover-search" />
          </label>
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="h-9 rounded-lg border bg-white px-2" data-testid="cover-filter-sector">
            {SECTOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select value={periodType} onChange={(e) => setPeriodType(e.target.value)} className="h-9 rounded-lg border bg-white px-2" data-testid="cover-filter-period">
            <option value="">كل الأنواع</option>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select value={shift} onChange={(e) => setShift(e.target.value)} className="h-9 rounded-lg border bg-white px-2" data-testid="cover-filter-shift">
            <option value="">كل الشفتات</option>
            <option value="morning">{SHIFT_LABEL.morning}</option>
            <option value="night">{SHIFT_LABEL.night}</option>
          </select>
          <label className="flex items-center gap-1 font-bold text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> إظهار المؤرشفة
          </label>
          <label className="ms-auto flex h-9 cursor-pointer items-center gap-1 rounded-lg bg-fuchsia-700 px-3 font-black text-white">
            <Upload size={13} /> إضافة غلاف للمكتبة
            <input data-testid="cover-add-file" type="file" accept="image/*" className="hidden" onChange={(e) => setAdding(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {adding && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-bold text-slate-600">الملف: {adding.name}</p>
              <CoverMetaForm
                initial={{ title: adding.name.replace(/\.[a-z0-9]+$/i, ''), sector: (sector as SectorParent) || null, periodType: periodType || null, tags: '' }}
                busy={add.isPending}
                submitLabel="رفع وحفظ في المكتبة"
                cancel={() => setAdding(null)}
                onSubmit={(v) => add.mutate([adding, v], { onSuccess: () => setAdding(null) })}
              />
            </div>
          )}
          {editing && (
            <div className="mb-3">
              <p className="mb-1 text-xs font-bold text-slate-600">تعديل بيانات: {editing.title}</p>
              <CoverMetaForm
                initial={{ title: editing.title, sector: editing.sector_parent, periodType: editing.period_type, tags: editing.tags }}
                busy={update.isPending}
                submitLabel="حفظ"
                cancel={() => setEditing(null)}
                onSubmit={(v) => update.mutate([editing.id, v], { onSuccess: () => setEditing(null) })}
              />
            </div>
          )}

          {/* 00200: القوالب الجاهزة — نصوصها تتغير تلقائياً مع نوع التقرير والبلدية والتاريخ والشفت */}
          <section className="mb-4" data-testid="builtin-templates">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-black text-slate-800">
              قوالب جاهزة (ديناميكية)
              <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold text-fuchsia-800">{templates.length}</span>
              <span className="font-normal text-slate-500">— العنوان والبلدية والتاريخ والشفت تُكتب تلقائياً من بيانات التصميم</span>
            </h3>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {templates.map((t) => {
                const path = builtinCoverPath(t.id)
                const isCurrent = current === path
                return (
                  <li key={t.id} className={`overflow-hidden rounded-xl border ${isCurrent ? 'border-fuchsia-600 ring-2 ring-fuchsia-200' : 'border-slate-200'}`} data-testid={`template-item-${t.id}`}>
                    <button
                      type="button"
                      disabled={!onPick}
                      onClick={() => {
                        onPick?.(path, { id: path, title: t.title, storage_path: path, sector_parent: null, period_type: null, tags: '', use_count: 0, status: 'active', created_at: '', updated_at: '' })
                        close()
                      }}
                      className="block w-full"
                      aria-label={`اختيار القالب ${t.title}`}
                      data-testid={`template-pick-${t.id}`}
                    >
                      <CoverTemplate def={t} ctx={previewCtx} />
                    </button>
                    <p className="truncate p-1.5 text-center text-[10px] font-bold text-slate-700" title={t.title}>
                      {isCurrent && <Check size={10} className="me-1 inline text-fuchsia-700" />}
                      {t.title}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>
          <h3 className="mb-2 text-xs font-black text-slate-800">أغلفة مرفوعة (صور ثابتة)</h3>

          {covers.isLoading ? (
            <p className="py-10 text-center text-xs text-slate-500">جارٍ تحميل المكتبة…</p>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed py-12 text-center text-xs text-slate-500" data-testid="cover-library-empty">
              لا توجد أغلفة مطابقة — أضف غلافاً جاهزاً بزر «إضافة غلاف للمكتبة».
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" data-testid="cover-grid">
              {list.map((c) => {
                const isCurrent = current != null && current === c.storage_path
                return (
                  <li key={c.id} className={`overflow-hidden rounded-xl border ${isCurrent ? 'border-fuchsia-600 ring-2 ring-fuchsia-200' : 'border-slate-200'} ${c.status === 'archived' ? 'opacity-60' : ''}`} data-testid={`cover-item-${c.id}`}>
                    <button
                      type="button"
                      disabled={!onPick || c.status === 'archived'}
                      onClick={() => pick(c)}
                      className="block w-full"
                      aria-label={`اختيار الغلاف ${c.title}`}
                      data-testid={`cover-pick-${c.id}`}
                    >
                      <div className="aspect-[210/297] w-full bg-slate-100">
                        {urls[c.storage_path] ? <img src={urls[c.storage_path]} alt={c.title} className="size-full object-cover" loading="lazy" /> : <div className="grid size-full place-items-center text-[10px] text-slate-400">…</div>}
                      </div>
                    </button>
                    <div className="p-2 text-[11px]">
                      <p className="truncate font-black text-slate-800" title={c.title}>
                        {isCurrent && <Check size={11} className="me-1 inline text-fuchsia-700" />}
                        {c.title}
                      </p>
                      <p className="truncate text-slate-500">
                        {c.sector_parent ? SECTOR_LABEL[c.sector_parent as SectorParent] : 'عام'} · {c.period_type ? PERIOD_LABEL[c.period_type as PeriodType] : 'كل الأنواع'}
                        {c.use_count > 0 ? ` · استُخدم ${c.use_count}` : ''}
                      </p>
                      <div className="mt-1 flex gap-1">
                        <button type="button" onClick={() => setEditing(c)} className="flex h-7 items-center gap-1 rounded-md border px-2 font-bold" aria-label={`تعديل ${c.title}`}>
                          <Pencil size={11} /> تعديل
                        </button>
                        {c.status === 'active' ? (
                          <button type="button" onClick={() => setStatus.mutate([c.id, 'archived'])} className="flex h-7 items-center gap-1 rounded-md border px-2 font-bold text-red-600" aria-label={`أرشفة ${c.title}`}>
                            <Archive size={11} /> أرشفة
                          </button>
                        ) : (
                          <button type="button" onClick={() => setStatus.mutate([c.id, 'active'])} className="flex h-7 items-center gap-1 rounded-md border px-2 font-bold text-emerald-700" aria-label={`استعادة ${c.title}`}>
                            <RotateCcw size={11} /> استعادة
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** زر فتح المكتبة للاختيار */
export function PickCoverButton({ onPick, defaultSector, defaultPeriod, current, disabled, ctx }: { onPick: (path: string, cover: MediaCover) => void; defaultSector?: SectorParent | null; defaultPeriod?: PeriodType | null; current?: string | null; disabled?: boolean; ctx?: CoverContext }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-testid="open-cover-library" disabled={disabled} onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-xl border border-fuchsia-300 px-4 text-xs font-bold text-fuchsia-800 hover:bg-fuchsia-50 disabled:opacity-40">
        <Images size={14} /> اختيار من المكتبة
      </button>
      {open && <CoverLibraryDialog close={() => setOpen(false)} onPick={onPick} defaultSector={defaultSector} defaultPeriod={defaultPeriod} current={current} ctx={ctx} />}
    </>
  )
}

/** زر حفظ غلاف مرفوع يدوياً في المكتبة (لإعادة استخدامه لاحقاً) */
export function SaveCoverToLibraryButton({ storagePath, defaultTitle, defaultSector, defaultPeriod }: { storagePath: string; defaultTitle: string; defaultSector?: SectorParent | null; defaultPeriod?: PeriodType | null }) {
  const [open, setOpen] = useState(false)
  const save = useSaveCoverToLibrary()
  return (
    <>
      <button type="button" data-testid="save-cover-to-library" onClick={() => setOpen(true)} className="flex h-10 items-center gap-1 rounded-xl border px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
        <Save size={13} /> حفظ في المكتبة
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="حفظ الغلاف في المكتبة">
            <div className="w-full max-w-md rounded-2xl bg-white p-4">
              <h2 className="mb-2 text-sm font-black">حفظ الغلاف في المكتبة</h2>
              <CoverMetaForm
                initial={{ title: defaultTitle, sector: defaultSector ?? null, periodType: defaultPeriod ?? null, tags: '' }}
                busy={save.isPending}
                submitLabel="حفظ"
                cancel={() => setOpen(false)}
                onSubmit={(v) => save.mutate([storagePath, v], { onSuccess: () => setOpen(false) })}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

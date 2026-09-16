/**
 * التقرير المصور النهائي — بنية الأوراق المطبوعة:
 *  · الورقة 1: الغلاف صورة يُضيفها مسؤول الإعلام يدوياً كما هي
 *     (وإن لم يُرفع غلاف: ورقة بيضاء بإطار أسود وعنوان التصميم في المنتصف)
 *  · الورقة 2: صفحة الجدول الرسمية (الشعارات + الجهة/الموضوع/التاريخ + الفقرات
 *     المنجزة + التذييل) — مطابقة للقالب اليدوي وقابلة للتعديل بالكامل
 *  · لكل نوع عمل: ورقة نص وسطية (إطار أسود + نص أوسط) ثم صفحات 2×2 بأربع صور،
 *     العبارة فوق كل صورة قابلة للتعديل، وعرض الصورة كامل/مقتطع مع تقريب،
 *     وألوان القالب قابلة للتغيير — وكل ذلك يُحفظ في قاعدة البيانات
 */
import { useMemo, useState } from 'react'
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react'
import {
  PERIOD_LABEL,
  SECTOR_LABEL,
  periodRange,
  type PeriodType,
  type SectorParent,
} from '@features/media/constants'
import { useSignedPhotoUrls } from '@features/media/hooks'

export interface ReportPhoto {
  id: string
  rowId: string
  path: string
  caption?: string | null
  reportCaption?: string | null
  fit?: 'contain' | 'cover'
  zoom?: number
}

export interface ReportSummaryRow {
  t: string
  work: string
}
export interface ReportSummary {
  companyName: string
  reportLine: string
  orgLabel: string
  orgValue: string
  subjectLabel: string
  subjectValue: string
  dateLabel: string
  dateValue: string
  sectorName: string
  rows: ReportSummaryRow[]
  footer: string
}
export interface ReportColors {
  barFrom: string
  barTo: string
  border: string
  barText: string
}

export interface DesignReportData {
  title: string
  sector?: SectorParent
  periodType?: PeriodType
  periodStart?: string
  periodEnd?: string
  coverUrl?: string | null
  groups: Array<{ workType: string; photos: ReportPhoto[] }>
  /** نص الورقة الوسطية المحفوظ لكل نوع عمل */
  sheets?: Record<string, string>
  summary?: ReportSummary | null
  colors?: ReportColors | null
  onSaveReport?: (
    sheets: Array<{ workType: string; text: string }>,
    captions: Array<{ rowId: string; text: string; fit: 'contain' | 'cover'; zoom: number }>,
    extra: { summary: ReportSummary; colors: ReportColors },
  ) => Promise<void>
}

const AR_MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
]
const arDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const DEFAULT_COLORS: ReportColors = {
  barFrom: '#fbfbfb',
  barTo: '#c9c9c9',
  border: '#444444',
  barText: '#1a1a1a',
}

const chunk4 = <T,>(arr: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4))
  return out
}

function buildDefaultSummary(d: DesignReportData): ReportSummary {
  const sector = d.sector ?? 'karrada'
  const period = d.periodType ?? 'first_half'
  const range = periodRange(period)
  const start = d.periodStart || range.start
  const end = d.periodEnd || range.end
  return {
    companyName: 'شركة جزيرة الاكارم وفيرست ترايد',
    reportLine: `التقرير المصور ${PERIOD_LABEL[period]} / ${SECTOR_LABEL[sector]}`,
    orgLabel: 'الجهة المنظمة للتقرير',
    orgValue: 'شركة جزيرة الاكارم وفيرست ترايد',
    subjectLabel: 'موضوع التقرير',
    subjectValue: `التقرير المصور للفعاليات اليومية المصورة لقطاع ${SECTOR_LABEL[sector]}`,
    dateLabel: 'التاريخ من',
    dateValue: `من ${arDate(start)} الى ${arDate(end)}`,
    sectorName: SECTOR_LABEL[sector],
    rows: d.groups.map((g, i) => ({ t: String(i + 1), work: g.workType })),
    footer: 'الجهة المتصرفة لجنة الإشراف والمراقبة والتقييم في أمانة بغداد',
  }
}

/* نص قابل للتعديل بالنقر (شاشة فقط) — الطباعة تعرض القيمة النهائية */
function EditableText({
  value,
  onCommit,
  className,
  inputClassName,
  label,
  style,
}: {
  value: string
  onCommit?: (next: string) => void
  className: string
  inputClassName: string
  label: string
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!onCommit)
    return (
      <span className={className} style={style}>
        {value}
      </span>
    )
  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onCommit(draft.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setEditing(false)
            onCommit(draft.trim())
          }
        }}
        className={inputClassName}
        style={style}
      />
    )
  }
  return (
    <button
      type="button"
      title="انقر لتعديل النص"
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={`${className} rp-editable`}
      style={style}
    >
      {value}
    </button>
  )
}

export default function DesignReportView({
  title,
  coverUrl,
  groups,
  sheets,
  summary,
  colors,
  onSaveReport,
  ...periodProps
}: DesignReportData) {
  const allPaths = useMemo(() => groups.flatMap((g) => g.photos.map((p) => p.path)), [groups])
  const urls = useSignedPhotoUrls(allPaths).data ?? {}

  const [sheetTexts, setSheetTexts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const g of groups) init[g.workType] = sheets?.[g.workType] ?? g.workType
    return init
  })
  const [captions, setCaptions] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const g of groups)
      for (const p of g.photos) init[p.rowId] = p.reportCaption ?? p.caption ?? g.workType
    return init
  })
  const [fits, setFits] = useState<Record<string, { fit: 'contain' | 'cover'; zoom: number }>>(() => {
    const init: Record<string, { fit: 'contain' | 'cover'; zoom: number }> = {}
    for (const g of groups)
      for (const p of g.photos) init[p.rowId] = { fit: p.fit ?? 'contain', zoom: p.zoom ?? 1 }
    return init
  })
  const [sum, setSum] = useState<ReportSummary>(() => summary ?? buildDefaultSummary({ ...periodProps, title, groups }))
  const [cols, setCols] = useState<ReportColors>(() => ({ ...DEFAULT_COLORS, ...colors }))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const editable = Boolean(onSaveReport)
  const mark = () => setDirty(true)

  const patchSum = (patch: Partial<ReportSummary>) => {
    setSum((s) => ({ ...s, ...patch }))
    mark()
  }

  const save = async () => {
    if (!onSaveReport) return
    setSaving(true)
    try {
      await onSaveReport(
        Object.entries(sheetTexts).map(([workType, text]) => ({ workType, text })),
        Object.entries(captions).map(([rowId, text]) => ({
          rowId,
          text,
          fit: fits[rowId]?.fit ?? 'contain',
          zoom: fits[rowId]?.zoom ?? 1,
        })),
        { summary: sum, colors: cols },
      )
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const barStyle = {
    background: `linear-gradient(${cols.barFrom}, ${cols.barTo})`,
    borderBottom: `1px solid ${cols.border}`,
    color: cols.barText,
  }
  const cellStyle = { border: `1px solid ${cols.border}` }

  return (
    <div id="design-report" dir="rtl">
      <style>{`
        #design-report { background: transparent; }
        .rp-page {
          position: relative;
          width: 190mm;
          height: 277mm;
          margin: 0 auto 6mm;
          background: #fff;
          box-shadow: 0 2px 12px rgb(15 23 42 / 0.18);
          break-after: page;
          page-break-after: always;
          overflow: hidden;
        }
        .rp-page:last-of-type { break-after: auto; page-break-after: auto; margin-bottom: 0; }
        .rp-cover-img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .rp-sheet-inner {
          position: absolute;
          inset: 5mm;
          border: 2px solid #111;
          display: grid;
          place-items: center;
          padding: 8mm;
        }
        .rp-sheet-text {
          font-size: 15pt;
          font-weight: 700;
          color: #111;
          text-align: center;
          line-height: 1.9;
          max-width: 100%;
        }
        .rp-sheet-input {
          width: 100%;
          font-size: 15pt;
          font-weight: 700;
          color: #111;
          text-align: center;
          border: none;
          border-bottom: 1px dashed #0891b2;
          outline: none;
          background: #f0fdff;
          padding: 2mm;
        }
        /* صفحة الجدول الرسمية */
        .rp-summary { position: absolute; inset: 6mm 8mm; display: flex; flex-direction: column; }
        .rp-summary table { border-collapse: collapse; width: 100%; }
        .rp-summary td, .rp-summary th { border: 1px solid #7ba7d7; padding: 2mm 3mm; font-size: 10pt; }
        .rp-sum-in { width: 100%; border: 0; outline: none; background: transparent; font: inherit; text-align: inherit; }
        .rp-grid {
          position: absolute;
          inset: 4mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 2.5mm;
        }
        .rp-cell { display: flex; flex-direction: column; min-height: 0; background: #fff; }
        .rp-bar { text-align: center; font-size: 10pt; font-weight: 800; padding: 1.6mm 1mm; width: 100%; }
        .rp-bar-input {
          width: 100%;
          text-align: center;
          font-size: 10pt;
          font-weight: 800;
          border: none;
          outline: none;
          background: #f0fdff;
          padding: 1.6mm 1mm;
        }
        .rp-photo { flex: 1; min-height: 0; background: #f1f5f9; overflow: hidden; position: relative; }
        .rp-photo img { width: 100%; height: 100%; display: block; }
        .rp-celltools { position: absolute; bottom: 1mm; left: 1mm; display: flex; gap: 1mm; }
        .rp-celltools button {
          width: 6mm; height: 6mm; display: grid; place-items: center;
          background: rgb(255 255 255 / 0.92); border: 1px solid #94a3b8; border-radius: 2mm;
          color: #0f172a; cursor: pointer;
        }
        .rp-editable { display: block; width: 100%; margin: 0; background: none; border: 0; }
        @media screen {
          .rp-editable { cursor: text; }
          .rp-editable:hover { outline: 1.5px dashed #0891b2; outline-offset: 2px; }
        }
        @media print {
          body * { visibility: hidden; }
          #design-report, #design-report * { visibility: visible; }
          #design-report { position: absolute; inset: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
          .rp-page { box-shadow: none; margin: 0 auto; }
        }
      `}</style>

      {/* شريط أدوات الشاشة فقط: تلميح + ألوان القالب + حفظ */}
      {editable && (
        <div className="no-print sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/95 p-2 text-xs font-bold text-slate-600">
          <span>انقر أي نص داخل الأوراق لتعديله.</span>
          <label className="flex items-center gap-1">
            شريط العبارة
            <input
              aria-label="لون الشريط العلوي"
              type="color"
              value={cols.barFrom}
              onChange={(e) => {
                setCols((c) => ({ ...c, barFrom: e.target.value }))
                mark()
              }}
            />
            <input
              aria-label="لون الشريط السفلي"
              type="color"
              value={cols.barTo}
              onChange={(e) => {
                setCols((c) => ({ ...c, barTo: e.target.value }))
                mark()
              }}
            />
          </label>
          <label className="flex items-center gap-1">
            الحدود
            <input
              aria-label="لون الحدود"
              type="color"
              value={cols.border}
              onChange={(e) => {
                setCols((c) => ({ ...c, border: e.target.value }))
                mark()
              }}
            />
          </label>
          <label className="flex items-center gap-1">
            نص الشريط
            <input
              aria-label="لون نص الشريط"
              type="color"
              value={cols.barText}
              onChange={(e) => {
                setCols((c) => ({ ...c, barText: e.target.value }))
                mark()
              }}
            />
          </label>
          {dirty && (
            <button
              type="button"
              data-testid="report-save"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-cyan-700 px-4 py-2 font-black text-white disabled:opacity-50"
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
            </button>
          )}
        </div>
      )}

      {/* الورقة 1: الغلاف اليدوي كما هو */}
      <section className="rp-page">
        {coverUrl ? (
          <img src={coverUrl} alt="غلاف التقرير" className="rp-cover-img" />
        ) : (
          <div className="rp-sheet-inner">
            <p className="rp-sheet-text">{title}</p>
          </div>
        )}
      </section>

      {/* الورقة 2: صفحة الجدول الرسمية — قابلة للتعديل بالكامل */}
      <section className="rp-page">
        <div className="rp-summary">
          <div className="flex items-start justify-between gap-2 pb-2">
            <img src="/report-assets/logo-company.png" alt="شعار الشركة" className="h-16 w-28 object-contain" />
            <div className="pt-1 text-center">
              <EditableText
                label="اسم الشركة"
                value={sum.companyName}
                onCommit={editable ? (v) => patchSum({ companyName: v }) : undefined}
                className="text-[13pt] font-black text-blue-800"
                inputClassName="rp-sum-in text-center font-black text-blue-800"
              />
              <EditableText
                label="سطر التقرير"
                value={sum.reportLine}
                onCommit={editable ? (v) => patchSum({ reportLine: v }) : undefined}
                className="mt-1 text-[11pt] font-bold text-amber-600"
                inputClassName="rp-sum-in text-center font-bold text-amber-600"
              />
            </div>
            <img src="/report-assets/logo-baghdad.png" alt="شعار أمانة بغداد" className="h-16 w-24 object-contain" />
          </div>

          <table>
            <tbody>
              <tr className="bg-[#1e3a8a] text-white">
                <td className="w-44 font-black">
                  <EditableText
                    label="عنوان الجهة"
                    value={sum.orgLabel}
                    onCommit={editable ? (v) => patchSum({ orgLabel: v }) : undefined}
                    className="font-black"
                    inputClassName="rp-sum-in font-black text-white"
                  />
                </td>
                <td>
                  <EditableText
                    label="قيمة الجهة"
                    value={sum.orgValue}
                    onCommit={editable ? (v) => patchSum({ orgValue: v }) : undefined}
                    className=""
                    inputClassName="rp-sum-in text-white"
                  />
                </td>
              </tr>
              <tr className="bg-[#1d4ed8] text-white">
                <td className="font-black">
                  <EditableText
                    label="عنوان الموضوع"
                    value={sum.subjectLabel}
                    onCommit={editable ? (v) => patchSum({ subjectLabel: v }) : undefined}
                    className="font-black"
                    inputClassName="rp-sum-in font-black text-white"
                  />
                </td>
                <td>
                  <EditableText
                    label="قيمة الموضوع"
                    value={sum.subjectValue}
                    onCommit={editable ? (v) => patchSum({ subjectValue: v }) : undefined}
                    className=""
                    inputClassName="rp-sum-in text-white"
                  />
                </td>
              </tr>
              <tr className="bg-amber-400 text-slate-900">
                <td className="font-black">
                  <EditableText
                    label="عنوان التاريخ"
                    value={sum.dateLabel}
                    onCommit={editable ? (v) => patchSum({ dateLabel: v }) : undefined}
                    className="font-black"
                    inputClassName="rp-sum-in font-black"
                  />
                </td>
                <td className="font-bold">
                  <EditableText
                    label="قيمة التاريخ"
                    value={sum.dateValue}
                    onCommit={editable ? (v) => patchSum({ dateValue: v }) : undefined}
                    className="font-bold"
                    inputClassName="rp-sum-in font-bold"
                  />
                </td>
              </tr>
              <tr className="bg-sky-100">
                <td className="font-black text-sky-900">الفقرات المنجزة</td>
                <td className="grid grid-cols-[1fr_auto]">
                  <span className="font-black text-sky-900">اسم القاطع</span>
                  <span className="w-8 border-r border-sky-300 text-center font-black text-sky-900">ت</span>
                </td>
              </tr>
              {sum.rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className="flex items-center gap-1">
                      <EditableText
                        label={`فقرة ${i + 1}`}
                        value={r.work}
                        onCommit={
                          editable
                            ? (v) =>
                                patchSum({
                                  rows: sum.rows.map((row, j) => (j === i ? { ...row, work: v } : row)),
                                })
                            : undefined
                        }
                        className="text-right"
                        inputClassName="rp-sum-in"
                      />
                      {editable && (
                        <button
                          type="button"
                          aria-label={`حذف فقرة ${i + 1}`}
                          className="no-print text-red-500"
                          onClick={() => patchSum({ rows: sum.rows.filter((_, j) => j !== i) })}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </td>
                  {i === 0 && (
                    <td
                      rowSpan={sum.rows.length}
                      className="text-center align-middle font-bold text-sky-900"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      <EditableText
                        label="اسم القاطع"
                        value={sum.sectorName}
                        onCommit={editable ? (v) => patchSum({ sectorName: v }) : undefined}
                        className="font-bold"
                        inputClassName="rp-sum-in font-bold"
                      />
                    </td>
                  )}
                  <td className="w-8 text-center">{r.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <button
              type="button"
              className="no-print mt-1 self-start rounded-lg border px-2 py-1 text-[10px] font-bold text-sky-800"
              onClick={() =>
                patchSum({ rows: [...sum.rows, { t: String(sum.rows.length + 1), work: 'فقرة جديدة' }] })
              }
            >
              + إضافة فقرة
            </button>
          )}

          <div className="mt-auto">
            <div className="bg-[#1e3a8a] px-3 py-2 text-center">
              <EditableText
                label="تذييل الصفحة"
                value={sum.footer}
                onCommit={editable ? (v) => patchSum({ footer: v }) : undefined}
                className="text-[10pt] font-black text-white"
                inputClassName="rp-sum-in text-center font-black text-white"
              />
            </div>
          </div>
        </div>
      </section>

      {/* لكل نوع عمل: ورقة نص ثم صفحات 4 صور */}
      {groups.map((g) => (
        <div key={g.workType}>
          <section className="rp-page">
            <div className="rp-sheet-inner">
              <EditableText
                label={`نص ورقة ${g.workType}`}
                value={sheetTexts[g.workType] ?? g.workType}
                onCommit={
                  editable
                    ? (next) => {
                        setSheetTexts((s) => ({ ...s, [g.workType]: next }))
                        mark()
                      }
                    : undefined
                }
                className="rp-sheet-text"
                inputClassName="rp-sheet-input"
              />
            </div>
          </section>

          {chunk4(g.photos).map((four, i) => (
            <section key={`${g.workType}-${i}`} className="rp-page">
              <div className="rp-grid">
                {four.map((p) => {
                  const fz = fits[p.rowId] ?? { fit: 'contain' as const, zoom: 1 }
                  return (
                    <figure key={p.rowId} className="rp-cell" style={cellStyle}>
                      <EditableText
                        label={`عبارة صورة ${g.workType}`}
                        value={captions[p.rowId] ?? p.caption ?? g.workType}
                        onCommit={
                          editable
                            ? (next) => {
                                setCaptions((c) => ({ ...c, [p.rowId]: next }))
                                mark()
                              }
                            : undefined
                        }
                        className="rp-bar"
                        inputClassName="rp-bar-input"
                        style={barStyle}
                      />
                      <div className="rp-photo">
                        {urls[p.path] ? (
                          <img
                            src={urls[p.path]}
                            alt={captions[p.rowId] ?? g.workType}
                            loading="lazy"
                            style={{
                              objectFit: fz.fit,
                              transform: fz.zoom !== 1 ? `scale(${fz.zoom})` : undefined,
                              transformOrigin: 'center',
                            }}
                          />
                        ) : (
                          <div className="grid size-full place-items-center text-xs text-slate-300">…</div>
                        )}
                        {editable && (
                          <div className="rp-celltools no-print">
                            <button
                              type="button"
                              aria-label="تبديل ملء/احتواء"
                              title={fz.fit === 'contain' ? 'عرض كامل — انقر للملء' : 'ملء — انقر للعرض الكامل'}
                              onClick={() => {
                                setFits((f) => ({
                                  ...f,
                                  [p.rowId]: { ...fz, fit: fz.fit === 'contain' ? 'cover' : 'contain' },
                                }))
                                mark()
                              }}
                            >
                              {fz.fit === 'contain' ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                            </button>
                            <button
                              type="button"
                              aria-label="تقريب"
                              onClick={() => {
                                setFits((f) => ({
                                  ...f,
                                  [p.rowId]: { ...fz, zoom: Math.min(3, +(fz.zoom + 0.25).toFixed(2)) },
                                }))
                                mark()
                              }}
                            >
                              <ZoomIn size={12} />
                            </button>
                            <button
                              type="button"
                              aria-label="إبعاد"
                              onClick={() => {
                                setFits((f) => ({
                                  ...f,
                                  [p.rowId]: { ...fz, zoom: Math.max(0.5, +(fz.zoom - 0.25).toFixed(2)) },
                                }))
                                mark()
                              }}
                            >
                              <ZoomOut size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </figure>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ))}
    </div>
  )
}

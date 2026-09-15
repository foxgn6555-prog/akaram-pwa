/**
 * التقرير المصور النهائي — بنية الأوراق المطبوعة:
 *  · الورقة 1: الغلاف صورة يُضيفها مسؤول الإعلام يدوياً كما هي
 *     (وإن لم يُرفع غلاف: ورقة بيضاء بإطار أسود وعنوان التصميم في المنتصف)
 *  · لكل نوع عمل: ورقة نص وسطية مطابقة للقالب (إطار أسود + نص أوسط قابل للتعديل)
 *     ثم صفحات صور: كل 4 صور بتخطيط 2×2 موحّد، والعبارة فوق كل صورة قابلة للتعديل
 *  · التعديلات تُحفظ في قاعدة البيانات عبر onSaveReport
 * قابل للطباعة/التصدير PDF: كل .rp-page ورقة A4 مستقلة
 */
import { useMemo, useState } from 'react'
import { useSignedPhotoUrls } from '@features/media/hooks'

export interface ReportPhoto {
  id: string
  rowId: string
  path: string
  caption?: string | null
  reportCaption?: string | null
}

interface DesignReportData {
  title: string
  coverUrl?: string | null
  groups: Array<{ workType: string; photos: ReportPhoto[] }>
  /** نص الورقة الوسطية المحفوظ لكل نوع عمل */
  sheets?: Record<string, string>
  onSaveReport?: (
    sheets: Array<{ workType: string; text: string }>,
    captions: Array<{ rowId: string; text: string }>,
  ) => Promise<void>
}

const chunk4 = <T,>(arr: T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4))
  return out
}

/* نص قابل للتعديل بالنقر (شاشة فقط) — الطباعة تعرض القيمة النهائية */
function EditableText({
  value,
  onCommit,
  className,
  inputClassName,
  label,
}: {
  value: string
  onCommit?: (next: string) => void
  className: string
  inputClassName: string
  label: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (!onCommit) return <span className={className}>{value}</span>
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
  onSaveReport,
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
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const editable = Boolean(onSaveReport)

  const save = async () => {
    if (!onSaveReport) return
    setSaving(true)
    try {
      await onSaveReport(
        Object.entries(sheetTexts).map(([workType, text]) => ({ workType, text })),
        Object.entries(captions).map(([rowId, text]) => ({ rowId, text })),
      )
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

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
        .rp-grid {
          position: absolute;
          inset: 4mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 2.5mm;
        }
        .rp-cell {
          display: flex;
          flex-direction: column;
          border: 1px solid #444;
          min-height: 0;
          background: #fff;
        }
        .rp-bar {
          background: linear-gradient(#fbfbfb, #c9c9c9);
          border-bottom: 1px solid #444;
          text-align: center;
          font-size: 10pt;
          font-weight: 800;
          color: #1a1a1a;
          padding: 1.6mm 1mm;
          width: 100%;
        }
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
        .rp-photo { flex: 1; min-height: 0; background: #f1f5f9; }
        .rp-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .rp-editable {
          display: block;
          width: 100%;
          margin: 0;
          background: none;
          border: 0;
        }
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

      {/* شريط أدوات الشاشة فقط */}
      {editable && (
        <div className="no-print sticky top-0 z-10 mb-4 flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/95 p-2 text-xs font-bold text-slate-600">
          <span>انقر أي نص داخل الأوراق لتعديله قبل الطباعة.</span>
          {dirty && (
            <button
              type="button"
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
                        setDirty(true)
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
                {four.map((p) => (
                  <figure key={p.rowId} className="rp-cell">
                    <EditableText
                      label={`عبارة صورة ${g.workType}`}
                      value={captions[p.rowId] ?? p.caption ?? g.workType}
                      onCommit={
                        editable
                          ? (next) => {
                              setCaptions((c) => ({ ...c, [p.rowId]: next }))
                              setDirty(true)
                            }
                          : undefined
                      }
                      className="rp-bar"
                      inputClassName="rp-bar-input"
                    />
                    <div className="rp-photo">
                      {urls[p.path] ? (
                        <img src={urls[p.path]} alt={captions[p.rowId] ?? g.workType} loading="lazy" />
                      ) : (
                        <div className="grid size-full place-items-center text-xs text-slate-300">…</div>
                      )}
                    </div>
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}
    </div>
  )
}

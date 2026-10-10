/**
 * قائمة تصدير التقرير المصور كملف: Word (قابل للتعديل) / HTML / PDF / PowerPoint.
 * تلتقط أوراق المعاينة كما هي (مطابقة 100% للطباعة) وتعرض تقدّم المعالجة ورقةً ورقة.
 */
import { useEffect, useRef, useState } from 'react'
import { Download, FileCode2, FileText, FileType2, Presentation, Loader2 } from 'lucide-react'
import { DESIGN_EXPORT_LABEL, exportDesign, type DesignExportFormat } from '@features/media/lib/design-export'
import type { WordReportData } from '@features/media/lib/design-word'

const ICONS: Record<DesignExportFormat, typeof FileText> = { docx: FileType2, html: FileCode2, pdf: FileText, pptx: Presentation }
const HINT: Record<DesignExportFormat, string> = {
  docx: 'ملف وورد: النصوص والجداول قابلة للتحرير والصور قابلة للاستبدال',
  html: 'ملف مستقل يُفتح في أي متصفح والصور مضمّنة',
  pdf: 'كل ورقة صفحة A4 بدقة عالية',
  pptx: 'كل ورقة شريحة مستقلة',
}

/** `wordData` يُعيد بيانات التقرير الحالية لبناء ملف Word (يُسجَّل من معاينة التقرير) */
export type WordDataRef = { current: (() => WordReportData | null) | null }

export default function DesignExportMenu({ title, wordData }: { title: string; wordData?: WordDataRef }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<DesignExportFormat | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const run = async (format: DesignExportFormat) => {
    setOpen(false)
    setError(null)
    setBusy(format)
    setProgress(null)
    try {
      await exportDesign(format, title, (done, total) => setProgress({ done, total }), () => wordData?.current?.() ?? null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg === 'NO_PAGES' ? 'لا توجد أوراق للتصدير — افتح المعاينة أولاً.' : `تعذّر إنشاء الملف (${msg || 'خطأ غير معروف'}) — حاول مرة أخرى.`)
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  return (
    <div ref={ref} className="no-print relative">
      <button
        type="button"
        data-testid="design-export-menu"
        disabled={busy !== null}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-black text-white disabled:opacity-70"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        {busy
          ? `جارٍ ${DESIGN_EXPORT_LABEL[busy]}${progress ? ` (${progress.done}/${progress.total})` : '…'}`
          : 'تصدير كملف'}
      </button>
      {open && (
        <div
          role="menu"
          data-testid="design-export-options"
          className="absolute end-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {(['docx', 'pdf', 'pptx', 'html'] as DesignExportFormat[]).map((f) => {
            const I = ICONS[f]
            return (
              <button
                key={f}
                type="button"
                role="menuitem"
                data-testid={`design-export-${f}`}
                onClick={() => run(f)}
                className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-indigo-50"
              >
                <I size={18} className="mt-0.5 shrink-0 text-indigo-700" />
                <span>
                  <span className="block text-sm font-black text-slate-800">{DESIGN_EXPORT_LABEL[f]}</span>
                  <span className="block text-[11px] text-slate-500">{HINT[f]}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
      {error && (
        <p data-testid="design-export-error" className="absolute end-0 top-12 w-64 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

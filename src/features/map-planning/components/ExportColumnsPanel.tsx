/**
 * لوحة إعداد الأعمدة: اختيار · ترتيب · حفظ · معاينة حيّة.
 *
 * المعاينة تُبنى من **نفس** دالة الصفوف التي يبني بها الملف (`toReportRows`)،
 * فما تراه على الشاشة هو ما يخرج في Excel حرفياً — لا مسارين ينحرفان.
 */
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Save } from 'lucide-react'
import {
  columnsFor,
  moveColumn,
  resolveColumns,
  toReportRows,
  totalRow,
  type ColumnContext,
  type ColumnSelection,
  type ExportKind,
  type Row,
} from '../export-columns'
import { useSaveExportPrefs } from '../hooks/useMapPlanning'

export function ExportColumnsPanel({
  kind,
  selection,
  onChange,
  sampleRows,
  ctx,
}: {
  kind: ExportKind
  selection: ColumnSelection[]
  onChange: (next: ColumnSelection[]) => void
  sampleRows: Row[]
  ctx: ColumnContext
}) {
  const save = useSaveExportPrefs()
  const [showPreview, setShowPreview] = useState(true)

  const ordered = useMemo(() => [...selection].sort((a, b) => a.order - b.order), [selection])
  const resolved = useMemo(() => resolveColumns(kind, selection), [kind, selection])
  const preview = useMemo(
    () => toReportRows(sampleRows.slice(0, 5), resolved, ctx),
    [sampleRows, resolved, ctx],
  )
  const totals = useMemo(() => totalRow(sampleRows, resolved, ctx), [sampleRows, resolved, ctx])

  const visibleCount = ordered.filter((s) => s.visible).length
  const headerOf = (id: string) => columnsFor(kind).find((c) => c.id === id)?.header ?? id

  const move = (id: string, dir: -1 | 1) => {
    const idx = ordered.findIndex((s) => s.id === id)
    const to = idx + dir
    if (idx === -1 || to < 0 || to >= ordered.length) return
    onChange(moveColumn(selection, id, to))
  }

  const setVisible = (id: string, visible: boolean) => {
    // لا سطر مرئي واحد = ملف بلا أعمدة؛ نمنعه في الواجهة كما تمنعه القاعدة
    if (!visible && visibleCount <= 1) return
    onChange(selection.map((s) => (s.id === id ? { ...s, visible } : s)))
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black text-slate-800">أعمدة التقرير</p>
          <p className="text-[10px] font-bold text-slate-500">
            {visibleCount} من {ordered.length} ظاهراً · الترتيب يُحفظ لك وحدك
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}
            className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700">
            {showPreview ? 'إخفاء المعاينة' : 'معاينة'}
          </button>
          <button type="button" onClick={() => save.mutate({ kind, columns: selection })}
            disabled={save.isPending}
            className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">
            <Save size={13} /> {save.isPending ? 'يُحفظ…' : 'حفظ الترتيب'}
          </button>
        </div>
      </header>

      <ul className="grid gap-1 sm:grid-cols-2">
        {ordered.map((s, i) => (
          <li key={s.id}
            className="flex items-center gap-1 rounded-xl border border-slate-100 bg-slate-50/60 px-2 py-1.5">
            <span className="w-5 text-[10px] font-black text-slate-400">{i + 1}</span>
            <span className={`flex-1 text-[11px] font-black ${s.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
              {headerOf(s.id)}
            </span>
            <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="أعلى"
              className="rounded p-1 text-slate-500 disabled:opacity-25"><ArrowUp size={12} /></button>
            <button type="button" onClick={() => move(s.id, 1)} disabled={i === ordered.length - 1} aria-label="أسفل"
              className="rounded p-1 text-slate-500 disabled:opacity-25"><ArrowDown size={12} /></button>
            <button type="button" onClick={() => setVisible(s.id, !s.visible)}
              disabled={s.visible && visibleCount <= 1}
              aria-label={s.visible ? 'إخفاء' : 'إظهار'}
              className="rounded p-1 text-slate-600 disabled:opacity-25">
              {s.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </li>
        ))}
      </ul>

      {showPreview && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-[11px]">
            <thead className="bg-slate-100 font-black text-slate-700">
              <tr>
                {resolved.map((c) => <th key={c.id} className="whitespace-nowrap p-2">{c.header}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.length === 0 ? (
                <tr><td colSpan={resolved.length || 1} className="p-3 text-center font-bold text-slate-500">
                  لا صفوف — الملف سيخرج بترويسة فقط
                </td></tr>
              ) : preview.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  {resolved.map((c) => (
                    <td key={c.id} className="whitespace-nowrap p-2 font-bold text-slate-700">
                      {r[c.id] === null || r[c.id] === undefined || r[c.id] === ''
                        ? <span className="text-slate-300">—</span>
                        : String(r[c.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot className="bg-slate-100 font-black text-slate-800">
                <tr>
                  {resolved.map((c, i) => (
                    <td key={c.id} className="p-2">
                      {i === 0 ? <span className="flex items-center gap-1"><Check size={11} /> الإجمالي</span>
                        : totals[c.id] !== undefined ? String(totals[c.id]) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  )
}

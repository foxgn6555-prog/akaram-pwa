/**
 * استرداد حاويات GBS من Excel (00183) — غرفة العمليات
 * ① اختيار الملف → ② معاينة بمحاكاة من قاعدة البيانات (بلا كتابة) → ③ تنفيذ
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import { useGbsExport, useGbsImport } from '@features/gbs/hooks'
import { gbsImportMessage, parseGbsFile, type GbsImportResult, type ParsedGbsImport } from '@features/gbs/gbs-excel'
import { GBS_STATUS_META } from '@features/gbs/statusMeta'
import type { GbsContainerStatus } from '@features/gbs/types'

const ACTION_AR = { inserted: 'جديدة', updated: 'تحديث', skipped: 'تجاوز' } as const

export function GbsImportDialog({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedGbsImport | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [updateExisting, setUpdateExisting] = useState(true)
  const [preview, setPreview] = useState<GbsImportResult | null>(null)
  const [done, setDone] = useState<GbsImportResult | null>(null)
  const imp = useGbsImport(), exp = useGbsExport()
  const pick = async (f: File | undefined) => {
    if (!f) return
    setParseError(null); setPreview(null); setDone(null); setFileName(f.name)
    try { setParsed(await parseGbsFile(f)) } catch { setParsed(null); setParseError('تعذر قراءة الملف — تأكد أنه ملف Excel (.xlsx)') }
  }
  const result = done ?? preview
  return createPortal(
    <div className="fixed inset-0 z-[2300] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-4" role="dialog" aria-modal="true" data-testid="gbs-import-dialog">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" dir="rtl">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div><h2 className="text-lg font-black">استرداد الحاويات من Excel</h2><p className="text-xs text-slate-500">إلزامي: الموقع/الوصف، الإحداثيات، المنطقة · الرمز الموجود يُحدَّث · لا يُكتب شيء قبل تأكيدك</p></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="إغلاق"><X size={18} /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" data-testid="gbs-import-file" onChange={(e) => void pick(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white"><Upload size={16} />{fileName ? 'اختيار ملف آخر' : 'اختيار ملف Excel'}</button>
            <button type="button" onClick={() => exp.mutate(true)} disabled={exp.isPending} className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold"><FileSpreadsheet size={16} />تنزيل القالب</button>
            <label className="ms-auto flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={updateExisting} onChange={(e) => { setUpdateExisting(e.target.checked); setPreview(null); setDone(null) }} data-testid="gbs-import-update" />تحديث الحاويات الموجودة (استرداد)</label>
          </div>
          {fileName && <p className="text-xs text-slate-600">الملف: <b>{fileName}</b></p>}
          {parseError && <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{parseError}</p>}
          {parsed && (
            <div className="rounded-2xl border bg-slate-50 p-4 text-sm" data-testid="gbs-import-summary">
              {parsed.headerRow === 0 ? <p className="font-bold text-rose-700">لم أجد عمود «الموقع / الوصف» في الملف — استخدم رؤوساً مفهومة (الموقع، خط العرض، خط الطول، المنطقة…) أو القالب.</p> : (
                <>
                  <p><b>{parsed.rows.length}</b> حاوية في الملف · الأعمدة المتعرَّف عليها: {parsed.mapped.map((m) => m.header).join('، ')}{parsed.skippedEmpty ? ` · تُجوهل ${parsed.skippedEmpty} صف بلا وصف` : ''}</p>
                  {parsed.missingRequired.length > 0 && <p className="mt-1 font-bold text-rose-700">أعمدة إلزامية مفقودة: {parsed.missingRequired.join('، ')}</p>}
                  {parsed.unknownHeaders.length > 0 && <p className="mt-1 text-xs text-slate-500">أعمدة تُجوهل: {parsed.unknownHeaders.join('، ')}</p>}
                </>
              )}
            </div>
          )}
          {result && (
            <div className="space-y-3" data-testid="gbs-import-result">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[['الصفوف', result.total, 'text-slate-900'], ['جديدة', result.inserted, 'text-emerald-700'], ['تحديث', result.updated, 'text-sky-700'], ['تجاوز', result.skipped, 'text-slate-500'], ['أخطاء', result.failed, 'text-rose-700']].map(([t, v, c]) => (
                  <div key={String(t)} className="rounded-xl border bg-white p-3"><p className="text-[11px] text-slate-500">{t}</p><p className={clsx('text-xl font-black tabular-nums', c)}>{v}</p></div>
                ))}
              </div>
              <p className={clsx('rounded-xl p-3 text-sm font-bold', done ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
                {done ? <><CheckCircle2 size={16} className="inline" /> تم التنفيذ وظهرت الحاويات على الخريطة.</> : <><AlertTriangle size={16} className="inline" /> هذه معاينة فقط — لم يُكتب شيء بعد. الصفوف ذات الأخطاء ستُتجاوز وتُنفَّذ البقية.</>}
              </p>
              <div className="max-h-80 overflow-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100"><tr>{['#', 'الرمز', 'الموقع', 'المنطقة', 'الحالة', 'الإحداثيات', 'الإجراء', 'ملاحظات'].map((h) => <th key={h} className="px-2 py-2 text-start font-black">{h}</th>)}</tr></thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.row} className={clsx('border-t', !r.ok && 'bg-rose-50')} data-testid={`gbs-import-row-${r.row}`}>
                        <td className="px-2 py-1.5 tabular-nums">{r.row}</td><td className="px-2 py-1.5 font-bold">{r.code ?? 'جديد'}</td><td className="px-2 py-1.5">{r.label ?? '—'}</td><td className="px-2 py-1.5">{r.area ?? '—'}</td>
                        <td className="px-2 py-1.5">{r.status ? GBS_STATUS_META[r.status as GbsContainerStatus]?.label ?? r.status : '—'}</td>
                        <td className="px-2 py-1.5 tabular-nums" dir="ltr">{r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : '—'}</td>
                        <td className="px-2 py-1.5"><span className={clsx('rounded-full px-2 py-0.5 font-black', r.action === 'inserted' ? 'bg-emerald-100 text-emerald-800' : r.action === 'updated' ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700')}>{ACTION_AR[r.action]}</span></td>
                        <td className="px-2 py-1.5">{[...r.errors.map((e) => <span key={e} className="me-1 text-rose-700">✖ {gbsImportMessage(e)}</span>), ...r.warnings.map((w) => <span key={w} className="me-1 text-amber-700">⚠ {gbsImportMessage(w)}</span>)]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border px-4 text-sm font-bold">{done ? 'إغلاق' : 'إلغاء'}</button>
          {!done && <button type="button" data-testid="gbs-import-preview" disabled={!parsed || parsed.rows.length === 0 || imp.isPending} onClick={() => parsed && imp.mutate({ rows: parsed.rows, dryRun: true, updateExisting }, { onSuccess: setPreview })} className="h-11 rounded-xl bg-slate-800 px-4 text-sm font-black text-white disabled:opacity-40">{imp.isPending && !preview ? 'جارٍ الفحص…' : 'فحص ومعاينة'}</button>}
          {!done && <button type="button" data-testid="gbs-import-confirm" disabled={!preview || imp.isPending || preview.inserted + preview.updated === 0} onClick={() => parsed && imp.mutate({ rows: parsed.rows, dryRun: false, updateExisting }, { onSuccess: setDone })} className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-40">تنفيذ الاستيراد ({preview ? preview.inserted + preview.updated : 0})</button>}
        </footer>
      </div>
    </div>
  , document.body)
}

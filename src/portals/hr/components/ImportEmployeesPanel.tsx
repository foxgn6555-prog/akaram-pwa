/** استيراد الموظفين من Excel: قالب رسمي → رفع → تحليل محلي → تحقق مسبق في الخادم (بلا إدخال) → معاينة بالأخطاء → تنفيذ → تقرير نتائج */
import { useMemo, useState } from 'react'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import { useHrShifts, useImportEmployees } from '@features/hr'
import type { ImportEmployeeRow, ImportResult } from '@features/hr'
import { buildImportTemplate, downloadWorkbook, exportToExcel, importReportSpec, parseImportFile } from '@features/hr/lib/hrExcel'
import { HR_ERROR_MESSAGES } from '@sdk/hr.sdk'
import { Button } from '@components/ui'
import clsx from 'clsx'
import { StatCard } from './hr-ui'

const tr = (code: string) => HR_ERROR_MESSAGES[code] ?? Object.entries(HR_ERROR_MESSAGES).find(([k]) => code.includes(k))?.[1] ?? code

export function ImportEmployeesPanel() {
  const { data: departments = [] } = useDepartments()
  const { data: branches = [] } = useBranches()
  const { data: shifts = [] } = useHrShifts()
  const importMut = useImportEmployees()
  const [rows, setRows] = useState<ImportEmployeeRow[]>([])
  const [parseInfo, setParseInfo] = useState<{ unknownHeaders: string[]; missingRequired: string[]; fileName: string } | null>(null)
  const [check, setCheck] = useState<ImportResult | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const downloadTemplate = async () => {
    const wb = await buildImportTemplate({ departments: departments.map((d) => d.name), branches: branches.map((b) => b.name), shifts: shifts.map((s) => s.name) })
    await downloadWorkbook(wb, 'قالب-استيراد-الموظفين.xlsx')
  }
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErr(null); setCheck(null); setDone(null)
    try {
      const parsed = await parseImportFile(f)
      setRows(parsed.rows); setParseInfo({ unknownHeaders: parsed.unknownHeaders, missingRequired: parsed.missingRequired, fileName: f.name })
      if (parsed.missingRequired.length) { setErr(`الملف يفتقد الأعمدة الإلزامية: ${parsed.missingRequired.join('، ')} — استخدم القالب الرسمي`); return }
      if (parsed.rows.length === 0) { setErr('الملف لا يحتوي صفوفاً'); return }
      const res = await importMut.mutateAsync({ rows: parsed.rows, dryRun: true })
      // دمج أخطاء التطبيع المحلية (قيم عربية غير معروفة) مع نتيجة الخادم
      for (const le of parsed.localErrors) { const r = res.rows[le.row - 1]; if (r) { r.errors = Array.from(new Set([...r.errors, ...le.errors])); r.ok = false } }
      res.ok = res.rows.filter((r) => r.ok).length; res.failed = res.total - res.ok
      setCheck(res)
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'تعذّر قراءة الملف') } finally { setBusy(false) }
  }
  const validRows = useMemo(() => (check ? rows.filter((_, i) => check.rows[i]?.ok) : []), [rows, check])
  const run = async () => {
    if (!check || validRows.length === 0) return
    if (!window.confirm(`سيُستورد ${validRows.length} موظفاً${check.failed ? ` وتُتجاهل ${check.failed} صفوف خاطئة` : ''}. لكل موظف يُنشأ ملف راتب بانتظار المالية. متابعة؟`)) return
    setBusy(true)
    try { const res = await importMut.mutateAsync({ rows: validRows, dryRun: false }); setDone(res) } finally { setBusy(false) }
  }
  const reset = () => { setRows([]); setCheck(null); setDone(null); setParseInfo(null); setErr(null) }
  const preview = done ?? check

  return (
    <section className="space-y-4" data-testid="import-panel">
      <div className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="نزّل القالب" desc="ملف Excel بالأعمدة الرسمية وورقة قيم مرجعية (الأقسام/الفروع/الشفتات الحالية).">
          <Button size="sm" variant="secondary" onClick={() => void downloadTemplate()} data-testid="imp-template">تنزيل القالب</Button>
        </Step>
        <Step n={2} title="ارفع الملف المعبّأ" desc="يُحلَّل ويُتحقق منه في الخادم دون إدخال أي شيء حتى تؤكد.">
          <label className={clsx('inline-block cursor-pointer rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white', busy && 'opacity-50')}>
            {busy ? 'جارٍ التحليل…' : 'اختيار ملف Excel'}<input type="file" accept=".xlsx" className="hidden" onChange={(e) => void onFile(e)} disabled={busy} data-testid="imp-file" />
          </label>
        </Step>
        <Step n={3} title="راجع ونفّذ" desc="الصفوف الصحيحة تُستورد، والخاطئة تُعرض بأسبابها لتصحيحها وإعادة رفعها.">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void run()} disabled={!check || !!done || validRows.length === 0} isLoading={busy && !!check && !done} data-testid="imp-run">استيراد {validRows.length ? `(${validRows.length})` : ''}</Button>
            {(check || done) && <Button size="sm" variant="ghost" onClick={reset} data-testid="imp-reset">ملف جديد</Button>}
          </div>
        </Step>
      </div>

      {err && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700" role="alert" data-testid="imp-error">{err}</p>}
      {parseInfo && parseInfo.unknownHeaders.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800" data-testid="imp-unknown">أعمدة غير معروفة تم تجاهلها: {parseInfo.unknownHeaders.join('، ')}</p>}

      {preview && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatCard title={done ? 'إجمالي الصفوف المرسلة' : 'صفوف الملف'} value={preview.total} testId="imp-total" />
            <StatCard title={done ? 'تم استيرادهم' : 'صالحة للاستيراد'} value={preview.ok} tone="emerald" testId="imp-ok" />
            <StatCard title={done ? 'رُفضت' : 'بها أخطاء'} value={preview.failed} tone={preview.failed ? 'red' : 'slate'} testId="imp-failed" />
          </div>
          {done && <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800" data-testid="imp-done">
            <span>اكتمل الاستيراد من «{parseInfo?.fileName}». لكل موظف مستورد أُنشئ ملف راتب بانتظار المالية.</span>
            <Button size="sm" variant="secondary" onClick={() => void exportToExcel(importReportSpec(done.rows, tr))} data-testid="imp-report">تنزيل تقرير النتائج</Button>
          </div>}
          <div className="max-h-[28rem] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs" data-testid="imp-table">
              <thead className="sticky top-0 bg-slate-50 text-slate-600"><tr><th className="p-2">#</th><th className="p-2 text-start">الرقم الوظيفي</th><th className="p-2 text-start">الاسم</th><th className="p-2 text-start">القسم / الفرع / الشفت</th><th className="p-2">التعاقد</th><th className="p-2">النتيجة</th></tr></thead>
              <tbody>
                {preview.rows.map((r, i) => { const src = done ? validRows[i] : rows[i]; return (
                  <tr key={r.row} className={clsx('border-t border-slate-100', !r.ok && 'bg-red-50/50')} data-testid={`imp-row-${r.row}`} data-ok={String(r.ok)}>
                    <td className="p-2 text-center text-slate-400">{r.row}</td>
                    <td className="p-2 font-semibold">{r.employee_number || <span className="text-red-600">—</span>}</td>
                    <td className="p-2">{r.full_name || <span className="text-red-600">—</span>}</td>
                    <td className="p-2 text-slate-600">{[src?.department, src?.branch, src?.shift].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="p-2 text-center">{src?.contract_type === 'daily' ? 'يومي' : src?.contract_type === 'monthly' ? 'شهري' : '—'}</td>
                    <td className="p-2">{r.ok ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{done ? 'تم' : 'صالح'}</span> : <ul className="list-disc ps-4 text-red-700">{r.errors.map((e) => <li key={e}>{tr(e)}</li>)}</ul>}</td>
                  </tr>) })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function Step({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black text-brand-700">الخطوة {n}</p>
      <h4 className="text-sm font-bold">{title}</h4>
      <p className="mb-3 text-[11px] text-slate-500">{desc}</p>
      {children}
    </div>
  )
}

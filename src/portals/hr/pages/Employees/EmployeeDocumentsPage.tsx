/**
 * بوابة الموارد البشرية — «وثائق الموظفين» (00389-أ)
 * لوحة الوثائق المنتهية/القريبة من الانتهاء: فلاتر (النافذة 30/60/90/365، القسم، بحث)، عدّادات، تصدير Excel،
 * تشغيل فحص التنبيهات يدويًا. مدة التنبيه الافتراضية تُضبط من بوابة IT (سياسة HR). لا حذف لأي وثيقة من هنا.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { useDepartments } from '@features/departments'
import { DOC_TYPE_LABELS, useDocumentsExpiryRunNow, useDocumentsExpirySummary, useExpiringDocuments } from '@features/hr'
import type { ExpiringDocument } from '@features/hr'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import type { ExportSpec } from '@features/hr/lib/hrExcel'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { StatCard } from '../../components/hr-ui'
import { field } from '../../components/hr-format'
import { ExportButton } from '../../components/ExportButton'

const WINDOWS: Array<[number | null, string]> = [[null, 'نافذة التنبيه'], [60, '60 يومًا'], [90, '90 يومًا'], [365, 'سنة'], [3650, 'الكل']]
const STATUS_LABEL: Record<ExpiringDocument['status'], string> = { expired: 'منتهية', soon: 'تنتهي قريبًا', ok: 'سارية' }
const STATUS_STYLE: Record<ExpiringDocument['status'], string> = { expired: 'bg-red-100 text-red-800', soon: 'bg-amber-100 text-amber-800', ok: 'bg-emerald-100 text-emerald-800' }
export const daysLeftLabel = (d: number) => (d < 0 ? `منذ ${-d} يوم` : d === 0 ? 'اليوم' : `بعد ${d} يوم`)

export function expiringDocsSpec(rows: ExpiringDocument[], filters: Array<[string, string]>): ExportSpec<ExpiringDocument> {
  return {
    title: 'وثائق الموظفين — الانتهاء', sheetName: 'الوثائق', fileName: `وثائق-الموظفين-${new Date().toISOString().slice(0, 10)}.xlsx`, rows, filters,
    footerNote: 'الوثائق لا تُحذف تلقائيًا؛ القائمة للمتابعة والتجديد فقط.',
    columns: [
      { key: 'employee_number', header: 'الرقم الوظيفي', width: 12, value: (r) => r.employee_number ?? '', align: 'center' },
      { key: 'full_name', header: 'الاسم', width: 26, value: (r) => r.full_name },
      { key: 'department_name', header: 'القسم', width: 18, value: (r) => r.department_name ?? '' },
      { key: 'doc_type', header: 'الوثيقة', width: 16, value: (r) => r.title || DOC_TYPE_LABELS[r.doc_type] },
      { key: 'issued_on', header: 'الإصدار', width: 12, value: (r) => r.issued_on ?? '', align: 'center' },
      { key: 'expires_on', header: 'الانتهاء', width: 12, value: (r) => r.expires_on, align: 'center' },
      { key: 'days_left', header: 'المتبقي (يوم)', width: 12, value: (r) => r.days_left, align: 'center' },
      { key: 'status', header: 'الحالة', width: 12, value: (r) => STATUS_LABEL[r.status], align: 'center' },
    ],
  }
}

export default function EmployeeDocumentsPage() {
  const [within, setWithin] = useState<number | null>(null)
  const [departmentId, setDepartmentId] = useState('')
  const [search, setSearch] = useState('')
  const [onlyExpired, setOnlyExpired] = useState(false)
  const { data: departments = [] } = useDepartments()
  const { data: summary } = useDocumentsExpirySummary()
  const { data: rows = [], isLoading } = useExpiringDocuments(within, departmentId, search.trim())
  const runNow = useDocumentsExpiryRunNow()
  const visible = useMemo(() => (onlyExpired ? rows.filter((r) => r.status === 'expired') : rows), [rows, onlyExpired])
  const filters: Array<[string, string]> = [
    ['النافذة', within == null ? `${summary?.alert_days ?? 30} يومًا (الافتراضي)` : `${within} يومًا`],
    ['القسم', departments.find((d) => d.id === departmentId)?.name ?? 'الكل'],
    ['بحث', search.trim() || '—'],
  ]
  return (
    <div className="space-y-4" data-testid="hr-documents">
      <ExecPageHeader icon="file-text" title="وثائق الموظفين" subtitle={`متابعة انتهاء صلاحية إجازات السوق والجوازات والعقود والشهادات · تنبيه تلقائي للموارد البشرية قبل الانتهاء بـ ${summary?.alert_days ?? 30} يومًا (يُضبط من بوابة التطوير) · لا تُحذف أي وثيقة`}
        actions={<Button size="sm" variant="secondary" isLoading={runNow.isPending} onClick={() => runNow.mutate()} data-testid="docs-run-now">فحص التنبيهات الآن</Button>} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard title="منتهية" value={summary?.expired ?? 0} tone={summary?.expired ? 'red' : 'emerald'} testId="docs-stat-expired" />
        <StatCard title={`تنتهي خلال ${summary?.alert_days ?? 30} يومًا`} value={summary?.soon ?? 0} tone={summary?.soon ? 'amber' : 'emerald'} testId="docs-stat-soon" />
        <StatCard title="خلال 60 يومًا" value={summary?.d60 ?? 0} tone="sky" testId="docs-stat-60" />
        <StatCard title="خلال 90 يومًا" value={summary?.d90 ?? 0} tone="violet" testId="docs-stat-90" />
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="docs-filters">
        <label className="grid gap-1 text-[11px] font-bold text-slate-600">النافذة
          <select className={field} value={within ?? ''} onChange={(e) => setWithin(e.target.value === '' ? null : Number(e.target.value))} data-testid="docs-window">
            {WINDOWS.map(([v, l]) => <option key={String(v)} value={v ?? ''}>{l}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-slate-600">القسم
          <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="docs-department">
            <option value="">كل الأقسام</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="grid flex-1 gap-1 text-[11px] font-bold text-slate-600">بحث (اسم / رقم وظيفي)
          <input className={field} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="docs-search" />
        </label>
        <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={onlyExpired} onChange={(e) => setOnlyExpired(e.target.checked)} data-testid="docs-only-expired" />المنتهية فقط</label>
        <ExportButton disabled={!visible.length} onExport={() => exportToExcel(expiringDocsSpec(visible, filters))} testId="docs-export" />
      </div>
      {isLoading ? <LoadingSpinner /> : visible.length === 0 ? <EmptyState title="لا وثائق ضمن هذه النافذة" hint="سجّل تاريخ الانتهاء لكل وثيقة من صفحة الموظف ← المستمسكات." /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-right text-xs" data-testid="docs-table">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600">
              <tr><th className="p-2">الموظف</th><th className="p-2">القسم</th><th className="p-2">الوثيقة</th><th className="p-2">الإصدار</th><th className="p-2">الانتهاء</th><th className="p-2">المتبقي</th><th className="p-2">الحالة</th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t" data-testid={`docs-row-${r.id}`}>
                  <td className="p-2"><Link to={`/hr/employees/${r.employee_id}`} className="font-bold text-brand-700 hover:underline">{r.full_name}</Link><span className="block text-[10px] text-slate-500" dir="ltr">{r.employee_number ?? ''}</span></td>
                  <td className="p-2">{r.department_name ?? '—'}</td>
                  <td className="p-2">{r.title || DOC_TYPE_LABELS[r.doc_type]}</td>
                  <td className="p-2 tabular-nums" dir="ltr">{r.issued_on ?? '—'}</td>
                  <td className="p-2 tabular-nums" dir="ltr">{r.expires_on}</td>
                  <td className="p-2 tabular-nums">{daysLeftLabel(r.days_left)}</td>
                  <td className="p-2"><span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-bold', STATUS_STYLE[r.status])}>{STATUS_LABEL[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-3 py-2 text-[11px] text-slate-500" data-testid="docs-count">{visible.length} وثيقة</p>
        </div>
      )}
    </div>
  )
}

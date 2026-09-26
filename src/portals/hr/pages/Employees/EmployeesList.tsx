/**
 * بوابة الموارد البشرية — وحدة «بيانات الموظفين»
 * قائمة كل موظفي الشركة بفلاتر (بحث/قسم بشجرته/فرع/حالة/شفت) → الضغط على الموظف يفتح ملفه الكامل.
 * حالة الراتب تظهر كشارة فقط (بلا أرقام — الأرقام في بوابة المالية حصراً).
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useBranches } from '@features/branches'
import { useDepartments } from '@features/departments'
import { CONTRACT_LABELS, useHrEmployees, useHrShifts } from '@features/hr'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { field } from '../../components/hr-format'
import { ColumnPicker, ExportButton } from '../../components/ExportButton'
import { EMPLOYEE_COLUMNS, EMPLOYEE_DEFAULT_COLUMNS, employeesSpec, exportToExcel } from '@features/hr/lib/hrExcel'

const STATUS_AR: Record<string, string> = { active: 'نشط', on_leave: 'في إجازة', suspended: 'موقوف', terminated: 'منتهية خدمته' }

export default function EmployeesList() {
  const [search, setSearch] = useState('')
  const [params] = useSearchParams()
  const [departmentId, setDepartmentId] = useState(params.get('dept') ?? '')
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [columns, setColumns] = useState<string[]>(EMPLOYEE_DEFAULT_COLUMNS)
  const { data: departments = [] } = useDepartments()
  const { data: branches = [] } = useBranches()
  const { data: shifts = [] } = useHrShifts(true)
  const { data: rows = [], isLoading } = useHrEmployees({ search, departmentId: departmentId || null, branchId: branchId || null, status: status || null, shiftId: shiftId || null })

  return (
    <div className="space-y-4" data-testid="hr-employees">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">بيانات الموظفين</h1>
          <p className="text-xs text-slate-500">{rows.length} موظفاً ضمن الفلاتر الحالية</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ColumnPicker all={EMPLOYEE_COLUMNS} selected={columns} onChange={setColumns} />
          <ExportButton disabled={rows.length === 0 || columns.length === 0} onExport={() => exportToExcel(employeesSpec(rows, columns, [
            ['بحث', search], ['القسم', departments.find((d) => d.id === departmentId)?.name ?? ''], ['الفرع', branches.find((b) => b.id === branchId)?.name ?? ''],
            ['الحالة', status ? STATUS_AR[status] ?? status : ''], ['الشفت', shifts.find((x) => x.id === shiftId)?.name ?? ''],
          ]))} testId="emp-export" />
          <Link to="/hr/recruitment" className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">+ توظيف موظف</Link>
        </div>
      </header>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-5" data-testid="emp-filters">
        <input className={field} placeholder="بحث: اسم / رقم وظيفي / هاتف" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="emp-search" />
        <select className={field} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="emp-dept">
          <option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.parent_id ? '↳ ' : ''}{d.name}</option>)}
        </select>
        <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="emp-branch">
          <option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="emp-status">
          <option value="">كل الحالات</option>{Object.entries(STATUS_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className={field} value={shiftId} onChange={(e) => setShiftId(e.target.value)} data-testid="emp-shift">
          <option value="">كل الشفتات</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا موظفون مطابقون" hint="عدّل الفلاتر أو سجّل موظفاً جديداً" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="emp-table">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القسم</th><th className="p-2 text-start">الفرع</th><th className="p-2">الشفت</th><th className="p-2">التعاقد</th><th className="p-2">البصمة</th><th className="p-2">الحالة</th><th className="p-2">الراتب</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className={clsx('border-t border-slate-100 hover:bg-slate-50', e.employment_status === 'terminated' && 'opacity-60')} data-testid={`emp-row-${e.employee_number}`}>
                  <td className="p-2">
                    <Link to={`/hr/employees/${e.id}`} className="font-semibold text-brand-700 hover:underline" data-testid={`emp-link-${e.employee_number}`}>{e.full_name}</Link>
                    <p className="text-[11px] text-slate-500">{e.employee_number} · {e.job_title ?? '—'}</p>
                  </td>
                  <td className="p-2 text-xs">{e.department_name ?? '—'}</td>
                  <td className="p-2 text-xs">{e.branch_name ?? '—'}</td>
                  <td className="p-2 text-center text-xs">{e.shift_name ?? <span className="text-amber-600">بلا شفت</span>}</td>
                  <td className="p-2 text-center text-xs">{CONTRACT_LABELS[e.contract_type]}</td>
                  <td className="p-2 text-center text-xs" dir="ltr">{e.biometric_pin ?? <span className="text-amber-600">—</span>}</td>
                  <td className="p-2 text-center text-xs">{STATUS_AR[e.employment_status]}</td>
                  <td className="p-2 text-center">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', e.salary_status === 'defined' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')} data-testid="salary-status">
                      {e.salary_status === 'defined' ? 'مُعرَّف لدى المالية' : 'بانتظار المالية'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

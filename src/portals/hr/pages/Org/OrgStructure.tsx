/**
 * بوابة الموارد البشرية — وحدة «الهيكل التنظيمي»
 * شجرة الأقسام (أب → فروع) مع عدد الموظفين النشطين والمدير · إضافة قسم/قسم فرعي · تعديل الاسم/الرمز/الأب/المدير · تعطيل آمن · تصدير Excel.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useHrDepartments, useHrEmployees, useSaveDepartment } from '@features/hr'
import type { HrDepartment } from '@features/hr'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { Field, StatCard } from '../../components/hr-ui'
import { field } from '../../components/hr-format'
import { ExportButton } from '../../components/ExportButton'

type Draft = { id: string | null; name: string; code: string; parentId: string; managerId: string; isActive: boolean }
const empty = (parentId = ''): Draft => ({ id: null, name: '', code: '', parentId, managerId: '', isActive: true })

export default function OrgStructure() {
  const { data: depts = [], isLoading } = useHrDepartments()
  const { data: employees = [] } = useHrEmployees({ status: 'active' })
  const save = useSaveDepartment()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const tree = useMemo(() => {
    const byParent = new Map<string | null, HrDepartment[]>()
    for (const d of depts) { if (!showInactive && !d.is_active) continue; const k = d.parent_id && depts.some((x) => x.id === d.parent_id) ? d.parent_id : null; byParent.set(k, [...(byParent.get(k) ?? []), d]) }
    const out: Array<{ d: HrDepartment; depth: number; path: string }> = []
    const walk = (parent: string | null, depth: number, path: string) => { for (const d of byParent.get(parent) ?? []) { const p = path ? `${path} › ${d.name}` : d.name; out.push({ d, depth, path: p }); walk(d.id, depth + 1, p) } }
    walk(null, 0, '')
    return out
  }, [depts, showInactive])
  const visible = search ? tree.filter((t) => t.d.name.includes(search) || t.d.code.toLowerCase().includes(search.toLowerCase())) : tree
  const totalActive = depts.filter((d) => d.is_active).length
  const headcount = depts.reduce((s, d) => s + d.employees_active, 0)
  const subtreeCount = (id: string): number => depts.filter((d) => d.parent_id === id).reduce((s, c) => s + c.employees_active + subtreeCount(c.id), 0)

  const submit = async () => {
    if (!draft) return
    if (draft.name.trim().length < 2) { setErr('اسم القسم مطلوب'); return }
    if (!draft.code.trim()) { setErr('رمز القسم مطلوب (حروف/أرقام لاتينية مثل OPS-1)'); return }
    setErr(null)
    try { await save.mutateAsync({ id: draft.id, name: draft.name.trim(), code: draft.code.trim(), parentId: draft.parentId || null, managerId: draft.managerId || null, isActive: draft.isActive }); setDraft(null) } catch { /* toast in hook */ }
  }
  const deactivate = async (d: HrDepartment) => {
    if (!window.confirm(`تعطيل قسم «${d.name}»؟ لن يظهر في القوائم ولا يمكن إسناد موظفين إليه.`)) return
    try { await save.mutateAsync({ id: d.id, name: d.name, code: d.code, parentId: d.parent_id, managerId: d.manager_id, isActive: false }) } catch { /* toast */ }
  }
  const reactivate = async (d: HrDepartment) => { try { await save.mutateAsync({ id: d.id, name: d.name, code: d.code, parentId: d.parent_id, managerId: d.manager_id, isActive: true }) } catch { /* toast */ } }
  const edit = (d: HrDepartment) => setDraft({ id: d.id, name: d.name, code: d.code, parentId: d.parent_id ?? '', managerId: d.manager_id ?? '', isActive: d.is_active })
  const parentOptions = depts.filter((d) => d.is_active && d.id !== draft?.id)

  return (
    <div className="space-y-4" data-testid="hr-org">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-black">الهيكل التنظيمي</h1><p className="text-xs text-slate-500">الأقسام والأقسام الفرعية — تُستخدم في التوظيف والحضور والاستيراد وفلاتر غرفة العمليات</p></div>
        <div className="flex flex-wrap gap-2">
          <ExportButton testId="org-export" disabled={tree.length === 0} onExport={() => exportToExcel({
            title: 'الهيكل التنظيمي', sheetName: 'الأقسام', fileName: 'الهيكل-التنظيمي.xlsx', rows: tree,
            columns: [
              { key: 'path', header: 'المسار', width: 40, value: (t) => t.path }, { key: 'code', header: 'الرمز', width: 12, value: (t) => t.d.code, align: 'center' },
              { key: 'manager', header: 'المدير', width: 22, value: (t) => t.d.manager_name }, { key: 'active', header: 'موظفون نشطون', width: 12, value: (t) => t.d.employees_active, align: 'center' },
              { key: 'subtree', header: 'مع الفروع', width: 12, value: (t) => t.d.employees_active + subtreeCount(t.d.id), align: 'center' }, { key: 'status', header: 'الحالة', width: 10, value: (t) => (t.d.is_active ? 'نشط' : 'معطّل'), align: 'center' },
            ],
          })} />
          <Button size="sm" onClick={() => setDraft(empty())} data-testid="org-add">+ قسم جديد</Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <StatCard title="أقسام نشطة" value={totalActive} tone="emerald" testId="org-stat-active" />
        <StatCard title="أقسام رئيسية" value={depts.filter((d) => d.is_active && !d.parent_id).length} testId="org-stat-roots" />
        <StatCard title="موظفون على الملاك" value={headcount} tone="sky" testId="org-stat-headcount" />
      </div>

      {draft && (
        <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4" data-testid="org-form">
          <h3 className="mb-3 text-sm font-bold">{draft.id ? 'تعديل القسم' : draft.parentId ? 'قسم فرعي جديد' : 'قسم جديد'}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="org-name" label="اسم القسم *"><input id="org-name" className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="org-name" /></Field>
            <Field id="org-code" label="الرمز *" hint="فريد — مثل OPS أو OPS-1"><input id="org-code" className={clsx(field, 'uppercase')} dir="ltr" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} data-testid="org-code" /></Field>
            <Field id="org-parent" label="القسم الأب"><select id="org-parent" className={field} value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value })} data-testid="org-parent"><option value="">— قسم رئيسي —</option>{parentOptions.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}</select></Field>
            <Field id="org-manager" label="مدير القسم"><select id="org-manager" className={field} value={draft.managerId} onChange={(e) => setDraft({ ...draft, managerId: e.target.value })} data-testid="org-manager"><option value="">—</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.employee_number}</option>)}</select></Field>
          </div>
          {err && <p className="mt-2 text-xs font-bold text-red-600" role="alert" data-testid="org-error">{err}</p>}
          <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void submit()} isLoading={save.isPending} data-testid="org-save">حفظ</Button><Button size="sm" variant="ghost" onClick={() => { setDraft(null); setErr(null) }}>إلغاء</Button></div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input className={clsx(field, 'max-w-xs')} placeholder="بحث بالاسم أو الرمز" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="org-search" />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} data-testid="org-show-inactive" /> إظهار المعطّلة</label>
      </div>

      {isLoading ? <LoadingSpinner /> : visible.length === 0 ? <EmptyState title="لا أقسام بعد" hint="أضف أول قسم رئيسي ثم أقسامه الفرعية" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm" data-testid="org-table">
            <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-2 text-start">القسم</th><th className="p-2">الرمز</th><th className="p-2 text-start">المدير</th><th className="p-2">موظفون نشطون</th><th className="p-2">مع الفروع</th><th className="p-2">الحالة</th><th className="p-2">إجراءات</th></tr></thead>
            <tbody>
              {visible.map(({ d, depth }) => (
                <tr key={d.id} className={clsx('border-t border-slate-100', !d.is_active && 'opacity-50')} data-testid={`org-row-${d.code}`} data-depth={depth}>
                  <td className="p-2"><span style={{ paddingInlineStart: `${depth * 1.25}rem` }} className="inline-flex items-center gap-1 font-semibold">{depth > 0 && <span className="text-slate-300">↳</span>}{d.name}</span></td>
                  <td className="p-2 text-center font-mono text-xs" dir="ltr">{d.code}</td>
                  <td className="p-2 text-xs">{d.manager_name ?? '—'}</td>
                  <td className="p-2 text-center"><Link to={`/hr/employees?dept=${d.id}`} className="font-bold text-brand-700 hover:underline">{d.employees_active}</Link></td>
                  <td className="p-2 text-center text-xs text-slate-500">{d.employees_active + subtreeCount(d.id)}</td>
                  <td className="p-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', d.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{d.is_active ? 'نشط' : 'معطّل'}</span></td>
                  <td className="p-2">
                    <div className="flex justify-center gap-1 text-[11px] font-bold">
                      <button type="button" className="rounded-lg bg-brand-50 px-2 py-1 text-brand-700" onClick={() => edit(d)} data-testid={`org-edit-${d.code}`}>تعديل</button>
                      {d.is_active && <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700" onClick={() => setDraft(empty(d.id))} data-testid={`org-addchild-${d.code}`}>+ فرعي</button>}
                      {d.is_active
                        ? <button type="button" className="rounded-lg bg-red-50 px-2 py-1 text-red-700" onClick={() => void deactivate(d)} data-testid={`org-deactivate-${d.code}`}>تعطيل</button>
                        : <button type="button" className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700" onClick={() => void reactivate(d)} data-testid={`org-reactivate-${d.code}`}>تفعيل</button>}
                    </div>
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

/**
 * بوابة الموارد البشرية — وحدة «الهيكل التنظيمي»
 * 00254: إعادة تصميم هرمية — عرض «الشجرة» (طي/فتح، سحب وإفلات للنقل، موظفو كل عقدة) + عرض «المخطط» (Org Chart بصناديق وخطوط، تكبير، طباعة)
 *        + نموذج القسم/المسمى في لوحة جانبية + تأكيد النقل قبل الحفظ. القواعد (دورة/مسمى لا يكون أباً) تُفحص محلياً وفي قاعدة البيانات.
 * 00153: العقدة الفرعية قد تكون «مسمى وظيفياً» (لا قسماً) — المسميات تُعرَّف هنا فقط ولا تُكتب نصاً في ملف الموظف؛
 *        وخانة «يقود آليات الشركة» على المسمى هي ما يُظهر موظفيه في قائمة سائقي غرفة العمليات.
 */
import { useEffect, useMemo, useState } from 'react'
import { useHrDepartments, useHrEmployees, useSaveDepartment } from '@features/hr'
import type { HrDepartment } from '@features/hr'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import { buildOrgTree, canMove, descendantIds, searchOrg } from '@features/hr/lib/orgTree'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { Field, StatCard } from '../../components/hr-ui'
import { field } from '../../components/hr-format'
import { ExportButton } from '../../components/ExportButton'
import { MAINTENANCE_SPECIALTIES, specialtyLabel } from '@sdk/vehicle-operations.sdk'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import OrgTreeView from './OrgTreeView'
import OrgChartView from './OrgChartView'

type Draft = { id: string | null; name: string; code: string; parentId: string; managerId: string; isActive: boolean; isJobTitle: boolean; drivesVehicles: boolean; maintenanceSpecialty: string }
const empty = (parentId = '', isJobTitle = false): Draft => ({ id: null, name: '', code: '', parentId, managerId: '', isActive: true, isJobTitle, drivesVehicles: false, maintenanceSpecialty: '' })
type View = 'tree' | 'chart'
const VIEW_KEY = 'hr-org-view'

export default function OrgStructure() {
  const { data: depts = [], isLoading } = useHrDepartments()
  const { data: employees = [] } = useHrEmployees({ status: 'active' })
  const save = useSaveDepartment()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<View>(() => (typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'chart' ? 'chart' : 'tree'))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedInit, setExpandedInit] = useState(false)
  const [pendingMove, setPendingMove] = useState<{ moving: HrDepartment; targetId: string | null } | null>(null)
  const [moveErr, setMoveErr] = useState<string | null>(null)

  const tree = useMemo(() => buildOrgTree(depts, { includeInactive: showInactive }), [depts, showInactive])
  const filter = useMemo(() => searchOrg(depts, search), [depts, search])
  // افتراضياً: الجذور ومستواها الأول مفتوحة (هرمية واضحة من أول نظرة)
  useEffect(() => {
    if (expandedInit || depts.length === 0) return
    setExpanded(new Set(tree.flat.filter((n) => n.depth <= 1 && n.children.length > 0).map((n) => n.d.id)))
    setExpandedInit(true)
  }, [tree, depts.length, expandedInit])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])
  // Escape يغلق التأكيد/اللوحة الجانبية
  useEffect(() => {
    if (!draft && !pendingMove) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (pendingMove) setPendingMove(null); else { setDraft(null); setErr(null) } } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [draft, pendingMove])

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const expandAll = () => setExpanded(new Set(tree.flat.filter((n) => n.children.length > 0).map((n) => n.d.id)))
  const collapseAll = () => setExpanded(new Set())

  const titles = depts.filter((d) => d.is_job_title && d.is_active)
  const totalActive = depts.filter((d) => d.is_active).length
  const headcount = depts.reduce((s, d) => s + d.employees_active, 0)
  const driverTitles = titles.filter((d) => d.drives_vehicles)
  const maxDepth = tree.flat.reduce((m, n) => Math.max(m, n.depth), 0)

  const submit = async () => {
    if (!draft) return
    if (draft.name.trim().length < 2) { setErr('اسم القسم مطلوب'); return }
    if (!draft.code.trim()) { setErr('رمز القسم مطلوب (حروف/أرقام لاتينية مثل OPS-1)'); return }
    if (draft.isJobTitle && !draft.parentId) { setErr('المسمى الوظيفي يجب أن يتفرع من قسم أب'); return }
    if (draft.id && draft.parentId && (draft.parentId !== (depts.find((d) => d.id === draft.id)?.parent_id ?? ''))) {
      const chk = canMove(tree, depts, draft.id, draft.parentId)
      if (!chk.ok) { setErr(chk.reason); return }
    }
    setErr(null)
    try {
      await save.mutateAsync({ id: draft.id, name: draft.name.trim(), code: draft.code.trim(), parentId: draft.parentId || null, managerId: draft.managerId || null, isActive: draft.isActive, isJobTitle: draft.isJobTitle, drivesVehicles: draft.isJobTitle && draft.drivesVehicles, maintenanceSpecialty: draft.isJobTitle ? draft.maintenanceSpecialty || null : null })
      if (draft.parentId) setExpanded((s) => new Set(s).add(draft.parentId))
      setDraft(null)
    } catch { /* toast in hook */ }
  }
  const persist = (d: HrDepartment, patch: Partial<{ isActive: boolean; parentId: string | null }>) =>
    save.mutateAsync({ id: d.id, name: d.name, code: d.code, parentId: patch.parentId !== undefined ? patch.parentId : d.parent_id, managerId: d.manager_id, isActive: patch.isActive ?? d.is_active, isJobTitle: d.is_job_title, drivesVehicles: d.drives_vehicles, maintenanceSpecialty: d.maintenance_specialty ?? null })
  const deactivate = async (d: HrDepartment) => {
    if (!window.confirm(`تعطيل ${d.is_job_title ? 'المسمى' : 'قسم'} «${d.name}»؟ لن يظهر في القوائم ولا يمكن إسناد موظفين إليه.`)) return
    try { await persist(d, { isActive: false }) } catch { /* toast */ }
  }
  const reactivate = async (d: HrDepartment) => { try { await persist(d, { isActive: true }) } catch { /* toast */ } }
  const edit = (d: HrDepartment) => { setErr(null); setDraft({ id: d.id, name: d.name, code: d.code, parentId: d.parent_id ?? '', managerId: d.manager_id ?? '', isActive: d.is_active, isJobTitle: Boolean(d.is_job_title), drivesVehicles: Boolean(d.drives_vehicles), maintenanceSpecialty: d.maintenance_specialty ?? '' }) }
  const requestMove = (moving: HrDepartment, targetId: string | null) => {
    const chk = canMove(tree, depts, moving.id, targetId)
    if (!chk.ok) { setMoveErr(chk.reason); setPendingMove(null); return }
    setMoveErr(null); setPendingMove({ moving, targetId })
  }
  const confirmMove = async () => {
    if (!pendingMove) return
    try {
      await persist(pendingMove.moving, { parentId: pendingMove.targetId })
      if (pendingMove.targetId) setExpanded((s) => new Set(s).add(pendingMove.targetId!))
      setPendingMove(null)
    } catch { /* toast */ }
  }
  // المسمى الوظيفي لا يكون أباً لأي عقدة؛ ولا تُعرض فروع العقدة نفسها كأب (دورة)
  const parentOptions = useMemo(() => {
    const blocked = draft?.id ? new Set([draft.id, ...descendantIds(tree, draft.id)]) : new Set<string>()
    return tree.flat.filter((n) => n.d.is_active && !n.d.is_job_title && !blocked.has(n.d.id))
  }, [draft?.id, tree])
  const targetName = pendingMove ? (pendingMove.targetId ? (tree.byId.get(pendingMove.targetId)?.path ?? depts.find((d) => d.id === pendingMove.targetId)?.name ?? '') : 'قسم رئيسي (بلا أب)') : ''
  const movingSubtree = pendingMove ? tree.byId.get(pendingMove.moving.id) : undefined

  return (
    <div className="space-y-4" data-testid="hr-org">
      <ExecPageHeader icon="layout-grid" title="الهيكل التنظيمي" subtitle="هرمية الأقسام والمسميات الوظيفية — تُستخدم في التوظيف والحضور والاستيراد وفلاتر غرفة العمليات ونطاقات الكراج/المحطة/الصيانة" actions={
        <div className="flex flex-wrap gap-2">
          <ExportButton testId="org-export" disabled={tree.flat.length === 0} onExport={() => exportToExcel({
            title: 'الهيكل التنظيمي', sheetName: 'الأقسام', fileName: 'الهيكل-التنظيمي.xlsx', rows: tree.flat,
            columns: [
              { key: 'path', header: 'المسار', width: 40, value: (t) => t.path }, { key: 'level', header: 'المستوى', width: 8, value: (t) => t.depth + 1, align: 'center' }, { key: 'code', header: 'الرمز', width: 12, value: (t) => t.d.code, align: 'center' },
              { key: 'kind', header: 'النوع', width: 14, value: (t) => (t.d.is_job_title ? (t.d.drives_vehicles ? 'مسمى — يقود آليات' : t.d.maintenance_specialty ? `مسمى — فني ${specialtyLabel(t.d.maintenance_specialty)}` : 'مسمى وظيفي') : 'قسم'), align: 'center' },
              { key: 'manager', header: 'المدير', width: 22, value: (t) => t.d.manager_name }, { key: 'active', header: 'موظفون نشطون', width: 12, value: (t) => t.d.employees_active, align: 'center' },
              { key: 'subtree', header: 'مع الفروع', width: 12, value: (t) => t.subtree, align: 'center' }, { key: 'status', header: 'الحالة', width: 10, value: (t) => (t.d.is_active ? 'نشط' : 'معطّل'), align: 'center' },
            ],
          })} />
          <Button size="sm" onClick={() => { setErr(null); setDraft(empty()) }} data-testid="org-add">+ قسم رئيسي</Button>
        </div>
      } />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title="أقسام نشطة" value={totalActive - titles.length} tone="emerald" testId="org-stat-active" />
        <StatCard title="أقسام رئيسية" value={depts.filter((d) => d.is_active && !d.parent_id).length} testId="org-stat-roots" />
        <StatCard title="مستويات الهرم" value={depts.length ? maxDepth + 1 : 0} tone="violet" testId="org-stat-depth" />
        <StatCard title="مسميات وظيفية" value={titles.length} tone="sky" testId="org-stat-titles" />
        <StatCard title="مسميات تقود آليات" value={driverTitles.length} tone="amber" testId="org-stat-driver-titles" />
        <StatCard title="موظفون على الملاك" value={headcount} tone="sky" testId="org-stat-headcount" />
      </div>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900" data-testid="org-titles-hint">
        <b>المسميات الوظيفية تُعرَّف هنا فقط.</b> أضف تحت كل قسم أب مسمياته بزر «+ مسمى»؛ ملف الموظف يختار المسمى من هذه القائمة ولا يقبل نصاً حراً، ويُشتق قسمه تلقائياً من القسم الأب. فعّل خانة «يقود آليات الشركة» على المسميات التي يظهر موظفوها في قائمة سائقي غرفة العمليات.
        <span className="block text-amber-800">لإعادة ترتيب الهرم: اسحب بطاقة القسم وأفلتها على القسم الجديد، أو استخدم «نقل إلى…» — ينتقل القسم مع كل فروعه وموظفيه، ويُطلب تأكيد قبل الحفظ.</span>
      </p>

      {/* شريط الأدوات: التبويبان + البحث + الطي/الفتح */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-bold" role="tablist" aria-label="طريقة العرض">
          <button type="button" role="tab" aria-selected={view === 'tree'} onClick={() => setView('tree')} className={clsx('rounded-lg px-3 py-1.5 transition', view === 'tree' ? 'bg-white text-brand-800 shadow' : 'text-slate-600')} data-testid="org-view-tree">🌳 الشجرة</button>
          <button type="button" role="tab" aria-selected={view === 'chart'} onClick={() => setView('chart')} className={clsx('rounded-lg px-3 py-1.5 transition', view === 'chart' ? 'bg-white text-brand-800 shadow' : 'text-slate-600')} data-testid="org-view-chart">🏛 المخطط الهرمي</button>
        </div>
        <input className={clsx(field, 'max-w-xs')} placeholder="بحث بالاسم أو الرمز أو المدير" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="org-search" />
        {filter && <span className="text-[11px] font-bold text-amber-800" data-testid="org-search-count">{filter.matches.size} مطابقة</span>}
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} data-testid="org-show-inactive" /> إظهار المعطّلة</label>
        {view === 'tree' && (
          <div className="ms-auto flex gap-1 text-[11px] font-bold">
            <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700" onClick={expandAll} data-testid="org-expand-all">فتح الكل</button>
            <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700" onClick={collapseAll} data-testid="org-collapse-all">طي الكل</button>
          </div>
        )}
      </div>

      {moveErr && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700" data-testid="org-move-error">{moveErr} <button type="button" className="ms-2 underline" onClick={() => setMoveErr(null)}>إخفاء</button></p>}

      {isLoading ? <LoadingSpinner /> : tree.roots.length === 0 ? <EmptyState title="لا أقسام بعد" hint="أضف أول قسم رئيسي ثم أقسامه الفرعية ومسمياته" /> : filter && filter.visible.size === 0 ? <EmptyState title="لا نتائج" hint="جرّب اسماً أو رمزاً آخر" /> : view === 'tree' ? (
        <OrgTreeView tree={tree} depts={depts} employees={employees} expanded={expanded} onToggle={toggle} filter={filter}
          onEdit={edit} onAddChild={(d) => { setErr(null); setDraft(empty(d.id)) }} onAddTitle={(d) => { setErr(null); setDraft(empty(d.id, true)) }} onDeactivate={(d) => void deactivate(d)} onReactivate={(d) => void reactivate(d)} onMove={requestMove} />
      ) : (
        <OrgChartView tree={tree} filter={filter} onSelect={edit} />
      )}

      {/* تأكيد النقل */}
      {pendingMove && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="org-move-title" data-testid="org-move-confirm">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h3 id="org-move-title" className="text-sm font-black text-slate-900">تأكيد نقل {pendingMove.moving.is_job_title ? 'المسمى' : 'القسم'}</h3>
            <p className="mt-2 text-xs leading-6 text-slate-700">
              سيُنقل <b>«{pendingMove.moving.name}»</b> ليصبح تحت <b>«{targetName}»</b>.
              {movingSubtree && (movingSubtree.descendants > 0 || movingSubtree.subtree > 0) && <span className="block text-slate-500">ينتقل معه {movingSubtree.descendants > 0 ? `${movingSubtree.descendants} فرع/مسمى و` : ''}{movingSubtree.subtree} موظف؛ وتتحدّث أقسام الموظفين تلقائياً.</span>}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPendingMove(null)} data-testid="org-move-cancel">إلغاء</Button>
              <Button size="sm" onClick={() => void confirmMove()} isLoading={save.isPending} data-testid="org-move-ok">تأكيد النقل</Button>
            </div>
          </div>
        </div>
      )}

      {/* لوحة النموذج الجانبية */}
      {draft && (
        <div className="fixed inset-0 z-40 flex justify-start bg-slate-900/30" onClick={() => { setDraft(null); setErr(null) }}>
          <section className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" data-testid="org-form">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900">{draft.id ? (draft.isJobTitle ? 'تعديل المسمى الوظيفي' : 'تعديل القسم') : draft.isJobTitle ? 'مسمى وظيفي جديد' : draft.parentId ? 'قسم فرعي جديد' : 'قسم رئيسي جديد'}</h3>
                {draft.parentId && <p className="text-[11px] text-slate-500">تحت: {tree.byId.get(draft.parentId)?.path ?? depts.find((d) => d.id === draft.parentId)?.name}</p>}
              </div>
              <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold" onClick={() => { setDraft(null); setErr(null) }} aria-label="إغلاق">✕</button>
            </div>
            <div className="grid gap-3">
              <Field id="org-name" label={draft.isJobTitle ? 'اسم المسمى الوظيفي *' : 'اسم القسم *'}><input id="org-name" className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="org-name" /></Field>
              <Field id="org-code" label="الرمز *" hint="فريد — مثل OPS أو OPS-1"><input id="org-code" className={clsx(field, 'uppercase')} dir="ltr" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} data-testid="org-code" /></Field>
              <Field id="org-parent" label="القسم الأب" hint={draft.id ? 'تغيير الأب = نقل القسم مع فروعه وموظفيه' : undefined}>
                <select id="org-parent" className={field} value={draft.parentId} onChange={(e) => setDraft({ ...draft, parentId: e.target.value, isJobTitle: e.target.value ? draft.isJobTitle : false })} data-testid="org-parent">
                  <option value="">— قسم رئيسي —</option>
                  {parentOptions.map((n) => <option key={n.d.id} value={n.d.id}>{'\u00A0\u00A0'.repeat(n.depth)}{n.depth > 0 ? '↳ ' : ''}{n.d.name} ({n.d.code})</option>)}
                </select>
              </Field>
              {!draft.isJobTitle && <Field id="org-manager" label="مدير القسم"><select id="org-manager" className={field} value={draft.managerId} onChange={(e) => setDraft({ ...draft, managerId: e.target.value })} data-testid="org-manager"><option value="">—</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.employee_number}</option>)}</select></Field>}
            </div>
            <div className="mt-3 flex flex-col gap-2 text-xs font-bold">
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.isJobTitle} disabled={!draft.parentId} onChange={(e) => setDraft({ ...draft, isJobTitle: e.target.checked, drivesVehicles: e.target.checked && draft.drivesVehicles, managerId: e.target.checked ? '' : draft.managerId })} data-testid="org-is-title" /> مسمى وظيفي (لا قسم){!draft.parentId && <span className="font-normal text-slate-400">— يتطلب قسماً أباً</span>}</label>
              {draft.isJobTitle && <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-2 py-1 text-amber-900"><input type="checkbox" checked={draft.drivesVehicles} onChange={(e) => setDraft({ ...draft, drivesVehicles: e.target.checked })} data-testid="org-drives" /> 🚛 يقود آليات الشركة (يظهر موظفوه لغرفة العمليات كسائقين)</label>}
              {draft.isJobTitle && <label className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-2 py-1 text-indigo-900">🔧 تخصص صيانة
                <select className={field} value={draft.maintenanceSpecialty} onChange={(e) => setDraft({ ...draft, maintenanceSpecialty: e.target.value })} data-testid="org-maintenance-specialty">
                  <option value="">ليس فني صيانة</option>
                  {MAINTENANCE_SPECIALTIES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <span className="font-normal text-indigo-700">(يظهر موظفوه لبوابة الصيانة كفنيين للتعيين على الآليات)</span>
              </label>}
            </div>
            {err && <p className="mt-2 text-xs font-bold text-red-600" role="alert" data-testid="org-error">{err}</p>}
            <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => void submit()} isLoading={save.isPending} data-testid="org-save">حفظ</Button><Button size="sm" variant="ghost" onClick={() => { setDraft(null); setErr(null) }}>إلغاء</Button></div>
          </section>
        </div>
      )}
    </div>
  )
}

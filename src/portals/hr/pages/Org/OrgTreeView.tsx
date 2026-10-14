/**
 * 00254 · الهيكل التنظيمي — عرض «الشجرة» الهرمية القابلة للطي/الفتح مع السحب والإفلات
 * كل عقدة بطاقة: سهم طي، الاسم والشارات، المدير، العدّادات، أزرار الإجراءات؛ فتح «الموظفين» يعرض موظفي العقدة مع رابط الملف.
 * السحب والإفلات (HTML5) لنقل قسم/مسمى تحت قسم آخر أو إلى الجذر — يُتحقق محلياً (canMove) ثم تأكيد قبل الحفظ؛
 * وعلى الجوال/اللمس يوجد زر «نقل إلى…» يقدّم القائمة نفسها.
 */
import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import type { HrDepartment, HrEmployeeRow } from '@features/hr/types'
import { specialtyLabel } from '@sdk/vehicle-operations.sdk'
import { avatarTone, canMove, initials, nodeEmployees, type OrgNode, type OrgTree } from '@features/hr/lib/orgTree'

export interface OrgTreeActions {
  onEdit: (d: HrDepartment) => void
  onAddChild: (d: HrDepartment) => void
  onAddTitle: (d: HrDepartment) => void
  onDeactivate: (d: HrDepartment) => void
  onReactivate: (d: HrDepartment) => void
  /** طلب نقل (بعد التحقق المحلي) — الصفحة تعرض التأكيد وتحفظ */
  onMove: (moving: HrDepartment, targetId: string | null) => void
}

export interface OrgTreeViewProps extends OrgTreeActions {
  tree: OrgTree
  depts: HrDepartment[]
  employees: HrEmployeeRow[]
  expanded: Set<string>
  onToggle: (id: string) => void
  /** مجموعة العقد الظاهرة عند البحث (null = الكل) ومجموعة المطابقة للتمييز */
  filter: { visible: Set<string>; matches: Set<string> } | null
}

const DRAG_MIME = 'application/x-akaram-org-node'

export function NodeBadges({ d }: { d: HrDepartment }) {
  return (
    <>
      {d.is_job_title && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-100" data-testid={`org-title-badge-${d.code}`}>مسمى وظيفي</span>}
      {d.drives_vehicles && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-100" data-testid={`org-drives-badge-${d.code}`}>🚛 يقود آليات</span>}
      {d.maintenance_specialty && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800 ring-1 ring-indigo-100" data-testid={`org-tech-badge-${d.code}`}>🔧 فني {specialtyLabel(d.maintenance_specialty)}</span>}
      {!d.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">معطّل</span>}
    </>
  )
}

export function EmployeeChip({ e }: { e: HrEmployeeRow }) {
  return (
    <Link to={`/hr/employees/${e.id}`} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-2 py-1.5 text-xs hover:border-brand-300 hover:bg-brand-50/40" data-testid={`org-emp-${e.employee_number}`}>
      <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black', avatarTone(e.full_name))} aria-hidden>{initials(e.full_name)}</span>
      <span className="min-w-0"><span className="block truncate font-bold text-slate-800">{e.full_name}</span><span className="block truncate text-[10px] text-slate-500" dir="ltr">{e.employee_number}{e.job_title ? ` · ${e.job_title}` : ''}</span></span>
    </Link>
  )
}

export default function OrgTreeView(props: OrgTreeViewProps) {
  const { tree, depts, filter } = props
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null | 'root'>(null)

  const dropAllowed = (targetId: string | null) => (dragId ? canMove(tree, depts, dragId, targetId).ok : false)
  const onDrop = (targetId: string | null) => (ev: DragEvent) => {
    ev.preventDefault(); ev.stopPropagation()
    const id = ev.dataTransfer.getData(DRAG_MIME) || dragId
    setOverId(null); setDragId(null)
    if (!id) return
    const moving = depts.find((d) => d.id === id)
    if (!moving || !canMove(tree, depts, id, targetId).ok) return
    props.onMove(moving, targetId)
  }
  const dnd = { dragId, setDragId, overId, setOverId, dropAllowed, onDrop }

  if (tree.roots.length === 0) return null
  return (
    <div className="space-y-2" data-testid="org-tree">
      {/* منطقة الإفلات إلى الجذر (تظهر أثناء السحب فقط) */}
      {dragId && (
        <div
          onDragOver={(ev) => { if (dropAllowed(null)) { ev.preventDefault(); setOverId('root') } }}
          onDragLeave={() => setOverId(null)}
          onDrop={onDrop(null)}
          className={clsx('rounded-2xl border-2 border-dashed p-3 text-center text-xs font-bold transition', overId === 'root' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : dropAllowed(null) ? 'border-brand-300 bg-brand-50/40 text-brand-700' : 'border-slate-200 bg-slate-50 text-slate-400')}
          data-testid="org-drop-root"
        >
          {dropAllowed(null) ? 'أفلت هنا لجعله قسماً رئيسياً' : 'المسمى الوظيفي لا يكون قسماً رئيسياً'}
        </div>
      )}
      {tree.roots.filter((n) => !filter || filter.visible.has(n.d.id)).map((n) => <TreeNode key={n.d.id} node={n} {...props} dnd={dnd} />)}
    </div>
  )
}

type Dnd = { dragId: string | null; setDragId: (v: string | null) => void; overId: string | null | 'root'; setOverId: (v: string | null | 'root') => void; dropAllowed: (t: string | null) => boolean; onDrop: (t: string | null) => (ev: DragEvent) => void }

function TreeNode({ node, dnd, ...props }: OrgTreeViewProps & { node: OrgNode; dnd: Dnd }) {
  const { d } = node
  const { expanded, onToggle, filter, employees } = props
  const [showEmployees, setShowEmployees] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const children = node.children.filter((c) => !filter || filter.visible.has(c.d.id))
  const hasChildren = children.length > 0
  // أثناء البحث تُفتح كل العقد الظاهرة تلقائياً حتى تظهر المطابقات
  const open = filter ? true : expanded.has(d.id)
  const isMatch = filter?.matches.has(d.id) ?? false
  const emps = nodeEmployees(d, employees)
  const isDragging = dnd.dragId === d.id
  const canAcceptDrop = Boolean(dnd.dragId) && !isDragging && dnd.dropAllowed(d.id)
  const isOver = dnd.overId === d.id
  const titleKids = children.filter((c) => c.d.is_job_title).length
  const deptKids = children.length - titleKids
  const moveTargets = props.depts.filter((t) => t.is_active && !t.is_job_title && t.id !== d.id && canMove(props.tree, props.depts, d.id, t.id).ok)

  return (
    <div className="relative" data-testid={`org-row-${d.code}`} data-depth={node.depth} data-expanded={open ? 'true' : 'false'}>
      <article
        draggable={d.is_active}
        onDragStart={(ev) => { ev.dataTransfer.setData(DRAG_MIME, d.id); ev.dataTransfer.effectAllowed = 'move'; dnd.setDragId(d.id) }}
        onDragEnd={() => { dnd.setDragId(null); dnd.setOverId(null) }}
        onDragOver={(ev) => { if (canAcceptDrop) { ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = 'move'; dnd.setOverId(d.id) } }}
        onDragLeave={(ev) => { if (ev.currentTarget === ev.target) dnd.setOverId(null) }}
        onDrop={dnd.onDrop(d.id)}
        className={clsx(
          'group rounded-2xl border bg-white shadow-sm transition',
          d.is_job_title ? 'border-sky-100' : node.depth === 0 ? 'border-brand-200 ring-1 ring-brand-100' : 'border-slate-200',
          !d.is_active && 'opacity-60',
          isDragging && 'opacity-40 ring-2 ring-brand-300',
          isOver && canAcceptDrop && 'ring-2 ring-emerald-400 bg-emerald-50/40',
          dnd.dragId && !isDragging && !canAcceptDrop && 'opacity-70',
          isMatch && 'ring-2 ring-amber-300',
        )}
        data-testid={`org-card-${d.code}`}
      >
        <div className="flex flex-wrap items-center gap-2 p-2.5 sm:flex-nowrap">
          {/* مقبض السحب + سهم الطي */}
          <span className="hidden cursor-grab select-none text-slate-300 group-hover:text-slate-500 sm:inline" title="اسحب لنقل القسم" aria-hidden>⋮⋮</span>
          <button type="button" onClick={() => onToggle(d.id)} disabled={!hasChildren} aria-expanded={open} aria-label={open ? 'طي' : 'فتح'} data-testid={`org-toggle-${d.code}`}
            className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black transition', hasChildren ? 'bg-slate-100 text-slate-700 hover:bg-brand-50 hover:text-brand-700' : 'text-slate-200')}>
            {hasChildren ? (open ? '▾' : '◂') : '•'}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={clsx('font-black', d.is_job_title ? 'text-sky-900' : node.depth === 0 ? 'text-base text-brand-900' : 'text-slate-900')}>{d.name}</span>
              <span className="rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-100" dir="ltr">{d.code}</span>
              <NodeBadges d={d} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
              {!d.is_job_title && <span>المدير: <b className="text-slate-700" data-testid={`org-manager-${d.code}`}>{d.manager_name ?? '—'}</b></span>}
              <button type="button" onClick={() => setShowEmployees((v) => !v)} className="font-bold text-brand-700 hover:underline" data-testid={`org-emps-toggle-${d.code}`}>
                {d.is_job_title ? 'يحمله' : 'موظفوه'}: {d.employees_active}
              </button>
              {hasChildren && <span data-testid={`org-subtree-${d.code}`}>مع الفروع: <b className="text-slate-700">{node.subtree}</b></span>}
              {hasChildren && <span className="text-slate-400">{deptKids > 0 && `${deptKids} قسم`}{deptKids > 0 && titleKids > 0 && ' · '}{titleKids > 0 && `${titleKids} مسمى`}</span>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1 text-[11px] font-bold">
            <button type="button" className="rounded-lg bg-brand-50 px-2 py-1 text-brand-700 hover:bg-brand-100" onClick={() => props.onEdit(d)} data-testid={`org-edit-${d.code}`}>تعديل</button>
            {d.is_active && !d.is_job_title && <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200" onClick={() => props.onAddChild(d)} data-testid={`org-addchild-${d.code}`}>+ فرعي</button>}
            {d.is_active && !d.is_job_title && <button type="button" className="rounded-lg bg-sky-50 px-2 py-1 text-sky-700 hover:bg-sky-100" onClick={() => props.onAddTitle(d)} data-testid={`org-addtitle-${d.code}`}>+ مسمى</button>}
            {d.is_active && <button type="button" className="rounded-lg bg-violet-50 px-2 py-1 text-violet-700 hover:bg-violet-100" onClick={() => setMoveOpen((v) => !v)} aria-expanded={moveOpen} data-testid={`org-move-${d.code}`}>نقل إلى…</button>}
            {d.is_active
              ? <button type="button" className="rounded-lg bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100" onClick={() => props.onDeactivate(d)} data-testid={`org-deactivate-${d.code}`}>تعطيل</button>
              : <button type="button" className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100" onClick={() => props.onReactivate(d)} data-testid={`org-reactivate-${d.code}`}>تفعيل</button>}
          </div>
        </div>

        {moveOpen && (
          <div className="flex flex-wrap items-center gap-2 border-t border-violet-100 bg-violet-50/50 px-3 py-2 text-xs" data-testid={`org-move-panel-${d.code}`}>
            <span className="font-bold text-violet-900">نقل «{d.name}» ليصبح تحت:</span>
            <select className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs" defaultValue="" data-testid={`org-move-select-${d.code}`}
              onChange={(e) => { const v = e.target.value; if (v === '') return; setMoveOpen(false); props.onMove(d, v === '__root__' ? null : v) }}>
              <option value="">— اختر القسم الهدف —</option>
              {!d.is_job_title && d.parent_id && <option value="__root__">⌂ قسم رئيسي (بلا أب)</option>}
              {moveTargets.map((t) => <option key={t.id} value={t.id}>{props.tree.byId.get(t.id)?.path ?? t.name}</option>)}
            </select>
            <span className="text-violet-700">أو اسحب البطاقة وأفلتها على القسم الهدف</span>
            <button type="button" className="ms-auto text-violet-700 underline" onClick={() => setMoveOpen(false)}>إغلاق</button>
          </div>
        )}

        {showEmployees && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2" data-testid={`org-emps-${d.code}`}>
            {emps.length === 0 ? (
              <p className="text-[11px] text-slate-500">لا موظفون نشطون {d.is_job_title ? 'على هذا المسمى' : 'في هذا القسم مباشرة'}{!d.is_job_title && d.employees_active === 0 && node.subtree > 0 ? ` — ${node.subtree} في فروعه` : ''}.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{emps.map((e) => <EmployeeChip key={e.id} e={e} />)}</div>
            )}
            <Link to={`/hr/employees?dept=${d.id}`} className="mt-1.5 inline-block text-[11px] font-bold text-brand-700 hover:underline">فتح في قائمة الموظفين ←</Link>
          </div>
        )}
      </article>

      {hasChildren && open && (
        <div className="relative ms-4 mt-2 space-y-2 border-s-2 border-dashed border-slate-200 ps-3 sm:ms-6 sm:ps-4" data-testid={`org-children-${d.code}`}>
          {children.map((c) => <TreeNode key={c.d.id} node={c} dnd={dnd} {...props} />)}
        </div>
      )}
    </div>
  )
}

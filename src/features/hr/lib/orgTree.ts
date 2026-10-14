/**
 * 00254 · الهيكل التنظيمي — منطق الشجرة الهرمية (بلا React)
 * بناء الشجرة من قائمة الأقسام المسطّحة، مجاميع الفروع، البحث مع إظهار الأسلاف، وقواعد النقل (سحب وإفلات / «نقل إلى»).
 * القواعد نفسها مفروضة في قاعدة البيانات (hr_department_save: HR_DEPT_CYCLE / HR_DEPT_PARENT_IS_JOB_TITLE / HR_JOB_TITLE_PARENT_REQUIRED)؛
 * هنا نمنعها مبكراً لتجربة سلسة ورسائل عربية واضحة.
 */
import type { HrDepartment, HrEmployeeRow } from '@features/hr/types'

export interface OrgNode {
  d: HrDepartment
  depth: number
  path: string
  children: OrgNode[]
  /** موظفو العقدة نفسها + كل فروعها */
  subtree: number
  /** عدد الفروع (أقسام + مسميات) في كل المستويات */
  descendants: number
}

export interface OrgTree {
  roots: OrgNode[]
  byId: Map<string, OrgNode>
  /** ترتيب هرمي مسطّح (أب ثم فروعه) — للتصدير والجداول */
  flat: OrgNode[]
}

const byName = (a: HrDepartment, b: HrDepartment) => {
  // الأقسام قبل المسميات، ثم أبجدياً
  if (Boolean(a.is_job_title) !== Boolean(b.is_job_title)) return a.is_job_title ? 1 : -1
  return a.name.localeCompare(b.name, 'ar')
}

/** يبني الشجرة؛ العقدة التي أبوها غير موجود (محذوف/مؤرشف) تُعامل كجذر حتى لا تختفي. */
export function buildOrgTree(depts: HrDepartment[], opts: { includeInactive?: boolean } = {}): OrgTree {
  const include = opts.includeInactive ? depts : depts.filter((d) => d.is_active)
  const ids = new Set(include.map((d) => d.id))
  const kids = new Map<string | null, HrDepartment[]>()
  for (const d of include) {
    const k = d.parent_id && ids.has(d.parent_id) ? d.parent_id : null
    kids.set(k, [...(kids.get(k) ?? []), d])
  }
  const byId = new Map<string, OrgNode>()
  const flat: OrgNode[] = []
  const walk = (parent: string | null, depth: number, path: string): OrgNode[] =>
    [...(kids.get(parent) ?? [])].sort(byName).map((d) => {
      const p = path ? `${path} › ${d.name}` : d.name
      const node: OrgNode = { d, depth, path: p, children: [], subtree: 0, descendants: 0 }
      flat.push(node)
      node.children = walk(d.id, depth + 1, p)
      node.subtree = d.employees_active + node.children.reduce((s, c) => s + c.subtree, 0)
      node.descendants = node.children.reduce((s, c) => s + 1 + c.descendants, 0)
      byId.set(d.id, node)
      return node
    })
  const roots = walk(null, 0, '')
  return { roots, byId, flat }
}

/** معرّفات كل فروع العقدة (كل المستويات). */
export function descendantIds(tree: OrgTree, id: string): Set<string> {
  const out = new Set<string>()
  const node = tree.byId.get(id)
  const rec = (n: OrgNode | undefined) => { for (const c of n?.children ?? []) { out.add(c.d.id); rec(c) } }
  rec(node)
  return out
}

/** معرّفات أسلاف العقدة حتى الجذر. */
export function ancestorIds(depts: HrDepartment[], id: string): string[] {
  const map = new Map(depts.map((d) => [d.id, d] as const))
  const out: string[] = []
  let cur = map.get(id)?.parent_id ?? null
  let guard = 0
  while (cur && guard++ < 64) { out.push(cur); cur = map.get(cur)?.parent_id ?? null }
  return out
}

/**
 * البحث: يعيد العقد المطابقة + أسلافها (حتى تبقى الشجرة متصلة) — وأيّ فروعها لا تُعرض إلا إن طابقت بنفسها.
 * فارغ ⇒ null (أي: اعرض الكل).
 */
export function searchOrg(depts: HrDepartment[], q: string): { visible: Set<string>; matches: Set<string> } | null {
  const s = q.trim().toLowerCase()
  if (!s) return null
  const matches = new Set<string>()
  for (const d of depts) {
    if (d.name.toLowerCase().includes(s) || d.code.toLowerCase().includes(s) || (d.manager_name ?? '').toLowerCase().includes(s)) matches.add(d.id)
  }
  const visible = new Set<string>(matches)
  for (const id of matches) for (const a of ancestorIds(depts, id)) visible.add(a)
  return { visible, matches }
}

export type MoveCheck = { ok: true } | { ok: false; reason: string }

/**
 * هل يمكن نقل العقدة `movingId` لتصبح تحت `targetId` (null = قسم رئيسي)؟
 * - لا نقل إلى نفسها ولا إلى أحد فروعها (دورة).
 * - المسمى الوظيفي لا يكون أباً.
 * - المسمى الوظيفي لا يكون جذراً (يجب أن يتبع قسماً).
 * - الهدف يجب أن يكون نشطاً.
 */
export function canMove(tree: OrgTree, depts: HrDepartment[], movingId: string, targetId: string | null): MoveCheck {
  const moving = depts.find((d) => d.id === movingId)
  if (!moving) return { ok: false, reason: 'العقدة غير موجودة' }
  if ((moving.parent_id ?? null) === targetId) return { ok: false, reason: 'العقدة موجودة أصلاً في هذا الموضع' }
  if (targetId === null) {
    if (moving.is_job_title) return { ok: false, reason: 'المسمى الوظيفي يجب أن يتبع قسماً — لا يمكن جعله قسماً رئيسياً' }
    return { ok: true }
  }
  if (targetId === movingId) return { ok: false, reason: 'لا يمكن نقل القسم إلى نفسه' }
  const target = depts.find((d) => d.id === targetId)
  if (!target) return { ok: false, reason: 'القسم الهدف غير موجود' }
  if (!target.is_active) return { ok: false, reason: 'القسم الهدف معطّل' }
  if (target.is_job_title) return { ok: false, reason: `«${target.name}» مسمى وظيفي — المسميات لا تقبل فروعاً` }
  if (descendantIds(tree, movingId).has(targetId)) return { ok: false, reason: `لا يمكن نقل «${moving.name}» إلى أحد فروعه (دورة في الهيكل)` }
  return { ok: true }
}

/** الحرفان الأولان من الاسم (للصورة الرمزية). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  if (parts.length === 1) return parts[0]!.slice(0, 2)
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`
}

/** لون ثابت للاسم (للصورة الرمزية) من لوحة هادئة. */
export const AVATAR_TONES = ['bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800'] as const
export function avatarTone(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]!
}

/** موظفو العقدة: للمسمى = من يحمل المسمى؛ للقسم = من قسمه هو هذا القسم مباشرة (بلا الفروع). */
export function nodeEmployees(d: HrDepartment, employees: HrEmployeeRow[]): HrEmployeeRow[] {
  const list = d.is_job_title ? employees.filter((e) => e.job_title_id === d.id) : employees.filter((e) => e.department_id === d.id)
  return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'))
}

/** خيارات اختيار النطاق من الهيكل التنظيمي — دوال صرفة قابلة للاختبار */
import type { Department } from '@features/departments'

export interface DepartmentOption { id: string; label: string; depth: number }

/** أقسام الهيكل مرتّبة كشجرة (الأب ثم أبناؤه) بإزاحة العمق؛ تُستبعد المسمّيات الوظيفية وغير الفعّالة */
export function buildDepartmentOptions(departments: readonly Department[]): DepartmentOption[] {
  const usable = departments.filter((d) => d.is_active && !d.is_job_title)
  const ids = new Set(usable.map((d) => d.id))
  const byParent = new Map<string | null, Department[]>()
  for (const d of usable) {
    // أب غير موجود بين المعروضين (مؤرشف/مسمّى) ⇒ يُعامل القسم كجذر كي لا يضيع من القائمة
    const key = d.parent_id && ids.has(d.parent_id) ? d.parent_id : null
    byParent.set(key, [...(byParent.get(key) ?? []), d])
  }
  const out: DepartmentOption[] = []
  const seen = new Set<string>()
  const walk = (parent: string | null, depth: number): void => {
    const kids = [...(byParent.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    for (const d of kids) {
      if (seen.has(d.id)) continue   // حلقة بيانات (قسم أبوه نفسه أو أحد أحفاده): لا نكرّر ولا ندور
      seen.add(d.id)
      out.push({ id: d.id, label: `${'– '.repeat(depth)}${d.name}`, depth })
      walk(d.id, depth + 1)
    }
  }
  walk(null, 0)
  // أقسام في حلقة معزولة عن أي جذر لم تُزَر — نُلحقها كجذور
  for (const d of usable) if (!seen.has(d.id)) { seen.add(d.id); out.push({ id: d.id, label: d.name, depth: 0 }) }
  return out
}

/** وصف النطاق المختار للعرض قبل التفعيل */
export function describeScope(
  s: { branchId: string | null; departmentId: string | null; includeSub: boolean },
  branches: readonly { id: string; name: string }[],
  departments: readonly { id: string; name: string }[],
): string {
  const parts: string[] = []
  const b = s.branchId ? branches.find((x) => x.id === s.branchId) : null
  const d = s.departmentId ? departments.find((x) => x.id === s.departmentId) : null
  if (s.branchId) parts.push(`فرع ${b?.name ?? '…'}`)
  if (s.departmentId) parts.push(`قسم ${d?.name ?? '…'}${s.includeSub ? ' وأقسامه الفرعية' : ' (بلا فروعه)'}`)
  return parts.join(' ∩ ')
}

/** تاريخ بغداد اليوم (UTC+3 ثابتة) بصيغة YYYY-MM-DD */
export const baghdadToday = (now: number = Date.now()): string => new Date(now + 3 * 3600_000).toISOString().slice(0, 10)
/** إزاحة يوم بصيغة YYYY-MM-DD */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

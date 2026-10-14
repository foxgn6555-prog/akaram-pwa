/** 00254: منطق شجرة الهيكل التنظيمي — البناء، المجاميع، البحث مع الأسلاف، وقواعد النقل */
import { describe, expect, it } from 'vitest'
import { ancestorIds, avatarTone, buildOrgTree, canMove, descendantIds, initials, searchOrg } from '@features/hr/lib/orgTree'
import type { HrDepartment } from '@features/hr/types'

const d = (o: Partial<HrDepartment> & { id: string; name: string; code: string }): HrDepartment => ({ parent_id: null, is_active: true, manager_id: null, manager_name: null, employees_active: 0, employees_total: 0, children: 0, created_at: '', is_job_title: false, drives_vehicles: false, maintenance_specialty: null, ...o })
const depts: HrDepartment[] = [
  d({ id: 'ops', name: 'العمليات', code: 'OPS', employees_active: 2, manager_name: 'سامر' }),
  d({ id: 'ops1', name: 'القاطع الأول', code: 'OPS-1', parent_id: 'ops', employees_active: 5 }),
  d({ id: 'ops11', name: 'الكرادة', code: 'OPS-1-K', parent_id: 'ops1', employees_active: 3 }),
  d({ id: 't1', name: 'سائق كابسة', code: 'T-DRV', parent_id: 'ops1', is_job_title: true, drives_vehicles: true, employees_active: 4 }),
  d({ id: 'fin', name: 'المالية', code: 'FIN', employees_active: 1 }),
  d({ id: 'old', name: 'قديم', code: 'OLD', is_active: false }),
  d({ id: 'orphan', name: 'يتيم', code: 'ORPH', parent_id: 'deleted-parent' }),
]

describe('buildOrgTree', () => {
  it('يبني الهرم بالعمق والمسار، الأقسام قبل المسميات، ويحسب مجموع الفروع وعدد الأحفاد', () => {
    const t = buildOrgTree(depts)
    expect(t.roots.map((n) => n.d.code)).toEqual(['OPS', 'FIN', 'ORPH'])   // اليتيم يُعامل كجذر ولا يختفي؛ المعطّل مخفي
    const ops = t.byId.get('ops')!
    expect(ops.children.map((c) => c.d.code)).toEqual(['OPS-1'])
    expect(t.byId.get('ops1')!.children.map((c) => c.d.code)).toEqual(['OPS-1-K', 'T-DRV'])
    expect(ops.subtree).toBe(2 + 5 + 3 + 4); expect(ops.descendants).toBe(3)
    expect(t.byId.get('ops11')!.path).toBe('العمليات › القاطع الأول › الكرادة'); expect(t.byId.get('ops11')!.depth).toBe(2)
    expect(t.flat.map((n) => n.d.code)).toEqual(['OPS', 'OPS-1', 'OPS-1-K', 'T-DRV', 'FIN', 'ORPH'])
    expect(buildOrgTree(depts, { includeInactive: true }).byId.has('old')).toBe(true)
  })
  it('descendantIds / ancestorIds', () => {
    const t = buildOrgTree(depts)
    expect([...descendantIds(t, 'ops')].sort()).toEqual(['ops1', 'ops11', 't1'])
    expect(ancestorIds(depts, 'ops11')).toEqual(['ops1', 'ops'])
  })
})

describe('searchOrg', () => {
  it('فارغ ⇒ null؛ المطابقة بالاسم/الرمز/المدير مع إظهار الأسلاف فقط', () => {
    expect(searchOrg(depts, '  ')).toBeNull()
    const r = searchOrg(depts, 'الكرادة')!
    expect([...r.matches]).toEqual(['ops11']); expect([...r.visible].sort()).toEqual(['ops', 'ops1', 'ops11'])
    expect([...searchOrg(depts, 'ops-1')!.matches].sort()).toEqual(['ops1', 'ops11'])
    expect([...searchOrg(depts, 'سامر')!.matches]).toEqual(['ops'])
  })
})

describe('canMove', () => {
  const t = buildOrgTree(depts)
  it('يسمح بالنقل الصحيح ويمنع الدورة والمسمى كأب والمسمى كجذر والهدف المعطّل والموضع نفسه', () => {
    expect(canMove(t, depts, 'ops11', 'fin')).toEqual({ ok: true })
    expect(canMove(t, depts, 'ops1', null)).toEqual({ ok: true })
    expect(canMove(t, depts, 'ops', 'ops11').ok).toBe(false)
    expect((canMove(t, depts, 'ops', 'ops11') as { reason: string }).reason).toContain('دورة')
    expect(canMove(t, depts, 'ops', 'ops').ok).toBe(false)
    expect((canMove(t, depts, 'fin', 't1') as { reason: string }).reason).toContain('مسمى وظيفي')
    expect((canMove(t, depts, 't1', null) as { reason: string }).reason).toContain('قسماً رئيسياً')
    expect((canMove(t, depts, 'fin', 'old') as { reason: string }).reason).toContain('معطّل')
    expect(canMove(t, depts, 'ops11', 'ops1').ok).toBe(false)   // الموضع نفسه
    expect(canMove(t, depts, 't1', 'fin')).toEqual({ ok: true })   // نقل مسمى إلى قسم آخر مسموح
  })
})

describe('initials / avatarTone', () => {
  it('حرفان من الاسم ولون ثابت', () => {
    expect(initials('أحمد علي')).toBe('أع'); expect(initials('سارة')).toBe('سا'); expect(initials('')).toBe('؟')
    expect(avatarTone('أحمد علي')).toBe(avatarTone('أحمد علي'))
  })
})

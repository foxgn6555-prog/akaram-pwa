/**
 * الجولة ٢ — عقد الأدوار الحساسة: مصدر واحد للبيانات (جدول sensitive_roles).
 *  · بذرة الترحيل = ثابت الواجهة SENSITIVE_ROLES (تسعة، بلا زيادة ولا نقص).
 *  · الحارس في الدالة صار app.is_sensitive_role(p_role) — لا مصفوفة مثبّتة في نص الدالة.
 *  · بطاقة IT تقرأ من الخادم (sensitive_roles_list) ولا تعتمد على ثابت محلي.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SENSITIVE_ROLES } from '@sdk/users.sdk'

const MIGRATION = 'supabase/migrations/20261120130000_sensitive_roles_policy.sql'
const CARD = 'src/portals/it/pages/UserManagement/SensitiveRolesCard.tsx'
const sql = readFileSync(MIGRATION, 'utf8')

function seededRoles(): string[] {
  const seed = sql.split('insert into public.sensitive_roles')[1]?.split('on conflict')[0] ?? ''
  return [...seed.matchAll(/^\s*\('([a-z_]+)'/gm)].map((m) => m[1] as string)
}

describe('🔐 عقد الأدوار الحساسة (الجولة ٢)', () => {
  it('بذرة الترحيل تحوي التسعة بالضبط', () => {
    const roles = seededRoles()
    expect(roles).toHaveLength(9)
    expect([...roles].sort()).toEqual([...SENSITIVE_ROLES].sort())
  })

  it('الدور المحمي لا يُعطَّل: it_admin و super_admin في أرضية الأمان', () => {
    expect(sql).toMatch(/if not p_active and p_role in \('it_admin', 'super_admin'\)/)
    expect(new Set(['it_admin', 'super_admin']).size).toBe(2)
    const card = readFileSync(CARD, 'utf8')
    expect(card).toContain("new Set(['it_admin', 'super_admin'])")
  })

  it('الدالة تقرأ الجدول ولا تبقى فيها المصفوفة القديمة', () => {
    expect(sql).toContain('if app.is_sensitive_role(p_role)')
    expect(sql).toContain("raise exception ''ROLE_SENSITIVE_FORBIDDEN")
    // الترقيع يستبدل المصفوفة المثبّتة، ولا يُبقيها في النص الجديد
    const newText = sql.split('v_new text :=')[1]?.split('begin')[0] ?? ''
    expect(newText).not.toContain("'finance_officer', 'deputy_director'")
  })

  it('الحارس يقرأ الجدول فقط والأدوار غير المدرجة ليست حساسة', () => {
    expect(sql).toContain('select coalesce((select sr.active from public.sensitive_roles sr where sr.role = p_role), false)')
  })

  it('بطاقة IT تعرض من الخادم وتستدعي الدالة المحروسة', () => {
    const card = readFileSync(CARD, 'utf8')
    expect(card).toContain('useSensitiveRoles')
    expect(card).toContain('useSetSensitiveRole')
    expect(sql).toContain('create or replace function public.sensitive_roles_list()')
    expect(sql).toContain("perform app.require_can('it.user-management.list', 'view')")
    expect(sql).toContain("perform app.require_it_admin('edit')")
  })
})

/**
 * 00406 — عقد «الدور الجديد معروف في دالتي العرض والتدقيق المركزيتين».
 *
 * العيب المؤكَّد على القاعدة الحيّة قبل الإصلاح:
 *   · `app.approval_role_label('ops_room_manager')` ⇒ المفتاح الخام (بالإنجليزية) في سجل الموافقات.
 *   · `app.current_role()` لصاحب الدور وحده ⇒ `authenticated` ⇒ سطر التدقيق يسجّل صلاحية القاعدة.
 *
 * يمنع هذا الملف: حذف الدور من أي من الدالتين، أو تغيير أولوية الأدوار القائمة،
 * أو منح/سحب أي صلاحية. موقع الدور في مصفوفة الأولوية يجب أن يبقى **آخر** المصفوفة.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const raw = readFileSync(join(ROOT, 'supabase/migrations/00406_ops_room_manager_role_center.sql'), 'utf8')
/** بلا التعليقات: نتحقق من SQL الفعلي لا من شرحه */
const sql = raw.replace(/^\s*--.*$/gm, '')

describe('00406 — الدور الجديد في app.approval_role_label و app.current_role', () => {
  it('التسمية العربية: فرع صريح للدور ونصه المعتمد', () => {
    expect(sql).toContain("when 'ops_room_manager' then 'مدير غرفة العمليات'")
    expect(sql).toMatch(/create or replace function app\.approval_role_label\(p_role text\)/)
    // الفرع الافتراضي لم يتغيّر (المفاتيح المجهولة تُعرض كما هي)
    expect(sql).toContain("else coalesce(p_role, '—') end")
  })

  it('الدور الوظيفي: الدور الجديد آخر مصفوفة الأولوية (لا يزاحم أي دور قائم)', () => {
    const order = sql.match(/unnest\(array\[([^\]]+)\]\)/i)?.[1] ?? ''
    const roles = [...order.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(roles[0]).toBe('it_admin')
    expect(roles.at(-1)).toBe('ops_room_manager')
    expect(roles).toHaveLength(18)
    expect(new Set(roles).size).toBe(18)
    // الأدوار الحسّاسة الأولى لم تتحرّك
    expect(roles.slice(0, 5)).toEqual(['it_admin', 'super_admin', 'executive_director', 'deputy_director', 'ops_room'])
  })

  it('لا صلاحيات جديدة: لا grant/revoke ولا مساس بـ has_role', () => {
    expect(sql).not.toMatch(/^\s*grant /im)
    expect(sql).not.toMatch(/^\s*revoke /im)
    expect(sql).not.toContain('has_role')
    expect(sql).toContain('security definer')
  })
})

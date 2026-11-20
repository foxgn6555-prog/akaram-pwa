/**
 * الجولة ٦ — عقد صلاحيات الصفحات لكل حساب:
 *  · السقف يُطبَّق داخل محرك الصلاحيات نفسه (app.can) ⇒ كل دوال الكتابة وكل واجهات القراءة تراه
 *  · السقف يقيّد ولا يمنح · حسابات IT مستثناة · كل ضبط بدور + تدقيق
 *  · العميل لا يلمس الجدول مباشرة (RPC فقط)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8')
const MIG = read('supabase/migrations/20261120180000_account_page_levels.sql')
const flat = MIG.replace(/\s+/g, ' ')

describe('صلاحيات الحساب — عقد قاعدة البيانات', () => {
  it('الجدول بثلاثة مستويات فقط ومحروس بالكامل', () => {
    expect(flat).toContain("level text not null check (level in ('full', 'create', 'view'))")
    expect(flat).toContain('alter table public.account_page_levels enable row level security')
    expect(flat).toContain('revoke all on table public.account_page_levels from anon, authenticated')
  })

  it('المحرك: can = can_base ثم السقف (نقطة إنفاذ واحدة لكل الدوال)', () => {
    expect(MIG).toContain('create or replace function app.can_base(')
    expect(MIG).toMatch(/if not app\.can_base\(p_user, p_unit, p_action\) then\s+return false;/)
    expect(MIG).toContain('return app.level_permits(p_user, p_unit, p_action);')
    expect(MIG).toContain('create or replace function app.require_can(')
  })

  it('خريطة الإجراءات: view/export ≤ view · create ≤ create · edit/decide/execute/delete ≤ full', () => {
    expect(flat).toContain("when p_action in ('view', 'export') then 'view'")
    expect(flat).toContain("when p_action = 'create' then 'create'")
    expect(flat).toContain('else \'full\'')
    expect(flat).toContain("when 'full' then 3 when 'create' then 2 when 'view' then 1 else 0")
  })

  it('السقف لا يمنح: يعتمد على can_base أولاً ولا يفتح وحدة غير متاحة', () => {
    const canBody = MIG.slice(MIG.indexOf('create or replace function app.can('))
    const firstLine = canBody.indexOf('if not app.can_base')
    const levelLine = canBody.indexOf('app.level_permits')
    expect(firstLine).toBeGreaterThan(-1)
    expect(levelLine).toBeGreaterThan(firstLine)
    const middle = canBody.slice(firstLine, levelLine)
    const trueAt = middle.indexOf('return true')
    // أي «return true» قبل تطبيق السقف يجب أن يكون محكوماً باستثناء IT حصراً
    expect(trueAt).toBeGreaterThan(-1)
    expect(middle.slice(0, trueAt)).toContain("role = 'it_admin'")
  })

  it('IT مستثناة من السقف', () => {
    const canBody = MIG.slice(MIG.indexOf('create or replace function app.can('))
    expect(canBody.slice(0, canBody.indexOf('app.level_permits'))).toContain("role = 'it_admin'")
  })

  it('الضبط لتقنية المعلومات فقط وبسجل تدقيق', () => {
    expect(flat).toContain("perform app.require_it_admin('edit');")
    expect(flat).toContain("perform app.perm_audit(p_user, null, 'level_set'")
    expect(flat).toContain("perform app.perm_audit(p_user, null, 'level_clear'")
    expect(flat).toContain('revoke all on function public.it_account_level_set(uuid, text, text) from public, anon;')
  })
})

describe('صلاحيات الحساب — عقد الواجهة', () => {
  it('لوحة الضبط مركّبة في صفحة الصلاحيات', () => {
    expect(read('src/portals/it/pages/Permissions/PermissionTemplates.tsx')).toContain('<AccountLevelsPanel />')
  })

  it('العميل يستخدم الدوال المحروسة ولا يقرأ الجدول', () => {
    const sdk = read('src/services/permissions.sdk.ts')
    expect(sdk).toContain("'it_account_level_set'")
    expect(sdk).toContain("'it_account_level_clear'")
    expect(sdk).toContain("'it_account_levels'")
    expect(sdk).not.toContain('account_page_levels')
    expect(read('src/portals/it/pages/Permissions/AccountLevelsPanel.tsx')).not.toContain('account_page_levels')
  })
})

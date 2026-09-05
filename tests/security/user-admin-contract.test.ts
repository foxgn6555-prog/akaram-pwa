/** عقد أمني: وحدة إنشاء المستخدمين — تطابق الأدوار في كل المصادر + حواجز الخادم + رسائل SDK */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const ROOT = process.cwd()
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8')

const SCHEMA = read('src/features/user-management/schemas/create-user.schema.ts')
const TYPES = read('src/features/user-management/types.ts')
const LABELS = read('src/lib/constants/roles.constants.ts')
const SERVER = read('supabase/functions/admin-users/index.ts')
const SDK = read('src/services/users.sdk.ts')

const schemaRoles = /role: z\.enum\(\[([\s\S]*?)\], \{/.exec(SCHEMA)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
const serverRoles = /const VALID_ROLES = \[([\s\S]*?)\]/.exec(SERVER)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
const assignRoles = /ASSIGNABLE_ROLES[^=]*= \[([\s\S]*?)\] as const/.exec(TYPES)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
const labelKeys = [...LABELS.matchAll(/^\s{2}([a-z_]+): '/gm)].map((m) => m[1])

describe('عقد أدوار إنشاء المستخدمين — تطابق المصادر الأربعة', () => {
  it('قائمة الواجهة (ASSIGNABLE_ROLES) تطابق قائمة المخطط', () => {
    expect(assignRoles).toEqual(schemaRoles)
  })

  it('قائمة الخادم (VALID_ROLES) تطابق قائمة الواجهة', () => {
    expect(serverRoles).toEqual(assignRoles)
  })

  it('كل دور له تسمية عربية في ROLE_LABELS — بلا أدوار زائدة', () => {
    for (const role of assignRoles) expect(labelKeys, `بلا تسمية: ${role}`).toContain(role)
    expect(labelKeys.sort()).toEqual([...assignRoles].sort())
  })

  it('كل كود خطأ من الخادم له رسالة عربية في الـ SDK', () => {
    const serverCodes = [...SERVER.matchAll(/error: '([A-Z_]+)'/g)].map((m) => m[1])
    const unique = [...new Set(serverCodes)]
    expect(unique.length).toBeGreaterThan(10)
    for (const code of unique) expect(SDK, `رسالة مفقودة للكود: ${code}`).toContain(`${code}:`)
  })
})

describe('مهاجرة 00051 — تعيين الأدوار من Edge Function (service_role)', () => {
  const MIGRATION = read('supabase/migrations/00051_user_role_service_actor.sql')

  it('يوجد التوقيع الرباعي p_actor اختياري (Backward-compatible)', () => {
    expect(MIGRATION).toContain('p_actor uuid default null')
    expect(MIGRATION).toContain('coalesce(p_actor, auth.uid())')
  })

  it('لا يعتمد التحقق من المتصرّف على auth.uid() مباشرة داخل الحاجز', () => {
    // الجوهر: الحاجز يستعلم user_roles بدل app.has_role/auth.uid()
    expect(MIGRATION).toContain('select 1 from public.user_roles ur')
    expect(MIGRATION).toContain("ur.role = any(array['it_admin', 'super_admin', 'hr_officer'])")
  })

  it('يحافظ على حماية الذات والتدقيق والسياسة (منع إعادة الظهور)', () => {
    expect(MIGRATION).toContain('SELF_MODIFY_FORBIDDEN')
    expect(MIGRATION).toContain("granted_by")
    expect(MIGRATION).toContain('audit_logs')
    expect(MIGRATION).toContain('department_manager')
    expect(MIGRATION).toContain("grant execute on function public.set_user_role(uuid,text,boolean) to authenticated")
    expect(MIGRATION).toContain("grant execute on function public.set_user_role(uuid,text,boolean,uuid) to service_role")
  })
})

describe('admin-users يتعامل مع service_role (رفع الأدوار)', () => {
  it('يمرر p_actor: callerId في استدعاء set_user_role', () => {
    expect(SERVER).toContain('p_actor: callerId')
  })
})

describe('حواجز الخادم في admin-users (إنشاء المستخدمين)', () => {
  it('منح الإدارة العليا حصراً بالمدير المفوض — قبل أي إنشاء', () => {
    expect(SERVER).toContain("['it_admin', 'super_admin'].includes(role)")
    expect(SERVER).toContain("callerRoles.includes('super_admin')")
    expect(SERVER).toContain("error: 'FORBIDDEN_ROLE'")
  })

  it('سياسة كلمة المرور الكاملة (حرف + رقم) على الخادم — لا الطول فقط', () => {
    expect(SERVER).toContain('[A-Za-z\\u0600-\\u06FF]')
    expect(SERVER).toContain('!/[0-9]/.test(password)')
  })

  it('تحقق مسؤول القسم (الشفت والقواطع) يسبق إنشاء حساب auth — لا حالة جزئية', () => {
    const preValidate = SERVER.indexOf('MANAGER_SHIFT_REQUIRED')
    const authCreate = SERVER.indexOf('admin.auth.admin.createUser')
    expect(preValidate).toBeGreaterThan(-1)
    expect(authCreate).toBeGreaterThan(-1)
    expect(preValidate).toBeLessThan(authCreate)
  })

  it('تراجع نظيف deleteUser في كل حالات الفشل بعد الإنشاء (الدور + الموظف + ملف المسؤول)', () => {
    expect((SERVER.match(/admin\.auth\.admin\.deleteUser\(userId\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('فحص تكرار الرقم الوظيفي قبل إنشاء الحساب', () => {
    expect(SERVER.indexOf('EMPLOYEE_NUMBER_TAKEN')).toBeLessThan(SERVER.indexOf('admin.auth.admin.createUser'))
  })
})
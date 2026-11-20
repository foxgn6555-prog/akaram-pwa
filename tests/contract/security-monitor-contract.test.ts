/**
 * الجولة ٤ — عقد لوحة المراقبة:
 *  · الواجهة تقرأ من الدوال المحروسة فقط (security_events_list · session_policy_list · session_policy_set).
 *  · الفرض معطّل افتراضياً: الواجهة تعرض الحالة كما هي ولا تفترض فرضاً.
 *  · اللوحة مركّبة داخل صفحة صلاحيات بوابة IT.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const SDK = readFileSync('src/services/security.sdk.ts', 'utf8')
const MONITOR = readFileSync('src/portals/it/pages/Permissions/SecurityMonitor.tsx', 'utf8')
const PAGE = readFileSync('src/portals/it/pages/Permissions/PermissionTemplates.tsx', 'utf8')
const MIG1 = readFileSync('supabase/migrations/20261120120000_session_security_core.sql', 'utf8')

describe('🛡️ عقد لوحة المراقبة (الجولة ٤)', () => {
  it('الواجهة تستخدم الدوال المحروسة فقط', () => {
    expect(SDK).toContain("supabase.rpc('security_events_list'")
    expect(SDK).toContain("supabase.rpc('session_policy_list'")
    expect(SDK).toContain("supabase.rpc('session_policy_set'")
    // لا قراءة مباشرة لجداول الأمان من العميل
    expect(SDK).not.toContain("from('security_events')")
    expect(SDK).not.toContain("from('account_session_policy')")
  })

  it('الحراسة في الخادم وليست في الواجهة', () => {
    expect(MIG1).toContain("perform app.require_it_admin('view')")
    expect(MIG1).toContain("perform app.require_it_admin('edit')")
    // لا شرط دور في الواجهة: الحجب يأتي من الخادم (PERMISSION_DENIED)
    expect(MONITOR).not.toContain('hasRole(')
  })

  it('اللوحة تعرض السجل والحدود وتُركَّب في صفحة الصلاحيات', () => {
    expect(MONITOR).toContain('security-events-list')
    expect(MONITOR).toContain('policy-list')
    expect(MONITOR).toContain('policy-enforce-')
    expect(PAGE).toContain('SecurityMonitor')
  })

  it('الافتراضي بلا فرض — توضيح صريح في الواجهة', () => {
    expect(MONITOR).toContain('افتراضياً لا فرض على أي حساب')
  })
})

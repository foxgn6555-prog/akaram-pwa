/**
 * الجولة ٧ — عقد اللوحة الأمنية الموحّدة:
 *  · الدمج في الخادم لا في الواجهة · الحراسة بدور تقنية المعلومات · لا جدول موازٍ
 *  · التصفية (حساب/مدة/مصدر) والحد الأقصى مفروضة في SQL
 *  · الواجهة تقرأ عبر RPC فقط ولا تلمس الجداول الأمنية
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8')
const MIG = read('supabase/migrations/20261120190000_security_timeline.sql')
const flat = MIG.replace(/\s+/g, ' ')

describe('اللوحة الأمنية — عقد الخادم', () => {
  it('دالتان فقط، محروستان بـ it_admin، ولا جدول جديد', () => {
    expect(flat).toContain('create or replace function public.it_security_timeline(')
    expect(flat).toContain('create or replace function public.it_security_overview(')
    expect(MIG.match(/perform app\.require_it_admin\('view'\)/g)?.length ?? 0).toBe(2)
    expect(MIG).not.toMatch(/create table/i)
    expect(flat).toContain('revoke all on function public.it_security_timeline(uuid, int, text, int) from public, anon;')
    expect(flat).toContain('revoke all on function public.it_security_overview(int) from public, anon;')
  })

  it('يجمع المصادر الثلاثة الأصلية بلا نسخ بيانات', () => {
    expect(MIG).toContain('from public.security_events se')
    expect(MIG).toContain('from public.permission_audit pa')
    expect(MIG).toContain('from public.role_grant_requests r')
    expect(MIG.match(/union all/g)?.length ?? 0).toBe(2)
    expect(MIG).toContain('order by t.occurred_at desc')
  })

  it('التصفية والحدود مفروضة في الخادم', () => {
    expect(MIG).toContain("p_source not in ('session', 'permissions', 'roles')")
    expect(MIG).toContain('make_interval(days => v_days)')
    expect(flat).toContain('least(greatest(coalesce(p_days, 7), 1), 365)')
    expect(flat).toContain('least(greatest(coalesce(p_limit, 300), 1), 500)')
    expect(MIG).toContain('and (p_user is null or se.user_id = p_user)')
    expect(MIG).toContain('and (p_user is null or pa.target_user = p_user)')
    expect(MIG).toContain('and (p_user is null or r.target_user = p_user)')
  })

  it('كل سطر يحمل مصدره وحالته وتسمية عربية', () => {
    expect(MIG).toContain("'session'::text")
    expect(MIG).toContain("'permissions'::text")
    expect(MIG).toContain("(case when r.is_grant then 'role_grant' else 'role_revoke' end)")
    expect(MIG).toContain("app.approval_role_label(r.role)")
  })
})

describe('اللوحة الأمنية — عقد الواجهة', () => {
  it('مركّبة في صفحة الصلاحيات فوق سجل الجولات السابقة', () => {
    const page = read('src/portals/it/pages/Permissions/PermissionTemplates.tsx')
    expect(page).toContain('<UnifiedSecurityDashboard />')
    expect(page.indexOf('<UnifiedSecurityDashboard />')).toBeLessThan(page.indexOf('<SecurityMonitor />'))
  })

  it('العميل يقرأ RPC فقط — لا استعلام مباشر على الجداول الأمنية', () => {
    const sdk = read('src/services/security.sdk.ts')
    expect(sdk).toContain("'it_security_timeline'")
    expect(sdk).toContain("'it_security_overview'")
    const ui = read('src/portals/it/pages/Permissions/UnifiedSecurityDashboard.tsx')
    for (const table of ['security_events', 'permission_audit', 'role_grant_requests']) {
      expect(ui).not.toContain(table)
      expect(sdk).not.toContain(`from('${table}')`)
    }
  })
})

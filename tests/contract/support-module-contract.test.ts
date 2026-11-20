/**
 * الجولة ٥ — عقد وحدة الدعم الفني:
 *  · الحراسة في الخادم لا في الواجهة: RLS مطفأة الظهور للمستخدمين + revoke + فحص دور داخل الدوال
 *  · المرفقات محصورة في مجلد صاحبها وبحد أقصى ٣
 *  · الزر متاح من كل البوابات، وصندوق IT في صفحة الدعم بتقنية المعلومات
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8')
const MIGRATION = read('supabase/migrations/20261120170000_support_tickets.sql')

describe('الدعم الفني — عقد الخادم', () => {
  it('الجدول محروس: RLS مُفعّل مع سحب كل صلاحيات anon/authenticated', () => {
    expect(MIGRATION).toContain('alter table public.support_tickets enable row level security')
    expect(MIGRATION.replace(/\s+/g, ' ')).toContain(
      'revoke all on table public.support_tickets from anon, authenticated',
    )
  })

  it('كل دالة عامة تُثبّت search_path وتتحقق من الدور داخل الخادم', () => {
    const fns = MIGRATION.match(/create or replace function public\.[a-z_]+\s*\(/g) ?? []
    expect(fns.length).toBeGreaterThanOrEqual(4)
    expect(MIGRATION.match(/set search_path = public, app/g)?.length ?? 0).toBeGreaterThanOrEqual(fns.length)
    expect(MIGRATION).toContain('app.require_it_admin')
  })

  it('حد المرفقات ٣ وأنها في مجلد صاحبها فقط', () => {
    expect(MIGRATION).toContain('array_length(p_attachments, 1), 0) > 3')
    expect(MIGRATION).toContain("if split_part(v_path, '/', 1) <> v_me::text then")
  })

  it('حراسة precheck تمنع التطبيق بلا الدوال المعتمدة', () => {
    expect(MIGRATION).toContain('app.hr_notify')
    expect(MIGRATION).toContain('app.require_it_admin')
    expect(MIGRATION).toMatch(/raise exception/)
  })
})

describe('الدعم الفني — عقد الواجهة', () => {
  it('زر الدعم مركّب في إطار التطبيق (كل البوابات) ويُحمّل النافذة عند الطلب فقط', () => {
    const shell = read('src/components/layout/AppShell.tsx')
    expect(shell).toContain('<SupportFab portal={portal} />')
    const fab = read('src/components/layout/SupportFab.tsx')
    expect(fab).toContain('{open && <SupportDialog')
  })

  it('صندوق تذاكر البوابات داخل وحدة الدعم في بوابة تقنية المعلومات', () => {
    const page = read('src/portals/it/pages/Support/LoginSupportPage.tsx')
    expect(page).toContain("import { PortalTicketsPanel } from './PortalTicketsPanel'")
    expect(page).toContain("{tab === 'tickets' && <PortalTicketsPanel />}")
  })

  it('الصور تُرفع في مجلد المستخدم الحالي فقط', () => {
    const sdk = read('src/services/support.sdk.ts')
    expect(sdk).toContain('`${userId}/${crypto.randomUUID()}.${ext}`')
    expect(sdk).toContain("SUPPORT_BUCKET = 'support-attachments'")
    expect(sdk).toContain('.from(SUPPORT_BUCKET)')
  })
})

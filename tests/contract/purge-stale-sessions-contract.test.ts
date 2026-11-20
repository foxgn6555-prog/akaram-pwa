/**
 * الجولة ٣-د — عقد تنظيف الجلسات الميتة:
 *  · الدالة في مخطط app، محجوبة عن anon/authenticated، ومتاحة لـ service_role فقط.
 *  · لا تحذف أحدث جلسة لكل مستخدم (حتى لا يُفقد أحد جلسته الوحيدة).
 *  · لا تُنشئ جداول ولا تمسّ ما عدا auth.sessions.
 *  · حارس إبطال الجلسة (٣-ج) ما زال مشغَّلاً في AppShell، وتقصير عمر الرمز موثَّق.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const SQL = readFileSync('supabase/migrations/20261120235000_purge_stale_sessions.sql', 'utf8')
const SHELL = readFileSync('src/components/layout/AppShell.tsx', 'utf8')
const WATCH = readFileSync('src/features/auth/hooks/useRevokedSessionWatch.ts', 'utf8')
const CRON = readFileSync('supabase/migrations/20261121003000_purge_sessions_cron.sql', 'utf8')

describe('🧹 تنظيف الجلسات الميتة (الجولة ٣-د)', () => {
  it('الدالة في مخطط app وتعمل على auth.sessions وحدها', () => {
    expect(SQL).toContain('function app.purge_stale_sessions')
    expect(SQL).toContain('from auth.sessions')
    expect(SQL).not.toMatch(/create table/i)
    expect(SQL).not.toMatch(/delete from public\./i)
  })

  it('محجوبة عن anon وauthenticated ومتاحة لـ service_role فقط', () => {
    expect(SQL).toContain('revoke all on function app.purge_stale_sessions(int) from public, anon, authenticated')
    expect(SQL).toContain('grant execute on function app.purge_stale_sessions(int) to service_role')
  })

  it('تُبقي أحدث جلسة لكل مستخدم دائماً', () => {
    expect(SQL).toContain('row_number() over')
    expect(SQL).toContain('r.rn > 1')
  })

  it('الجدولة اليومية محروسة بغياب pg_cron (لا تُفشل الترحيلات محلياً)', () => {
    expect(CRON).toContain("extname = 'pg_cron'")
    expect(CRON).toContain('purge_stale_sessions')
    expect(CRON).toContain('03') // 03:00 UTC
  })

  it('حارس الإبطال ما زال مشغَّلاً في الإطار، وجلسة الرمز تُقرأ من الـclaim', () => {
    expect(SHELL).toContain('useRevokedSessionWatch(userId)')
    expect(WATCH).toContain('sessionIdFromToken')
    expect(WATCH).toContain('signOut')
  })
})

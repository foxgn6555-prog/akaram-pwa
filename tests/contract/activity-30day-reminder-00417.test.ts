/**
 * 00417 — تذكير كل 30 يومًا (بديل MFA).
 * (أ) تذكير للمستخدم الخامد + (ب) تقرير دوري للمدير التقني، تُنشئهما دالة
 * app.activity_monthly_report() وتُخطّطها مهمة pg_cron شهريًا.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const raw = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261115130000_activity_30day_reminder.sql'),
  'utf8',
)
const sql = raw.replace(/--[^\n]*/g, '').toLowerCase()

describe('00417 — تذكير كل 30 يومًا', () => {
  it('الدالة SECURITY DEFINER (تعمل بامتياز المالك لقراءة auth.users)', () => {
    expect(sql).toMatch(/create or replace function app\.activity_monthly_report\(\)/)
    expect(sql).toMatch(/security definer/)
  })

  it('(أ) تُنشئ تذكيرًا لكل مستخدم خامد (idle)', () => {
    expect(sql).toMatch(/insert into public\.notifications/)
    expect(sql).toMatch(/from auth\.users u/)
    expect(sql).toMatch(/last_sign_in_at < v_cutoff/)
    expect(sql).toMatch(/'security'/)
    expect(sql).toMatch(/activity_reminder/)
  })

  it('(ب) تُنشئ تقريرًا للمدير التقني (super_admin) بعدد الخامل ومنح الصلاحيات', () => {
    expect(sql).toMatch(/from public\.user_roles ur\s+where ur\.role = 'super_admin'/)
    expect(sql).toMatch(/user_roles ur where ur\.created_at >= v_cutoff/)
    expect(sql).toMatch(/activity_report/)
  })

  it('مضاد التكرار: on conflict (user_id, dedupe_key) do nothing', () => {
    expect(sql).toMatch(/on conflict \(user_id, dedupe_key\) where dedupe_key is not null do nothing/)
    expect(sql).toMatch(/dedupe_key/)
  })

  it('يُخطط مهمة pg_cron شهريًا (كل 30 يومًا تقريبًا)', () => {
    expect(sql).toMatch(/cron\.schedule\(/)
    expect(sql).toMatch(/activity_monthly_reminder/)
    expect(sql).toMatch(/0 3 1 [*] [*]/)
    expect(sql).toMatch(/select app\.activity_monthly_report\(\)/)
  })

  it('يمنع تكرار job عند إعادة تطبيق الهجرة (unschedule إذا وُجد)', () => {
    expect(sql).toMatch(/cron\.unschedule\(/)
    expect(sql).toMatch(/exists \(select 1 from cron\.job where jobname = 'activity_monthly_reminder'\)/)
  })

  it('يمنح execute للأدوار التي تُنفّذها (service_role/postgres)', () => {
    expect(sql).toMatch(/grant execute on function app\.activity_monthly_report\(\) to service_role/)
    expect(sql).toMatch(/grant execute on function app\.activity_monthly_report\(\) to postgres/)
  })

  it('لا يغيّر سياسة RLS ولا بيانات المستخدمين — إشعارات فقط', () => {
    expect(sql).not.toMatch(/create policy|alter policy|drop policy/)
    expect(sql).not.toMatch(/grant execute on function app\.activity_monthly_report\(\) to anon/)
    // لا منح execute لـauthenticated من هذه الدالة (لا تُستدعى من الواجهة)
    expect(sql).not.toMatch(/grant execute on function app\.activity_monthly_report\(\) to authenticated/)
  })
})

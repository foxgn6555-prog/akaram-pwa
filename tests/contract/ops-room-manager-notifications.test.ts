/**
 * 00404 — عقد إشعارات «مدير غرفة العمليات» (الجولة 31).
 *
 * العيب الذي منعه هذا الاختبار من العودة:
 *   app.approval_link_for() لم تعرف الدور ops_room_manager فكانت تُرجع '/'
 *   وقيد notifications_link_internal يرفض '/' فيُسقَط الإشعار كاملًا بصمت
 *   داخل app.hr_notify (exception when others then null).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MIGRATION = join(ROOT, 'supabase/migrations/20261111150000_ops_room_manager_notifications.sql')
const sql = readFileSync(MIGRATION, 'utf8')

describe('🔔 إشعارات مدير غرفة العمليات (00404)', () => {
  it('وجهة الإشعار تشير إلى صفحة الموافقات داخل البوابة', () => {
    expect(sql).toContain("role='ops_room_manager'")
    expect(sql).toContain("'/ops-room-manager/approvals'")
  })

  it('الرابط غير الصالح يُخزَّن NULL بدل إسقاط الإشعار', () => {
    // نفس قيد الجدول notifications_link_internal
    expect(sql).toContain("!~ '^/[a-zA-Z0-9/_?=&.-]+$'")
    expect(sql).toContain('p_link := null')
  })

  it('لا يمسّ الصلاحيات: لا تعديل على current_role أو has_role', () => {
    expect(sql).not.toMatch(/function app\.("?current_role"?|has_role)/)
    expect(sql).not.toMatch(/insert into public\.user_roles|delete from public\.user_roles/)
    expect(sql).not.toMatch(/update public\.user_roles/)
  })

  it('يبقي سلوك الإشعارات كما هو: نفس الجدول ونفس منع التكرار', () => {
    expect(sql).toContain('insert into public.notifications')
    expect(sql).toContain('on conflict (user_id,dedupe_key)')
  })
})

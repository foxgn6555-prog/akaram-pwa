/**
 * الجولة ٣ — عقد الجلسات والأجهزة:
 *  · الدوال الأربع موجودة، ودوال الخدمة محجوبة عن authenticated.
 *  · staff-login يفحص الحد قبل إرجاع الجلسة، ويُبطل الجلسة الجديدة عند التجاوز.
 *  · الواجهة تعرض خيار الانتقال وتدير الأجهزة.
 *  · لا سجل جلسات موازٍ: المصدر auth.sessions.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const SQL = readFileSync('supabase/migrations/20261120150000_session_devices.sql', 'utf8')
const EDGE = readFileSync('supabase/functions/staff-login/index.ts', 'utf8')
const LOGIN = readFileSync('src/portals/public/pages/Login/LoginPage.tsx', 'utf8')
const DIALOG = readFileSync('src/components/layout/Header/MyDevicesDialog.tsx', 'utf8')
const SDK = readFileSync('src/services/sessions.sdk.ts', 'utf8')

describe('🔐 عقد الجلسات والأجهزة (الجولة ٣)', () => {
  it('الدوال موجودة والمصدر هو auth.sessions', () => {
    for (const fn of ['my_sessions', 'session_end', 'session_end_others', 'session_gate_check', 'session_switch_apply', 'session_revoke_new']) {
      expect(SQL).toContain(`function public.${fn}`)
    }
    expect(SQL).toContain('from auth.sessions')
    expect(SQL).not.toMatch(/create table .*session/i)
  })

  it('دوال خدمة الحافة محجوبة عن authenticated وممنوحة لـ service_role', () => {
    for (const fn of ['session_gate_check(uuid, uuid)', 'session_switch_apply(uuid, uuid)', 'session_revoke_new(uuid, uuid)']) {
      expect(SQL).toContain(`revoke all on function public.${fn} from public, anon, authenticated`)
      expect(SQL).toContain(`grant execute on function public.${fn} to service_role`)
    }
  })

  it('إنهاء الجلسة مقيّد بصاحبها: لا حذف لجلسة مستخدم آخر', () => {
    expect(SQL).toContain('where s.user_id = p_user')
    expect(SQL).toContain("raise exception 'SESSION_NOT_FOUND'")
  })

  it('staff-login: بوابة الحد قبل إرجاع الجلسة + إبطال الجلسة الجديدة + دعم الانتقال', () => {
    const gateIdx = EDGE.indexOf('session_gate_check')
    const returnIdx = EDGE.indexOf('return json(req, { session: data.session })')
    expect(gateIdx).toBeGreaterThan(0)
    expect(returnIdx).toBeGreaterThan(gateIdx)
    expect(EDGE).toContain('SESSION_LIMIT_REACHED')
    expect(EDGE).toContain('session_revoke_new')
    expect(EDGE).toContain('session_switch_apply')
    expect(EDGE).toContain("p_event: 'switch_approved'")
    expect(EDGE).toContain("p_event: 'limit_exceeded'")
  })

  it('الواجهة: زر الانتقال في صفحة الدخول + شاشة الأجهزة', () => {
    expect(LOGIN).toContain('SESSION_LIMIT_REACHED')
    expect(LOGIN).toContain('session-switch')
    expect(DIALOG).toContain('useMySessions')
    expect(DIALOG).toContain('end-other-sessions')
    expect(SDK).toContain("supabase.rpc('my_sessions'")
    expect(SDK).toContain("supabase.rpc('session_end'")
  })
})

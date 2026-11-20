/**
 * الجولة ٣-ب — عقد رمز موافقة الجهاز للحسابات الحساسة:
 *  · الرمز يُخزَّن مجزَّأً، التحقق لخدمة الدخول فقط، والجدول غير مقروء مباشرة.
 *  · staff-login يطلب الرمز للحساب الحسّاس ولا يسمح بالانتقال بكلمة المرور وحدها.
 *  · الواجهة: حقل الرمز في صفحة الدخول · إنشاء الرمز في «أجهزتي» · بطاقة جلسات الحساب في IT.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const SQL = readFileSync('supabase/migrations/20261120160000_sensitive_device_code.sql', 'utf8')
const EDGE = readFileSync('supabase/functions/staff-login/index.ts', 'utf8')
const LOGIN = readFileSync('src/portals/public/pages/Login/LoginPage.tsx', 'utf8')
const DIALOG = readFileSync('src/components/layout/Header/MyDevicesDialog.tsx', 'utf8')
const DETAIL = readFileSync('src/portals/it/pages/UserManagement/UserDetail.tsx', 'utf8')

describe('🔑 عقد رمز موافقة الجهاز (الجولة ٣-ب)', () => {
  it('الرمز مجزَّأ ولا يُخزَّن صريحاً', () => {
    expect(SQL).toContain('code_hash')
    expect(SQL).toContain("encode(sha256(convert_to(v_code, 'UTF8')), 'hex')")
    expect(SQL).toContain("encode(sha256(convert_to(btrim(p_code), 'UTF8')), 'hex')")
    expect(SQL).not.toMatch(/\bcode\s+text not null/)
  })

  it('التحقق وفحص الحساسية لخدمة الدخول فقط', () => {
    for (const sig of ['device_switch_code_verify(uuid, text, uuid)', 'session_is_sensitive(uuid)']) {
      expect(SQL).toContain(`revoke all on function public.${sig} from public, anon, authenticated`)
      expect(SQL).toContain(`grant execute on function public.${sig} to service_role`)
    }
    expect(SQL).toContain('revoke all on table public.device_switch_codes from anon, authenticated')
  })

  it('صلاحية 10 دقائق ومحاولات محدودة واستهلاك واحد', () => {
    expect(SQL).toContain("interval '10 minutes'")
    expect(SQL).toContain('attempts >= 5')
    expect(SQL).toContain('used_at = now(), used_session = p_session')
  })

  it('staff-login لا يسمح بالانتقال للحساب الحسّاس بلا رمز', () => {
    const sensitiveIdx = EDGE.indexOf('session_is_sensitive')
    const switchIdx = EDGE.indexOf('session_switch_apply')
    expect(sensitiveIdx).toBeGreaterThan(0)
    expect(switchIdx).toBeGreaterThan(sensitiveIdx)
    expect(EDGE).toContain('device_switch_code_verify')
    expect(EDGE).toContain('DEVICE_CODE_REQUIRED')
    expect(EDGE).toContain('requires_code: sensitive')
    expect(EDGE).toContain("p_event: 'switch_denied'")
  })

  it('تقنية المعلومات تستطيع إنهاء جلسة أي حساب', () => {
    expect(SQL).toContain('function public.admin_session_end(uuid, uuid)')
    expect(SQL).toContain('perform app.require_it_admin')
    expect(DETAIL).toContain('UserSessionsCard')
  })

  it('الواجهة: حقل الرمز + إنشاء الرمز', () => {
    expect(LOGIN).toContain('device-code')
    expect(LOGIN).toContain('requiresCode')
    expect(DIALOG).toContain('create-device-code')
    expect(DIALOG).toContain('device-code-value')
  })
})

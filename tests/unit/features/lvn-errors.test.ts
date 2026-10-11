import { describe, expect, it } from 'vitest'
import { explainLvnError, lvnErrorToast } from '@features/gps-lvn/lvn-errors'

describe('00210 — قاموس أخطاء LVN', () => {
  it('كل رمز معروف له عنوان وسبب وإجراء عربي وتصنيف', () => {
    for (const c of ['LVN_LOGIN_REJECTED', 'LVN_UNAUTHORIZED', 'LVN_CONFIG_MISSING', 'LVN_PROVIDER_NOT_CONFIGURED', 'LVN_FULL_SYNC_REQUIRED', 'LVN_SYNC_ALREADY_RUNNING']) {
      const e = explainLvnError(c)
      expect(e.kind).not.toBe('unknown'); expect(e.title.length).toBeGreaterThan(5); expect(e.action.length).toBeGreaterThan(5)
    }
    expect(explainLvnError('LVN_LOGIN_REJECTED').kind).toBe('credentials')
    expect(explainLvnError('LVN_CONFIG_MISSING').kind).toBe('config')
  })
  it('الرموز المركّبة والمسبوقة تُصنَّف (HTTP/DB) ويُحتفظ بالرمز الكامل', () => {
    expect(explainLvnError('LVN_LOGIN_HTTP_503')).toMatchObject({ kind: 'provider', code: 'LVN_LOGIN_HTTP_503' })
    expect(explainLvnError('LVN_APPLY_FAILED:23505')).toMatchObject({ kind: 'db', code: 'LVN_APPLY_FAILED:23505' })
    expect(explainLvnError('Edge Function returned a non-2xx status code').kind).toBe('unknown')
    expect(explainLvnError(null).code).toBe('—')
  })
  it('رسالة التنبيه سطر واحد يحوي العنوان والرمز والإجراء', () => {
    const m = lvnErrorToast('LVN_LOGIN_REJECTED')
    expect(m).toContain('شركة GPS رفضت بيانات الدخول'); expect(m).toContain('(LVN_LOGIN_REJECTED)'); expect(m).toContain('اختبار الاتصال')
  })
})

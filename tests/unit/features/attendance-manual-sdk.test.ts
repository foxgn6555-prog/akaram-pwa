/**
 * الحضور اليدوي البديل — طبقة SDK: ربط معاملات الدوال، رسائل الأخطاء العربية (بما فيها رقم الأيام المعلّقة)،
 * وعقد «كل رمز ATT_MANUAL_* يرفعه الترحيل له رسالة عربية».
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@sdk/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data },
}))

import {
  ATTENDANCE_MANUAL_ERROR_MESSAGES, MANUAL_RECORDERS_LIMIT, MANUAL_SHEET_REASON_PREFIX, attendanceManual, attendanceManualErrorMessage,
  fmtManualDate, fmtManualDay, fmtManualTime, isManualSheetReason,
} from '@sdk/attendance-manual.sdk'
import { HR_ERROR_MESSAGES, hrErrorMessage, lookupErrorMessage } from '@sdk/hr.sdk'

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { ok: true }, error: null }) })

describe('رسائل الأخطاء العربية', () => {
  it('رمز الوحدة ⇒ رسالته، ورمز HR العام ⇒ رسالة HR، والمجهول ⇒ النص كما هو', () => {
    expect(attendanceManualErrorMessage(new Error('ATT_MANUAL_DUPLICATE_ACTIVE'))).toBe(ATTENDANCE_MANUAL_ERROR_MESSAGES.ATT_MANUAL_DUPLICATE_ACTIVE)
    expect(attendanceManualErrorMessage(new Error('ATT_MANUAL_RECORDER_PORTAL_ROLE_REQUIRED'))).toContain('دور')
    expect(attendanceManualErrorMessage(new Error('ATT_MANUAL_RECORDERS_TOO_MANY'))).toContain('5')
    expect(attendanceManualErrorMessage(new Error('boom HR_MONTH_LOCKED x'))).toBe(HR_ERROR_MESSAGES.HR_MONTH_LOCKED)
    expect(attendanceManualErrorMessage(new Error('شيء غير معروف'))).toBe('شيء غير معروف')
    expect(attendanceManualErrorMessage('')).toBe('خطأ غير معروف')
    expect(attendanceManualErrorMessage({ code: 'x' })).toContain('"code":"x"')
  })

  it('ATT_MANUAL_SHEETS_PENDING: رسالة عربية واضحة بعدد الأيام في مسار اعتماد الشهر (hrErrorMessage) وفي رسائل الوحدة', () => {
    const e = new Error('ATT_MANUAL_SHEETS_PENDING: 12')
    for (const msg of [hrErrorMessage(e), attendanceManualErrorMessage(e)]) {
      expect(msg).toContain('12')
      expect(msg).toContain('لا يمكن اعتماد حضورية الشهر')
      expect(msg).toContain('بانتظار كشف الحضور اليدوي')
      expect(msg).not.toContain('{n}')
      expect(msg).not.toContain('ATT_MANUAL')
    }
    // بلا رقم: لا تبقى العلامة الخام
    expect(hrErrorMessage(new Error('ATT_MANUAL_SHEETS_PENDING'))).not.toContain('{n}')
  })

  it('lookupErrorMessage: يطابق أول رمز، ويستبدل {n} بالرقم الذي يلي «الرمز: »، وإلا null', () => {
    const table = { A_CODE: 'عدد {n} يوم', B_CODE: 'ثابتة' }
    expect(lookupErrorMessage('x A_CODE: 7 y', table)).toBe('عدد 7 يوم')
    expect(lookupErrorMessage('A_CODE بلا رقم', table)).toBe('عدد — يوم')
    expect(lookupErrorMessage('B_CODE', table)).toBe('ثابتة')
    expect(lookupErrorMessage('لا شيء', table)).toBeNull()
  })

  it('لا رمز في جدول الرسائل جزءٌ من رمز آخر (البحث بالاحتواء لا يلتقط الرمز الخطأ)', () => {
    const keys = Object.keys({ ...HR_ERROR_MESSAGES, ...ATTENDANCE_MANUAL_ERROR_MESSAGES })
    const clashes = keys.flatMap((a) => keys.filter((b) => a !== b && b.includes(a)).map((b) => `${a} ⊂ ${b}`))
    expect(clashes).toEqual([])
  })

  it('عقد: كل رمز ATT_MANUAL_* يرفعه الترحيل لمستخدم الواجهة له رسالة عربية (عدا فحوص النشر PRECHECK/PATCH_GUARD)', () => {
    const sql = [
      'supabase/migrations/20261118130000_attendance_manual_mode.sql',
      'supabase/migrations/20261118150000_attendance_manual_authorized_recorders.sql',
    ].map((path) => readFileSync(join(process.cwd(), path), 'utf8')).join('\n')
    const codes = [...new Set([
      ...[...sql.matchAll(/raise exception '(ATT_MANUAL_[A-Z_]+)/g)].map((m) => m[1]!),
      ...(sql.includes('ATT_MANUAL_SHIFT_REQUIRED') ? ['ATT_MANUAL_SHIFT_REQUIRED'] : []),
    ])].filter((c) => !['ATT_MANUAL_PRECHECK', 'ATT_MANUAL_PATCH_GUARD', 'ATT_MANUAL_PATCH'].includes(c))
    expect(codes.length).toBeGreaterThan(15)
    const known = { ...HR_ERROR_MESSAGES, ...ATTENDANCE_MANUAL_ERROR_MESSAGES }
    const missing = codes.filter((c) => !known[c])
    expect(missing, `رموز بلا رسالة عربية: ${missing.join(', ')}`).toEqual([])
    for (const c of codes) expect(known[c]).toMatch(/[\u0600-\u06FF]/)
  })
})

describe('ربط معاملات الدوال', () => {
  it('activate: يُقصّ السبب ويحوّل الفارغ إلى null ويرسل حسابات التسجيل المحددة', async () => {
    expect(MANUAL_RECORDERS_LIMIT).toBe(5)
    await attendanceManual.activate({ portal: 'transfer-station', branchId: '', departmentId: 'd1', includeSub: true, reason: '  عطل الجهاز  ', startsOn: '', recorderUserIds: ['u1', 'u2'] })
    expect(rpc).toHaveBeenCalledWith('attendance_manual_activate', { p_portal: 'transfer-station', p_branch: null, p_department: 'd1', p_include_sub: true, p_reason: 'عطل الجهاز', p_starts_on: null, p_recorders: ['u1', 'u2'] })
    await attendanceManual.activate({ portal: 'hr', branchId: 'b1', departmentId: null, includeSub: false, reason: 'سبب', startsOn: '2026-11-10', recorderUserIds: [] })
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_activate', { p_portal: 'hr', p_branch: 'b1', p_department: null, p_include_sub: false, p_reason: 'سبب', p_starts_on: '2026-11-10', p_recorders: [] })
  })

  it('deactivate / list / recorders / setRecorders / myActivations / sheet / saveSheet / pendingSummary / monthCounts / portalOptions / scopePreview', async () => {
    await attendanceManual.deactivate('a1', '', ' أُصلح ')
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_deactivate', { p_activation: 'a1', p_last_day: null, p_note: 'أُصلح' })
    await attendanceManual.deactivate('a1', '2026-11-16', null)
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_deactivate', { p_activation: 'a1', p_last_day: '2026-11-16', p_note: null })
    await attendanceManual.list(true)
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_list', { p_only_active: true })
    await attendanceManual.recorders('a1')
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_recorders_get', { p_activation: 'a1' })
    await attendanceManual.setRecorders('a1', ['u1', 'u2'])
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_recorders_set', { p_activation: 'a1', p_user_ids: ['u1', 'u2'] })
    await attendanceManual.myActivations()
    expect(rpc).toHaveBeenLastCalledWith('manual_att_my_activations', {})
    await attendanceManual.sheet('a1', null)
    expect(rpc).toHaveBeenLastCalledWith('manual_att_sheet_get', { p_activation: 'a1', p_date: null })
    await attendanceManual.saveSheet('a1', '2026-11-17', [{ employee_id: 'e1', status: 'present' }], '   ')
    expect(rpc).toHaveBeenLastCalledWith('manual_att_sheet_save', { p_activation: 'a1', p_date: '2026-11-17', p_entries: [{ employee_id: 'e1', status: 'present' }], p_note: null })
    await attendanceManual.pendingSummary('2026-11-01')
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_pending_summary', { p_month: '2026-11-01' })
    await attendanceManual.monthCounts('2026-11-01')
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_month_counts', { p_month: '2026-11-01' })
    await attendanceManual.portalOptions()
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_portal_options', {})
    await attendanceManual.scopePreview({ branchId: null, departmentId: 'd1', includeSub: true })
    expect(rpc).toHaveBeenLastCalledWith('attendance_manual_scope_preview', { p_branch: null, p_department: 'd1', p_include_sub: true })
  })

  it('خطأ الخادم يُرمى كما هو (تعرضه الخطافات رسالةً عربية)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ATT_MANUAL_NOT_FOUND', code: 'P0001' } })
    await expect(attendanceManual.sheet('zz', null)).rejects.toMatchObject({ message: 'ATT_MANUAL_NOT_FOUND' })
  })

  it('أسماء الدوال المستدعاة موجودة فعلاً في الترحيل (لا خطأ إملائي بين الواجهة والقاعدة)', async () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261118130000_attendance_manual_mode.sql'), 'utf8')
    await Promise.all([
      attendanceManual.portalOptions(), attendanceManual.scopePreview({ branchId: 'b', departmentId: null, includeSub: true }),
      attendanceManual.activate({ portal: 'hr', branchId: 'b', departmentId: null, includeSub: true, reason: 'سبب', startsOn: null, recorderUserIds: [] }), attendanceManual.deactivate('a', null, null),
      attendanceManual.list(), attendanceManual.myActivations(), attendanceManual.sheet('a', null), attendanceManual.saveSheet('a', '2026-11-17', [], null),
      attendanceManual.pendingSummary('2026-11-01'), attendanceManual.monthCounts('2026-11-01'),
    ])
    const called = [...new Set(rpc.mock.calls.map((c) => c[0] as string))]
    expect(called.length).toBe(10)
    for (const fn of called) expect(sql, `الدالة ${fn} غير معرّفة في الترحيل`).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`))
  })
})

describe('مساعدات العرض', () => {
  it('isManualSheetReason يعرّف صفوف الكشف بالبادئة التي يكتبها الخادم', () => {
    expect(MANUAL_SHEET_REASON_PREFIX).toBe('كشف حضور يدوي')
    expect(isManualSheetReason('كشف حضور يدوي — المحطة التحويلية')).toBe(true)
    expect(isManualSheetReason('تصحيح بسبب خطأ')).toBe(false)
    expect(isManualSheetReason('تصحيح — كشف حضور يدوي')).toBe(false)   // البادئة في أول السبب فقط (يكتبها الخادم)، لا أي ذكر لها
    expect(isManualSheetReason('')).toBe(false)
    expect(isManualSheetReason(null)).toBe(false)
    expect(isManualSheetReason(undefined)).toBe(false)
  })

  it('التواريخ والأوقات: يوم بلا إزاحة منطقة، ووقت بغداد (+3)', () => {
    expect(fmtManualDate('2026-11-17')).toBe('17/11/2026')
    expect(fmtManualDate(null)).toBe('—')
    expect(fmtManualTime('2026-11-17T05:30:00Z')).toBe('08:30')
    expect(fmtManualTime(null)).toBe('—')
    expect(fmtManualDay('2026-11-17')).toMatch(/17/)
    expect(fmtManualDay(undefined)).toBe('—')
  })
})

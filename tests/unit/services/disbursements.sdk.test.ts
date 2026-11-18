/** SDK مسار الصرف: أسماء الدوال ووسائطها حرفياً، تطبيع الشهر والمرشّحات، ورسائل الأخطاء العربية (مع العدّادات) */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { rpc: m.rpc },
    async sdkGuard(op: PromiseLike<{ data: unknown; error: { message: string } | null }>) { const { data, error } = await op; if (error) throw new SDKError(error.message, 'X', error); return data },
  }
})
import {
  DISBURSEMENT_ERROR_MESSAGES, DISBURSEMENT_FLAG_LABEL, DISBURSEMENT_KIND_LABEL, DISBURSEMENT_STATUS_LABEL, DISBURSEMENT_STATUS_SHORT,
  disbursementErrorMessage, disbursements, monthStartOf,
} from '@sdk/disbursements.sdk'

describe('disbursements.sdk — الدوال', () => {
  beforeEach(() => { m.rpc.mockReset(); m.rpc.mockResolvedValue({ data: { ok: true }, error: null }) })

  it('monthStartOf يعيد أول الشهر من أي تاريخ', () => {
    expect(monthStartOf('2026-10-17')).toBe('2026-10-01'); expect(monthStartOf('2026-10')).toBe('2026-10-01'); expect(monthStartOf('2026-10-01T10:00:00Z')).toBe('2026-10-01')
  })
  it('list: كل المرشّحات بأسمائها، الشهر مطبَّع، البحث مشذَّب، والفارغ null، والحد الافتراضي 100', async () => {
    await disbursements.list()
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_list', { p_kind: null, p_status: null, p_month: null, p_search: null, p_limit: 100 })
    await disbursements.list({ kind: 'contractor_wages', status: 'approved', month: '2026-10', search: '  DSB-2026-0002  ', limit: 10 })
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_list', { p_kind: 'contractor_wages', p_status: 'approved', p_month: '2026-10-01', p_search: 'DSB-2026-0002', p_limit: 10 })
    await disbursements.list({ search: '   ' })
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_list', expect.objectContaining({ p_search: null }))
  })
  it('get/counts', async () => {
    await disbursements.get('d1'); expect(m.rpc).toHaveBeenLastCalledWith('disbursement_get', { p_id: 'd1' })
    await disbursements.counts(); expect(m.rpc).toHaveBeenLastCalledWith('disbursement_counts', {})
  })
  it('lines: الافتراضي (الكل) يرسل p_flag=null والترتيب number والصفحة 50/0؛ والمرشّحات تُمرَّر', async () => {
    await disbursements.lines('d1')
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_lines', { p_id: 'd1', p_group: null, p_sub_group: null, p_flag: null, p_search: null, p_sort: 'number', p_limit: 50, p_offset: 0 })
    await disbursements.lines('d1', { flag: 'all' })
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_lines', expect.objectContaining({ p_flag: null }))
    await disbursements.lines('d1', { group: 'الكرخ', subGroup: 'النقل', flag: 'deduction', search: ' أحمد ', sort: 'net_desc', limit: 40, offset: 80 })
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_lines', { p_id: 'd1', p_group: 'الكرخ', p_sub_group: 'النقل', p_flag: 'deduction', p_search: 'أحمد', p_sort: 'net_desc', p_limit: 40, p_offset: 80 })
  })
  it('decide/pay/resubmit: الملاحظة مشذَّبة والفارغة null', async () => {
    await disbursements.decide('d1', true)
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_decide', { p_id: 'd1', p_approve: true, p_note: null })
    await disbursements.decide('d1', false, '  راجعوا  ')
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_decide', { p_id: 'd1', p_approve: false, p_note: 'راجعوا' })
    await disbursements.pay('d1', '   ')
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_pay', { p_id: 'd1', p_note: null })
    await disbursements.pay('d1', 'دفعة')
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_pay', { p_id: 'd1', p_note: 'دفعة' })
    await disbursements.resubmit('d1')
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_resubmit', { p_id: 'd1', p_note: null })
    await disbursements.resubmit('d1', ' تم ')
    expect(m.rpc).toHaveBeenLastCalledWith('disbursement_resubmit', { p_id: 'd1', p_note: 'تم' })
  })
  it('أجور المتعهدين: الجاهزية والكشف المعدَّل وأيام المتعهد والإغلاق — الشهر دائماً أول يوم', async () => {
    await disbursements.contractorReadiness('2026-03-17')
    expect(m.rpc).toHaveBeenLastCalledWith('finance_contractor_wages_readiness', { p_month: '2026-03-01' })
    await disbursements.contractorWages('2026-03')
    expect(m.rpc).toHaveBeenLastCalledWith('finance_contractor_wages_adjusted', { p_month: '2026-03-01' })
    await disbursements.contractorWageDays('c1', '2026-03-05')
    expect(m.rpc).toHaveBeenLastCalledWith('finance_contractor_wage_days_adjusted', { p_contractor: 'c1', p_month: '2026-03-01' })
    await disbursements.contractorClose('2026-03-05', ' ملاحظة ')
    expect(m.rpc).toHaveBeenLastCalledWith('finance_contractor_wages_close', { p_month: '2026-03-01', p_note: 'ملاحظة' })
    await disbursements.contractorClose('2026-03')
    expect(m.rpc).toHaveBeenLastCalledWith('finance_contractor_wages_close', { p_month: '2026-03-01', p_note: null })
  })
  it('خطأ الخادم يُرمى كما هو (SDKError) ولا يُبتلع', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'TREASURY_INSUFFICIENT' } })
    await expect(disbursements.pay('d1')).rejects.toThrow('TREASURY_INSUFFICIENT')
  })
})

describe('disbursements.sdk — الأسماء والرسائل', () => {
  it('لكل نوع وحالة وشريحة تسمية عربية، والحالات القصيرة لا تكرر الطويلة المضللة', () => {
    expect(DISBURSEMENT_KIND_LABEL).toEqual({ employee_payroll: 'رواتب الموظفين', contractor_wages: 'أجور المتعهدين' })
    expect(Object.keys(DISBURSEMENT_STATUS_LABEL).sort()).toEqual(['approved', 'paid', 'pending_approval', 'rejected'])
    expect(Object.keys(DISBURSEMENT_STATUS_SHORT).sort()).toEqual(['approved', 'paid', 'pending_approval', 'rejected'])
    expect(DISBURSEMENT_STATUS_LABEL.approved).toContain('بانتظار الصرف'); expect(DISBURSEMENT_STATUS_SHORT.approved).toBe('معتمد')
    expect(Object.keys(DISBURSEMENT_FLAG_LABEL)).toEqual(['all', 'deduction', 'adjusted', 'advance', 'zero'])
  })
  it('كل رموز الأخطاء المتوقعة من الخادم لها رسالة عربية بلا أحرف لاتينية سوى الرمز نفسه', () => {
    for (const code of ['DISBURSEMENT_NOT_FOUND', 'DISBURSEMENT_NOT_PENDING', 'DISBURSEMENT_NOT_APPROVED', 'DISBURSEMENT_ALREADY_PAID', 'DISBURSEMENT_NOT_REJECTED', 'DISBURSEMENT_ACTIVE_EXISTS',
      'DISBURSEMENT_REASON_REQUIRED', 'DISBURSEMENT_RATES_FROZEN', 'CONTRACTOR_MONTH_HAS_DISBURSEMENT', 'CONTRACTOR_WAGES_MONTH_NOT_LOCKED', 'CONTRACTOR_WAGES_RATES_MISSING',
      'CONTRACTOR_WAGES_NO_FINGERPRINT', 'CONTRACTOR_WAGES_NO_DAYS', 'CONTRACTOR_WAGES_NOTHING_PAYABLE', 'HR_ATTENDANCE_NOT_CONFIRMED', 'TREASURY_INSUFFICIENT', 'PERMISSION_DENIED', 'DUPLICATE_SUBMIT']) {
      const msg = DISBURSEMENT_ERROR_MESSAGES[code]
      expect(msg, code).toBeTruthy(); expect(msg, code).toMatch(/[\u0600-\u06ff]/); expect(msg, code).not.toMatch(/[A-Za-z]{3,}/)
    }
  })
  it('disbursementErrorMessage: يطابق الرمز داخل نص أطول، ويُظهر العدّاد بعد النقطتين، ويعيد النص كما هو إن جهل الرمز', () => {
    expect(disbursementErrorMessage(new Error('boom: TREASURY_INSUFFICIENT at fn'))).toBe(DISBURSEMENT_ERROR_MESSAGES.TREASURY_INSUFFICIENT)
    expect(disbursementErrorMessage(new Error('CONTRACTOR_WAGES_RATES_MISSING:3'))).toBe(`${DISBURSEMENT_ERROR_MESSAGES.CONTRACTOR_WAGES_RATES_MISSING} (3)`)
    expect(disbursementErrorMessage(new Error('CONTRACTOR_WAGES_NO_FINGERPRINT:12'))).toBe(`${DISBURSEMENT_ERROR_MESSAGES.CONTRACTOR_WAGES_NO_FINGERPRINT} (12)`)
    expect(disbursementErrorMessage('DISBURSEMENT_NOT_PENDING')).toBe(DISBURSEMENT_ERROR_MESSAGES.DISBURSEMENT_NOT_PENDING)
    expect(disbursementErrorMessage(new Error('شيء آخر'))).toBe('شيء آخر')
    expect(disbursementErrorMessage(undefined)).toBe('خطأ غير معروف')
    expect(disbursementErrorMessage({ code: 'DISBURSEMENT_ALREADY_PAID' })).toBe(DISBURSEMENT_ERROR_MESSAGES.DISBURSEMENT_ALREADY_PAID)
  })
  it('رسالة الرصيد تقول صراحةً إنه لم يُخصم شيء', () => {
    expect(DISBURSEMENT_ERROR_MESSAGES.TREASURY_INSUFFICIENT).toContain('لم يُخصم أي مبلغ')
  })
})

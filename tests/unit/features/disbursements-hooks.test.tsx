/**
 * خطافات مسار الصرف:
 *  · نجاح أي حركة (قرار/صرف/إعادة إرسال/اعتماد وإرسال) يُبطل: الطلبات + القاصة + الإشعارات + أجور المتعهدين، ويُظهر إشعاراً بالنتيجة الحقيقية
 *  · أي فشل يُحدِّث الطلبات (ليرى المستخدم الواقع الحالي) ثم يشرح السبب بالعربية (مثلاً TREASURY_INSUFFICIENT: لم يُخصم شيء)
 *  · أسطر الطلب بصفحات متراكمة (40) تتوقف عند آخر سطر · طلب الشهر يُعيد أحدث نسخة
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  api: { list: vi.fn(), get: vi.fn(), lines: vi.fn(), decide: vi.fn(), pay: vi.fn(), resubmit: vi.fn(), contractorReadiness: vi.fn(), contractorWages: vi.fn(), contractorWageDays: vi.fn(), contractorClose: vi.fn() },
}))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }) }))
vi.mock('@sdk/disbursements.sdk', async (importOriginal) => ({ ...(await importOriginal() as object), disbursements: h.api }))
const cw = vi.hoisted(() => ({ setRates: vi.fn(), copyPreviousRates: vi.fn() }))
vi.mock('@sdk/contractors.sdk', async (importOriginal) => ({ ...(await importOriginal() as object), contractors: cw }))
const hrApi = vi.hoisted(() => ({ approvePayroll: vi.fn() }))
vi.mock('@sdk/hr.sdk', async (importOriginal) => { const m = await importOriginal() as { hr: object }; return { ...m, hr: { ...m.hr, approvePayroll: hrApi.approvePayroll } } })

import { useCopyPreviousRates, useSetContractorRates } from '@features/contractors/hooks'
import { useApprovePayroll } from '@features/hr/hooks/useHr'
import {
  LINES_PAGE, useContractorWageDaysAdjusted, useContractorWagesAdjusted, useContractorWagesClose, useContractorWagesReadiness, useDecideDisbursement, useDisbursementDetail,
  useDisbursementLines, useDisbursementList, useEmployeePayrollRequest, usePayDisbursement, useResubmitDisbursement,
} from '@features/disbursements/hooks'

const wrapperFor = (qc: QueryClient) => function Wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 1, staleTime: 0 } } })
const r = (o: Record<string, unknown> = {}) => ({ id: 'd1', request_no: 'DSB-2026-0001', status: 'approved', version: 1, net_total: 38450000, treasury_ref_no: null, ...o })

/** جذور مفاتيح تتأثر بأي حركة — كل جذر له استعلام مراقَب لنعرف هل أُعيد جلبه */
function probes(qc: QueryClient) {
  const fns = { disbursements: vi.fn(async () => 1), treasury: vi.fn(async () => 1), notifications: vi.fn(async () => 1), contractors: vi.fn(async () => 1), other: vi.fn(async () => 1) }
  const hook = renderHook(() => ({
    a: useQuery({ queryKey: ['disbursements', 'x'], queryFn: fns.disbursements }), b: useQuery({ queryKey: ['treasury', 'x'], queryFn: fns.treasury }),
    c: useQuery({ queryKey: ['notifications', 'x'], queryFn: fns.notifications }), d: useQuery({ queryKey: ['contractors', 'x'], queryFn: fns.contractors }),
    e: useQuery({ queryKey: ['unrelated', 'x'], queryFn: fns.other }),
    decide: useDecideDisbursement(), pay: usePayDisbursement(), resubmit: useResubmitDisbursement(), close: useContractorWagesClose(),
  }), { wrapper: wrapperFor(qc) })
  return { fns, hook }
}
const settled = async (hook: ReturnType<typeof probes>['hook']) => { await waitFor(() => expect([hook.result.current.a, hook.result.current.b, hook.result.current.c, hook.result.current.d, hook.result.current.e].every((q) => q.isSuccess)).toBe(true)) }

beforeEach(() => { vi.clearAllMocks() })

describe('حركات المسار — النجاح', () => {
  it.each([
    ['decide اعتماد', (x: ReturnType<typeof probes>['hook']['result']) => x.current.decide.mutate({ id: 'd1', approve: true }), () => h.api.decide.mockResolvedValue(r({ status: 'approved' })), 'اعتُمد الطلب DSB-2026-0001 وأُبلغت الشؤون المالية'],
    ['decide رفض', (x: ReturnType<typeof probes>['hook']['result']) => x.current.decide.mutate({ id: 'd1', approve: false, note: 'راجعوا' }), () => h.api.decide.mockResolvedValue(r({ status: 'rejected' })), 'رُفض الطلب DSB-2026-0001 وأُعيد للمالية بالسبب'],
    ['pay', (x: ReturnType<typeof probes>['hook']['result']) => x.current.pay.mutate({ id: 'd1' }), () => h.api.pay.mockResolvedValue(r({ status: 'paid', treasury_ref_no: 'TRX-2026-0042' })), 'تم الصرف: حركة القاصة TRX-2026-0042 وأُبلغ المدير المفوض'],
    ['resubmit', (x: ReturnType<typeof probes>['hook']['result']) => x.current.resubmit.mutate({ id: 'd1' }), () => h.api.resubmit.mockResolvedValue(r({ status: 'pending_approval', version: 2, request_no: 'DSB-2026-0009' })), 'أُعيد الإرسال: الطلب DSB-2026-0009 (النسخة 2) بانتظار قرار المدير المفوض'],
    ['اعتماد وإرسال', (x: ReturnType<typeof probes>['hook']['result']) => x.current.close.mutate({ month: '2026-03-01' }), () => h.api.contractorClose.mockResolvedValue(r({ status: 'pending_approval', request_no: 'DSB-2026-0010', net_total: 7800000 })), 'أُرسل الطلب DSB-2026-0010 إلى المدير المفوض (7,800,000 د.ع)'],
  ])('%s: يُبطل الطلبات والقاصة والإشعارات والمتعهدين فقط، ويُظهر إشعار النجاح بنتيجته', async (_n, run, arrange, msg) => {
    const qc = newClient(); const { fns, hook } = probes(qc)
    await settled(hook); arrange()
    await act(async () => { run(hook.result) })
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ type: 'success', message: msg }))
    await waitFor(() => expect([fns.disbursements, fns.treasury, fns.notifications, fns.contractors].map((f) => f.mock.calls.length)).toEqual([2, 2, 2, 2]))
    expect(fns.other).toHaveBeenCalledTimes(1) // ما لا علاقة له لا يُعاد جلبه
  })
  it('ملاحظة الاعتماد وسببه يصلان إلى الـSDK كما هما', async () => {
    const qc = newClient(); const { hook } = probes(qc); await settled(hook)
    h.api.decide.mockResolvedValue(r()); h.api.pay.mockResolvedValue(r({ status: 'paid' })); h.api.resubmit.mockResolvedValue(r()); h.api.contractorClose.mockResolvedValue(r())
    await act(async () => { hook.result.current.decide.mutate({ id: 'd1', approve: false, note: 'سبب' }) }); await waitFor(() => expect(h.api.decide).toHaveBeenCalledWith('d1', false, 'سبب'))
    await act(async () => { hook.result.current.pay.mutate({ id: 'd1', note: 'دفعة' }) }); await waitFor(() => expect(h.api.pay).toHaveBeenCalledWith('d1', 'دفعة'))
    await act(async () => { hook.result.current.resubmit.mutate({ id: 'd1', note: 'تم' }) }); await waitFor(() => expect(h.api.resubmit).toHaveBeenCalledWith('d1', 'تم'))
    await act(async () => { hook.result.current.close.mutate({ month: '2026-03-01', note: 'ملاحظة' }) }); await waitFor(() => expect(h.api.contractorClose).toHaveBeenCalledWith('2026-03-01', 'ملاحظة'))
  })
})

describe('حركات المسار — الفشل', () => {
  it('الصرف برصيد غير كافٍ: إشعار خطأ يقول إنه لم يُخصم شيء، والطلبات تُحدَّث فقط (لا القاصة ولا الإشعارات)، بلا إشعار نجاح', async () => {
    const qc = newClient(); const { fns, hook } = probes(qc); await settled(hook)
    h.api.pay.mockRejectedValue(new Error('TREASURY_INSUFFICIENT'))
    await act(async () => { hook.result.current.pay.mutate({ id: 'd1' }) })
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1))
    const t = h.toast.mock.calls[0]![0] as { type: string; message: string }
    expect(t.type).toBe('error'); expect(t.message).toContain('رصيد القاصة غير كافٍ'); expect(t.message).toContain('لم يُخصم أي مبلغ')
    await waitFor(() => expect(fns.disbursements).toHaveBeenCalledTimes(2))
    expect(fns.treasury).toHaveBeenCalledTimes(1); expect(fns.notifications).toHaveBeenCalledTimes(1); expect(fns.contractors).toHaveBeenCalledTimes(1)
    expect(h.toast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
  })
  it('قرار على طلب لم يعد بانتظار القرار: رسالة عربية محدَّدة، والصفحة تُحدَّث', async () => {
    const qc = newClient(); const { fns, hook } = probes(qc); await settled(hook)
    h.api.decide.mockRejectedValue(new Error('DISBURSEMENT_NOT_PENDING'))
    await act(async () => { hook.result.current.decide.mutate({ id: 'd1', approve: true }) })
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ type: 'error', message: 'لم يعد الطلب بانتظار القرار — حُدِّثت الصفحة.' }))
    await waitFor(() => expect(fns.disbursements).toHaveBeenCalledTimes(2))
  })
  it('«اعتماد وإرسال» بمتعهدين بلا أجور: الرسالة تحمل العدد', async () => {
    const qc = newClient(); const { hook } = probes(qc); await settled(hook)
    h.api.contractorClose.mockRejectedValue(new Error('CONTRACTOR_WAGES_RATES_MISSING:3'))
    await act(async () => { hook.result.current.close.mutate({ month: '2026-03-01' }) })
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1))
    expect((h.toast.mock.calls[0]![0] as { message: string }).message).toMatch(/\(3\)$/)
  })
})

describe('القراءات', () => {
  it('القائمة والتفاصيل تمرّر المرشّحات والمعرّف؛ والتفاصيل لا تُجلب بلا معرّف', async () => {
    h.api.list.mockResolvedValue({ items: [], counts: {}, balance: 0 }); h.api.get.mockResolvedValue({ request: r() })
    const qc = newClient()
    const { result } = renderHook(() => ({ l: useDisbursementList({ kind: 'contractor_wages', status: 'approved' }), d: useDisbursementDetail('d1'), none: useDisbursementDetail(undefined) }), { wrapper: wrapperFor(qc) })
    await waitFor(() => expect(result.current.l.isSuccess && result.current.d.isSuccess).toBe(true))
    expect(h.api.list).toHaveBeenCalledWith({ kind: 'contractor_wages', status: 'approved' }); expect(h.api.get).toHaveBeenCalledWith('d1'); expect(h.api.get).toHaveBeenCalledTimes(1)
    expect(result.current.none.fetchStatus).toBe('idle')
  })
  it('الأسطر: الصفحة الأولى 40 سطراً من offset 0، و«التالية» من حيث انتهت، وتتوقف عند آخر سطر', async () => {
    expect(LINES_PAGE).toBe(40)
    const page = (offset: number, n: number, total: number) => ({ total, net_total: 1, limit: 40, offset, rows: Array.from({ length: n }, (_, i) => ({ id: `l${offset + i}` })) })
    h.api.lines.mockImplementation(async (_id: string, f: { offset: number }) => (f.offset === 0 ? page(0, 40, 85) : f.offset === 40 ? page(40, 40, 85) : page(80, 5, 85)))
    const qc = newClient()
    const { result } = renderHook(() => useDisbursementLines('d1', { group: 'الكرخ', flag: 'deduction', sort: 'name' }), { wrapper: wrapperFor(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(h.api.lines).toHaveBeenLastCalledWith('d1', { group: 'الكرخ', flag: 'deduction', sort: 'name', limit: 40, offset: 0 })
    expect(result.current.hasNextPage).toBe(true)
    await act(async () => { await result.current.fetchNextPage() })
    expect(h.api.lines).toHaveBeenLastCalledWith('d1', expect.objectContaining({ offset: 40, limit: 40 })); expect(result.current.hasNextPage).toBe(true)
    await act(async () => { await result.current.fetchNextPage() })
    expect(h.api.lines).toHaveBeenLastCalledWith('d1', expect.objectContaining({ offset: 80 }))
    await waitFor(() => expect(result.current.hasNextPage).toBe(false)) // إشعار المراقب مجدول بـsetTimeout(0)
    expect(result.current.data!.pages.flatMap((p) => p.rows)).toHaveLength(85)
    expect(h.api.lines).toHaveBeenCalledTimes(3)
  })
  it('الأسطر بلا معرّف لا تُجلب', () => {
    const qc = newClient()
    const { result } = renderHook(() => useDisbursementLines(undefined, {}), { wrapper: wrapperFor(qc) })
    expect(result.current.fetchStatus).toBe('idle'); expect(h.api.lines).not.toHaveBeenCalled()
  })
  it('طلب الشهر لشريط الكشف: أحدث نسخة، null بلا طلب، ولا جلب حين enabled=false', async () => {
    h.api.list.mockResolvedValue({ items: [{ id: 'a', version: 1, status: 'rejected' }, { id: 'c', version: 3, status: 'approved' }, { id: 'b', version: 2, status: 'rejected' }], counts: {}, balance: 0 })
    const qc = newClient()
    const { result } = renderHook(() => ({ on: useEmployeePayrollRequest('2026-10-01'), off: useEmployeePayrollRequest('2026-10-01', false) }), { wrapper: wrapperFor(qc) })
    await waitFor(() => expect(result.current.on.isSuccess).toBe(true))
    expect(result.current.on.data).toMatchObject({ id: 'c', version: 3 })
    expect(h.api.list).toHaveBeenCalledWith({ kind: 'employee_payroll', month: '2026-10-01', limit: 10 })
    expect(result.current.off.fetchStatus).toBe('idle')
    h.api.list.mockResolvedValue({ items: [], counts: {}, balance: 0 })
    const qc2 = newClient()
    const empty = renderHook(() => useEmployeePayrollRequest('2026-09-01'), { wrapper: wrapperFor(qc2) })
    await waitFor(() => expect(empty.result.current.isSuccess).toBe(true)); expect(empty.result.current.data).toBeNull()
  })
  it('أجور المتعهدين: الجاهزية والكشف المعدَّل وأيام متعهد (لا تُجلب بلا متعهد) — الشهر كما مُرِّر', async () => {
    h.api.contractorReadiness.mockResolvedValue({ can_send: true }); h.api.contractorWages.mockResolvedValue([]); h.api.contractorWageDays.mockResolvedValue([])
    const qc = newClient()
    const { result } = renderHook(() => ({ a: useContractorWagesReadiness('2026-03-01'), b: useContractorWagesAdjusted('2026-03-01'), c: useContractorWageDaysAdjusted('c1', '2026-03-01'), d: useContractorWageDaysAdjusted(null, '2026-03-01') }), { wrapper: wrapperFor(qc) })
    await waitFor(() => expect(result.current.a.isSuccess && result.current.b.isSuccess && result.current.c.isSuccess).toBe(true))
    expect(h.api.contractorReadiness).toHaveBeenCalledWith('2026-03-01'); expect(h.api.contractorWages).toHaveBeenCalledWith('2026-03-01'); expect(h.api.contractorWageDays).toHaveBeenCalledWith('c1', '2026-03-01')
    expect(h.api.contractorWageDays).toHaveBeenCalledTimes(1); expect(result.current.d.fetchStatus).toBe('idle')
  })
})

describe('اتساق الاستعلامات بعد حفظ الأجور (علة اكتُشفت بمعاينة حية)', () => {
  it.each([
    ['حفظ الأجور اليومية', (x: { set: ReturnType<typeof useSetContractorRates>; copy: ReturnType<typeof useCopyPreviousRates> }) => x.set.mutate({ contractorId: 'c1', month: '2026-10-01', contractorDaily: 92000, workerDaily: 41000 }), () => cw.setRates.mockResolvedValue({})],
    ['نسخ أجور الشهر السابق', (x: { set: ReturnType<typeof useSetContractorRates>; copy: ReturnType<typeof useCopyPreviousRates> }) => x.copy.mutate({ month: '2026-10-01' }), () => cw.copyPreviousRates.mockResolvedValue(3)],
  ])('%s: تُعاد جلب الجاهزية والكشف المعدَّل وأيام المتعهد (وإلا بقيت لوحة الإرسال تقول «متعهد بلا أجور»)', async (_n, run, arrange) => {
    h.api.contractorReadiness.mockResolvedValue({ blockers: ['rates_missing'], can_send: false })
    h.api.contractorWages.mockResolvedValue([]); h.api.contractorWageDays.mockResolvedValue([])
    const qc = newClient()
    const { result } = renderHook(() => ({
      readiness: useContractorWagesReadiness('2026-10-01'), adjusted: useContractorWagesAdjusted('2026-10-01'), days: useContractorWageDaysAdjusted('c1', '2026-10-01'),
      set: useSetContractorRates(), copy: useCopyPreviousRates(),
    }), { wrapper: wrapperFor(qc) })
    await waitFor(() => expect(result.current.readiness.isSuccess && result.current.adjusted.isSuccess && result.current.days.isSuccess).toBe(true))
    expect([h.api.contractorReadiness, h.api.contractorWages, h.api.contractorWageDays].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
    arrange()
    await act(async () => { run(result.current) })
    await waitFor(() => expect([h.api.contractorReadiness, h.api.contractorWages, h.api.contractorWageDays].map((f) => f.mock.calls.length)).toEqual([2, 2, 2]))
  })
})

describe('إقفال الكشف يُظهر طلب الصرف فوراً في خطوة الكشف (علة اكتُشفت بمعاينة حية)', () => {
  it('اعتماد المالية للكشف يُعيد جلب طلب الشهر؛ بلا ذلك تبقى الخطوة «لم يُنشأ بعد» حتى دقيقة', async () => {
    h.api.list.mockResolvedValueOnce({ items: [], counts: {}, balance: 0 })
      .mockResolvedValue({ items: [{ id: 'd9', version: 1, status: 'pending_approval', request_no: 'DSB-2026-0009' }], counts: {}, balance: 0 })
    hrApi.approvePayroll.mockResolvedValue(undefined)
    const qc = newClient()
    const { result } = renderHook(() => ({ strip: useEmployeePayrollRequest('2026-10-01'), approve: useApprovePayroll() }), { wrapper: wrapperFor(qc) })
    await waitFor(() => expect(result.current.strip.isSuccess).toBe(true))
    expect(result.current.strip.data).toBeNull()
    await act(async () => { result.current.approve.mutate('exp-1') })
    await waitFor(() => expect(hrApi.approvePayroll).toHaveBeenCalledWith('exp-1'))
    await waitFor(() => expect(result.current.strip.data).toMatchObject({ id: 'd9', status: 'pending_approval' }))
    expect(h.api.list).toHaveBeenCalledTimes(2)
  })
})

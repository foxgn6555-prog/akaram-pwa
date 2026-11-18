/** خطافات مسار الصرف: قوائم وطلبات وقرارات وصرف + «اعتماد وإرسال» أجور المتعهدين */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  disbursementErrorMessage, disbursements,
  type DisbursementLinesFilter, type DisbursementListFilter, type DisbursementRequest,
} from '@sdk/disbursements.sdk'
import { useUiStore } from '@stores/ui.store'

export const DISBURSEMENTS_ROOT = ['disbursements'] as const
/** ما يتأثر بأي حركة في المسار: الطلبات نفسها + القاصة + الإشعارات + شاشة أجور المتعهدين */
const AFFECTED = [DISBURSEMENTS_ROOT, ['treasury'], ['notifications'], ['contractors']] as const

const useAction = <T, R = unknown>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      for (const key of AFFECTED) void qc.invalidateQueries({ queryKey: [...key] })
      toast({ type: 'success', message: typeof message === 'function' ? message(r) : message })
    },
    onError: (e) => {
      // أي فشل (طلب تغيّرت حالته، رصيد غير كافٍ...) ⇒ نحدّث الصفحة لتعرض الواقع، ثم نشرح السبب
      void qc.invalidateQueries({ queryKey: [...DISBURSEMENTS_ROOT] })
      toast({ type: 'error', message: disbursementErrorMessage(e) })
    },
  })
}

export const useDisbursementList = (f: DisbursementListFilter) =>
  useQuery({ queryKey: [...DISBURSEMENTS_ROOT, 'list', f], queryFn: () => disbursements.list(f), placeholderData: keepPreviousData, refetchInterval: 60_000 })
export const useDisbursementDetail = (id: string | undefined) =>
  useQuery({ queryKey: [...DISBURSEMENTS_ROOT, 'detail', id], queryFn: () => disbursements.get(id as string), enabled: !!id, refetchInterval: 30_000 })
/** أسطر الطلب بصفحات متراكمة (40 سطراً لكل صفحة) — «عرض المزيد» يجلب الصفحة التالية دون إعادة جلب السابقة */
export const LINES_PAGE = 40
export const useDisbursementLines = (id: string | undefined, f: Omit<DisbursementLinesFilter, 'limit' | 'offset'>) =>
  useInfiniteQuery({
    queryKey: [...DISBURSEMENTS_ROOT, 'lines', id, f],
    queryFn: ({ pageParam }) => disbursements.lines(id as string, { ...f, limit: LINES_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.rows.length < last.total ? last.offset + last.rows.length : undefined),
    enabled: !!id,
    placeholderData: keepPreviousData,
  })

/** طلب صرف رواتب الموظفين لشهرٍ (أحدث نسخة) لشريط مراحل الكشف في المالية؛ null = لا طلب بعد */
export const useEmployeePayrollRequest = (month: string, enabled = true) =>
  useQuery({
    queryKey: [...DISBURSEMENTS_ROOT, 'employee-month', month], enabled, retry: false, refetchInterval: 60_000,
    queryFn: async () => (await disbursements.list({ kind: 'employee_payroll', month, limit: 10 })).items.reduce<DisbursementRequest | null>((a, x) => (!a || x.version > a.version ? x : a), null),
  })

export const useDecideDisbursement = () =>
  useAction((x: { id: string; approve: boolean; note?: string | null }) => disbursements.decide(x.id, x.approve, x.note),
    (r: DisbursementRequest) => (r.status === 'approved' ? `اعتُمد الطلب ${r.request_no} وأُبلغت الشؤون المالية` : `رُفض الطلب ${r.request_no} وأُعيد للمالية بالسبب`))
export const usePayDisbursement = () =>
  useAction((x: { id: string; note?: string | null }) => disbursements.pay(x.id, x.note),
    (r: DisbursementRequest) => `تم الصرف: حركة القاصة ${r.treasury_ref_no ?? ''} وأُبلغ المدير المفوض`.trim())
export const useResubmitDisbursement = () =>
  useAction((x: { id: string; note?: string | null }) => disbursements.resubmit(x.id, x.note),
    (r: DisbursementRequest) => `أُعيد الإرسال: الطلب ${r.request_no} (النسخة ${r.version}) بانتظار قرار المدير المفوض`)

// ── أجور المتعهدين بقواعد البصمة (المالية) ──
// المفاتيح تحت جذر ['contractors'] عمداً: حفظ الأجور اليومية أو نسخها من الشهر السابق (خطافات المتعهدين الموجودة) يُبطل هذا الجذر،
// فتُعاد الجاهزية والكشف المعدَّل فوراً (اكتُشفت العلة بمعاينة حية: لوحة الإرسال بقيت تقول «متعهد بلا أجور» بعد الحفظ).
const CONTRACTORS_ROOT = ['contractors'] as const
export const useContractorWagesReadiness = (month: string) =>
  useQuery({ queryKey: [...CONTRACTORS_ROOT, 'wages-readiness', month], queryFn: () => disbursements.contractorReadiness(month) })
export const useContractorWagesAdjusted = (month: string) =>
  useQuery({ queryKey: [...CONTRACTORS_ROOT, 'wages-adjusted', month], queryFn: () => disbursements.contractorWages(month) })
export const useContractorWageDaysAdjusted = (contractorId: string | null, month: string) =>
  useQuery({ queryKey: [...CONTRACTORS_ROOT, 'wage-days-adjusted', contractorId, month], queryFn: () => disbursements.contractorWageDays(contractorId as string, month), enabled: !!contractorId })
export const useContractorWagesClose = () =>
  useAction((x: { month: string; note?: string | null }) => disbursements.contractorClose(x.month, x.note),
    (r: DisbursementRequest) => `أُرسل الطلب ${r.request_no} إلى المدير المفوض (${new Intl.NumberFormat('en-US').format(r.net_total)} د.ع)`)

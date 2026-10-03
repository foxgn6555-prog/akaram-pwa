/** 00170 الجولة B: مرشّحات الكشوفات (خادم/محلي/وصف) · تصدير Excel/CSV · طباعة التقرير والنموذج الرسمي · عدم ازدواج رسم الصفحات في الراوتر */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import type { DisclosureV2 } from '@sdk/disclosures-unit.sdk'
import { EMPTY_FILTERS, applyClientFilters, filtersSummary, toServerFilter } from '@features/disclosures/lib/filters'
import { buildFormHtml, buildReportHtml, disclosuresToCsv, disclosuresToExcel, summarize } from '@features/disclosures/lib/export-v2'
import { DisclosureFilters } from '@features/disclosures/components/DisclosureFilters'

const mk = (o: Partial<DisclosureV2>): DisclosureV2 => ({
  id: 'x', ref_no: 'DS-2026-00001', status: 'pending', target_kind: 'vehicle', target_label: 'ك', vehicle_id: 'v', employee_id: 'e', employee_name: 'كريم', employee_number: 'EMP-9', department_name: null, job_title: 'سائق',
  db_number: 'DB-101', driver_name: 'كريم جبار', vehicle_type: 'كابسة', contractor_name: null, sector: 'الكرادة 1', shift: 'morning', log_date: '2026-09-20', period_month: '2026-09-01', violation_type: 'speeding', type_label: 'سرعة زائدة', penalty_type: 'warning',
  details: 'تفاصيل <b>', amount: 5000, amount_by_name: null, amount_note: null, prepared_by: 'u', prepared_by_name: 'علي', submitted_at: '2026-10-01T08:00:00Z', resubmit_count: 0, chain_id: 'c', current_step: 'معاون المدير المفوض', current_approvers: [], can_decide: false,
  return_reason: null, returned_by_name: null, returned_at: null, approved_by_name: null, approved_at: null, cancelled_by_name: null, cancelled_at: null, cancel_reason: null, deduction_posted: false, deduction_month: null, deduction_note: null, created_at: '2026-10-01T07:00:00Z', updated_at: 'x',
  events: [{ id: 1, action: 'submitted', actor_name: 'علي', note: null, amount: null, at: '2026-10-01T08:00:00Z' }], timeline: [{ step_no: 1, label: 'معاون المدير المفوض', status: 'pending', decided_by: null, decided_at: null, note: null, approvers: [] }], ...o,
})
const ROWS = [
  mk({ id: 'a', ref_no: 'DS-1', status: 'approved', amount: 5000, deduction_posted: true, deduction_month: '2026-09-01', approved_by_name: 'المدير', approved_at: '2026-10-02T10:00:00Z', log_date: '2026-09-20' }),
  mk({ id: 'b', ref_no: 'DS-2', status: 'pending', amount: null, target_kind: 'employee', employee_name: 'سارة', department_name: 'المالية', sector: null, prepared_by_name: 'حسن', log_date: '2026-09-25', type_label: 'تأخر', violation_type: 'delay' }),
  mk({ id: 'c', ref_no: 'DS-3', status: 'returned', amount: 2000, return_reason: 'نقص', log_date: '2026-08-05', prepared_by_name: 'علي' }),
]

describe('المرشّحات', () => {
  it('الخادم يستلم البحث/النوع/الشهر أو الفترة فقط؛ الفترة تلغي الشهر', () => {
    expect(toServerFilter({ ...EMPTY_FILTERS, q: ' DB ', type: 'delay', month: '2026-09' })).toEqual({ q: 'DB', type: 'delay', month: '2026-09', from: null, to: null })
    expect(toServerFilter({ ...EMPTY_FILTERS, month: '2026-09', from: '2026-09-01' })).toMatchObject({ month: null, from: '2026-09-01' })
  })
  it('الترشيح المحلي: الحالة/الهدف/القاطع/المُعدّ/المبلغ + الترتيب', () => {
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, status: 'approved' }).map((d) => d.id)).toEqual(['a'])
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, kind: 'employee' }).map((d) => d.id)).toEqual(['b'])
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, sector: 'المالية' }).map((d) => d.id)).toEqual(['b'])
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, preparer: 'علي' }).map((d) => d.id).sort()).toEqual(['a', 'c'])
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, amount: 'without' }).map((d) => d.id)).toEqual(['b'])
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, amount: 'deducted' }).map((d) => d.id)).toEqual(['a'])
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, sort: 'date_asc' }).map((d) => d.id)).toEqual(['c', 'a', 'b'])
    expect(applyClientFilters(ROWS, { ...EMPTY_FILTERS, sort: 'amount_desc' }).map((d) => d.id)).toEqual(['a', 'c', 'b'])
  })
  it('وصف المرشّحات بالعربية (يظهر في Excel والطباعة)', () => {
    const s = filtersSummary({ ...EMPTY_FILTERS, status: 'returned', kind: 'vehicle', from: '2026-09-01', to: '2026-09-30', amount: 'with' }, [])
    expect(s).toEqual(['الحالة: مُعاد للتصحيح', 'الهدف: آليات', 'الفترة: 2026-09-01 → 2026-09-30', 'بمبلغ'])
  })
})

describe('التصدير والطباعة', () => {
  it('الملخص: الأعداد والمبالغ والتجميعات', () => {
    const s = summarize(ROWS)
    expect(s).toMatchObject({ total: 3, approved: 1, pending: 1, returned: 1, amountAll: 7000, amountApproved: 5000, deducted: 1 })
    expect(s.byType[0]!).toMatchObject({ key: 'سرعة زائدة', count: 2, amount: 7000 })
  })
  it('Excel: ورقة السجل + الملخص + رسمان، وصف المرشّحات في الترويسة، صف إجمالي بالمبالغ', async () => {
    const wb = await disclosuresToExcel(ROWS, { title: 'سجل الكشوفات — اختبار', scopeLabel: 'الأرشيف', filtersSummary: ['الحالة: معتمد'] })
    const names = wb.worksheets.map((w) => w.name)
    expect(names[0]).toBe('سجل الكشوفات'); expect(names).toContain('الملخص')   // أوراق الرسوم تحتاج canvas (غير متاح في jsdom)
    const ws = wb.getWorksheet('سجل الكشوفات')!
    const text = JSON.stringify(ws.getSheetValues())
    expect(text).toContain('الحالة: معتمد'); expect(text).toContain('DS-1'); expect(text).toContain('الإجمالي'); expect(text).toContain('كريم جبار'); expect(text).toContain('سارة')
    expect(ws.views?.[0]?.rightToLeft).toBe(true)
  })
  it('CSV: BOM + ترويسة عربية + كل الصفوف', () => {
    const csv = disclosuresToCsv(ROWS)
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(csv.split('\n')).toHaveLength(4)
    expect(csv).toContain('رقم الكشف'); expect(csv).toContain('DS-2')
  })
  it('تقرير الطباعة: A4 أفقي بلا هوامش متصفح، ألوان مطبوعة، ترويسة الشركة، المرشّحات، المؤشرات، الجدول، الإجمالي والتواقيع، وتهريب HTML', () => {
    const html = buildReportHtml(ROWS, { title: 'تقرير', scopeLabel: 'النشطة', filtersSummary: ['الشهر: 2026-09'] })
    expect(html).toContain('@page{size:A4 landscape;margin:0}'); expect(html).toContain('print-color-adjust:exact')
    expect(html).toContain('شركة جزيرة الأكارم'); expect(html).toContain('الشهر: 2026-09'); expect(html).toContain('مجموع المبالغ')
    expect(((html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').match(/<tr>/g) ?? []).length).toBe(3)
    expect(html).toContain('7,000'); expect(html).toContain('المدير المفوض</b>'); expect(html).toContain('تفاصيل &lt;b&gt;'); expect(html).not.toContain('تفاصيل <b>')
  })
  it('نموذج الكشف الرسمي: A4 عمودي، بيانات الهدف والمخالفة والمبلغ والقرار ومسار الموافقة والتواقيع؛ المعتمد يُظهر الاستقطاع وشهره', () => {
    const html = buildFormHtml(ROWS[0]!)
    expect(html).toContain('@page{size:A4 portrait;margin:0}')
    for (const t of ['DS-1', 'DB-101', 'كريم جبار', 'سرعة زائدة', '5,000 د.ع', 'معتمد نهائياً', '2026-09', 'مسار الموافقة', 'سجل الأحداث', 'مُعدّ الكشف', 'المدير المفوض']) expect(html).toContain(t)
    const emp = buildFormHtml(ROWS[1]!)
    expect(emp).toContain('الرقم الوظيفي'); expect(emp).toContain('المالية'); expect(emp).toContain('بدون مبلغ'); expect(emp).not.toContain('رقم DB')
    expect(buildFormHtml(ROWS[2]!)).toContain('السبب: نقص')
  })
})

describe('شريط المرشّحات والتصدير (واجهة)', () => {
  const types = [{ key: 'speeding', label: 'سرعة زائدة', description: null, allowed_penalties: [], default_amount: null, is_active: true, sort_order: 1, updated_at: '', updated_by_name: null, used: 0 }]
  beforeEach(() => { vi.restoreAllMocks() })
  it('عدّاد النتائج ومجموع المبالغ، المتقدم يُظهر القاطع/المُعدّ المشتقَّين، الرقائق ومسح الكل، والطباعة تفتح نافذة بالمرشَّح فقط', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ document: { open() {}, write() {}, close() {} }, opener: null } as unknown as Window)
    const onChange = vi.fn()
    const f = { ...EMPTY_FILTERS, status: 'approved' as const }
    render(<DisclosureFilters value={f} onChange={onChange} types={types} rows={ROWS} filtered={applyClientFilters(ROWS, f)} statuses={['approved', 'cancelled']} exportCtx={{ title: 't' }} />)
    expect(screen.getByTestId('filter-count')).toHaveTextContent('1 كشف من 3')
    expect(screen.getByTestId('filter-count')).toHaveTextContent('5,000')
    expect(screen.getAllByTestId('filter-chip').map((c) => c.textContent)).toEqual(['الحالة: معتمد'])
    fireEvent.click(screen.getByTestId('filter-adv-toggle'))
    const sect = screen.getByTestId('filter-sector') as HTMLSelectElement
    expect([...sect.options].map((o) => o.value)).toEqual(['', 'الكرادة 1', 'المالية'])
    const prep = screen.getByTestId('filter-preparer') as HTMLSelectElement
    expect([...prep.options].map((o) => o.value)).toEqual(['', 'حسن', 'علي'])
    fireEvent.change(screen.getByTestId('filter-from'), { target: { value: '2026-09-01' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-01', month: '' }))
    fireEvent.click(screen.getByTestId('filter-clear'))
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTERS)
    fireEvent.click(screen.getByTestId('export-print'))
    await waitFor(() => expect(open).toHaveBeenCalled())
  })
  it('بلا نتائج: التصدير لا يفتح نافذة ويُنبّه', () => {
    const open = vi.spyOn(window, 'open')
    render(<DisclosureFilters value={EMPTY_FILTERS} onChange={() => {}} types={types} rows={[]} filtered={[]} statuses={[]} exportCtx={{}} />)
    fireEvent.click(screen.getByTestId('export-print'))
    expect(open).not.toHaveBeenCalled()
  })
})

describe('الراوتر — الصفحة تُرسم مرة واحدة فقط داخل القوقعة', () => {
  it('لا Outlet ثانٍ بعد <p.shell /> (كان يُنتج نسخة خفية من كل صفحة أسفل الشاشة)', () => {
    const src = readFileSync('src/router/index.tsx', 'utf8')
    expect(src).not.toMatch(/<p\.shell \/>\s*<Outlet \/>/)
    expect(src).toContain('/disclosures/*')
  })
})

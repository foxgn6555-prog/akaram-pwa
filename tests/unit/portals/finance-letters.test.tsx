/**
 * 00356 — الكتب الرسمية:
 *   قالب الكتاب (شعاران، اسم الشركة، العدد والتاريخ، نوع الكتاب، إلى/م، الفقرات، جدول الموظف، جدول بنود التصفية، توقيع المدير المفوض،
 *   نسخة إلى، الأرقام اللاتينية، تهريب HTML) · صفحة سجل الكتب (الرأس، المرشّحات، الجدول، المعاينة والطباعة).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import FinanceLettersPage from '@portals/finance/pages/Letters/FinanceLettersPage'
import { letterBodyHtml, letterDocumentHtml, printLetter } from '@features/letters/lib/letter-html'
import type { LetterRow, OfficialLetter } from '@features/hr/types'

const h = vi.hoisted(() => ({ rows: [] as unknown[], letter: null as unknown, years: [2026, 2025] }))
vi.mock('@features/hr/hooks/useHr', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useLettersList: () => ({ data: h.rows, isLoading: false }), useLettersYears: () => ({ data: h.years }),
  useLetter: (id: string | null) => ({ data: id ? h.letter : undefined, isLoading: false }),
}))

const letter = (o: Partial<OfficialLetter> = {}): OfficialLetter => ({
  id: 'l1', ref: '12/2026', letter_year: 2026, letter_no: 12, kind: 'resignation_accept', kind_label: 'قبول استقالة', subject: 'قبول استقالة / كرار علي', employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار علي',
  department_name: 'النقل', job_title: 'سائق', issued_at: '2026-09-16T08:00:00Z', issued_date: '2026-09-16', issued_by_name: 'HR', signer_name: 'المهندس حسين', signer_title: 'المدير المفوض', source_kind: 'settlement', source_id: 's1',
  hire_date: '2022-03-01', body: ['استناداً إلى طلب الاستقالة… تقرَّر قبول استقالته واعتبار آخر يوم عمل له بتاريخ 2026-09-15.', 'على الشؤون المالية احتساب مستحقاته وفق ملف التصفية رقم ST-2026-0001.', 'يُبلَّغ المدير المباشر (علي حسن) بذلك.'],
  payload: { last_day: '2026-09-15', termination_label: 'استقالة', service_years: 4.5, manager_name: 'علي حسن', settlement_ref: 'ST-2026-0001' }, ...o,
})
const row = (o: Partial<LetterRow>): LetterRow => ({ ...letter(), ...o })

beforeEach(() => { vi.clearAllMocks(); h.letter = letter(); h.rows = [row({}), row({ id: 'l2', ref: '13/2026', letter_no: 13, kind: 'settlement', kind_label: 'تصفية نهاية الخدمة', subject: 'تصفية نهاية الخدمة / كرار علي' })] })

describe('00356 — قالب الكتاب الرسمي', () => {
  it('كتاب إنهاء الخدمة: الشعاران واسم الشركة، العدد 12/2026 والتاريخ، نوع الكتاب، إلى/ و م/، الفقرات الثلاث، جدول الموظف (التعيين/آخر يوم/مدة الخدمة)، توقيع المدير المفوض بالاسم، نسخة إلى المدير المباشر، بلا جدول تصفية', () => {
    const html = letterBodyHtml(letter())
    expect(html).toContain('report-assets/logo-company.png'); expect(html).toContain('report-assets/logo-baghdad.png'); expect(html).toContain('شركة جزيرة الأكارم')
    expect(html).toContain('>12/2026<'); expect(html).toContain('>2026-09-16<'); expect(html).toContain('<div class="docbadge">قبول استقالة</div>')
    expect(html).toContain('إلى / كرار علي — سائق / النقل'); expect(html).toContain('م / قبول استقالة / كرار علي')
    expect(html).toContain('تقرَّر قبول استقالته'); expect(html).toContain('ST-2026-0001'); expect(html).toContain('المدير المباشر (علي حسن)')
    expect(html).toContain('2022-03-01'); expect(html).toContain('2026-09-15'); expect(html).toContain('4.5 سنة'); expect(html).toContain('>استقالة<')
    expect(html).toContain('<div class="sign-name">المهندس حسين</div>'); expect(html).toContain('<div class="sign-title">المدير المفوض</div>')
    expect(html).toContain('نسخة منه إلى: الشؤون المالية · الموارد البشرية · المدير المباشر (علي حسن)')
    expect(html).not.toContain('بنود التصفية النهائية')
    expect(html).not.toMatch(/[٠-٩]/)
  })
  it('كتاب التصفية: جدول البنود الثلاثة بالمعادلات والصافي الأخضر؛ الذمة السالبة تُعرض حمراء بعنوان «ذمة على الموظف»', () => {
    const base = letter({ kind: 'settlement', kind_label: 'تصفية نهاية الخدمة', payload: { last_day: '2026-09-15', salary_source: 'computed', salary_days: 15, day_rate: 30000, salary_net: 450000, leave_days: 30, leave_amount: 900000, advances: [{ ref_no: 'ADV-7', remaining: 150000 }], advances_total: 150000, net: 1200000 } })
    const html = letterBodyHtml(base)
    expect(html).toContain('بنود التصفية النهائية'); expect(html).toContain('15 يوم مستحق × 30,000'); expect(html).toContain('>450,000<'); expect(html).toContain('30 يوم × 30,000'); expect(html).toContain('>900,000<')
    expect(html).toContain('ADV-7: متبقٍ 150,000'); expect(html).toContain('− 150,000'); expect(html).toContain('صافي التصفية المستحق للموظف'); expect(html).toContain('class="num pos">1,200,000')
    const debt = letterBodyHtml(letter({ kind: 'settlement', kind_label: 'تصفية نهاية الخدمة', payload: { ...base.payload, advances_total: 1700000, net: -350000 } }))
    expect(debt).toContain('ذمة على الموظف'); expect(debt).toContain('class="num neg">350,000')
    const paid = letterBodyHtml(letter({ kind: 'settlement', kind_label: 'تصفية نهاية الخدمة', payload: { ...base.payload, salary_source: 'paid_in_sheet', salary_net: 0 } }))
    expect(paid).toContain('صُرف ضمن كشف الشهر المعتمد')
  })
  it('تهريب HTML في الأسماء والنصوص، والمستند الكامل A4 بعنوان الكتاب وزر الطباعة عند autoPrint فقط', () => {
    const html = letterDocumentHtml(letter({ full_name: 'كرار <b>x</b>', body: ['<script>alert(1)</script>'] }))
    expect(html).not.toContain('<b>x</b>'); expect(html).toContain('&lt;b&gt;x&lt;/b&gt;'); expect(html).not.toContain('<script>alert')
    expect(html).toContain('size: A4'); expect(html).toContain('<title>كتاب 12/2026 — قبول استقالة</title>'); expect(html).not.toContain('window.print()')
    expect(letterDocumentHtml(letter(), { autoPrint: true })).toContain('window.print()')
  })
  it('printLetter يفتح نافذة ويكتب المستند، ويرمي رسالة واضحة إن مُنعت النوافذ', () => {
    const write = vi.fn(), close = vi.fn()
    const open = vi.spyOn(window, 'open').mockReturnValue({ document: { write, close } } as unknown as Window)
    printLetter(letter())
    expect(open).toHaveBeenCalled(); expect(write.mock.calls[0]?.[0]).toContain('12/2026'); expect(close).toHaveBeenCalled()
    open.mockReturnValue(null)
    expect(() => printLetter(letter())).toThrow(/النوافذ المنبثقة/)
    open.mockRestore()
  })
})

describe('00356 — صفحة سجل الكتب الرسمية (المالية)', () => {
  it('الرأس (2 كتب: 1 إنهاء، 1 تصفية)، المرشّحات (النوع/السنة/بحث)، الجدول بالعدد والتاريخ والنوع والموضوع والموقّع، المعاينة تفتح الكتاب في إطار مع زر الطباعة', () => {
    render(<MemoryRouter><FinanceLettersPage /></MemoryRouter>)
    expect(screen.getByTestId('lt-stat-total')).toHaveTextContent('2'); expect(screen.getByTestId('lt-stat-term')).toHaveTextContent('1'); expect(screen.getByTestId('lt-stat-set')).toHaveTextContent('1')
    expect(screen.getByTestId('lt-tab-all')).toBeInTheDocument(); expect(screen.getByTestId('lt-tab-termination_any')).toBeInTheDocument(); expect(screen.getByTestId('lt-tab-settlement')).toBeInTheDocument()
    expect(screen.getByTestId('lt-year')).toHaveTextContent('2026'); expect(screen.getByTestId('lt-kind')).toHaveTextContent('إحالة إلى التقاعد'); expect(screen.getByTestId('lt-search')).toBeInTheDocument()
    const r = screen.getByTestId('lt-row-12-2026')
    expect(r).toHaveTextContent('12/2026'); expect(r).toHaveTextContent('2026-09-16'); expect(r).toHaveTextContent('قبول استقالة'); expect(r).toHaveTextContent('قبول استقالة / كرار علي'); expect(r).toHaveTextContent('المهندس حسين')
    expect(screen.getByTestId('lt-table').textContent).not.toMatch(/[٠-٩]/)
    fireEvent.click(screen.getByTestId('lt-open-12-2026'))
    expect(screen.getByTestId('letter-ref')).toHaveTextContent('العدد 12/2026'); expect(screen.getByTestId('letter-kind')).toHaveTextContent('قبول استقالة')
    expect((screen.getByTestId('letter-frame') as HTMLIFrameElement).getAttribute('srcdoc')).toContain('شركة جزيرة الأكارم')
    const open = vi.spyOn(window, 'open').mockReturnValue({ document: { write: vi.fn(), close: vi.fn() } } as unknown as Window)
    fireEvent.click(screen.getByTestId('letter-print')); expect(open).toHaveBeenCalled(); open.mockRestore()
    fireEvent.click(screen.getByTestId('letter-close')); expect(screen.queryByTestId('letter-viewer')).toBeNull()
  })
  it('لا كتب ⇒ حالة فارغة', () => {
    h.rows = []
    render(<MemoryRouter><FinanceLettersPage /></MemoryRouter>)
    expect(screen.getByText('لا كتب هنا')).toBeInTheDocument()
  })
})

/**
 * إنشاء كشف تأديبي:
 *  · أنواع المخالفات الستة ظاهرة (منها: انسحاب مبكر ونقص حمولة)
 *  · «توبيخ» محذوف من الإجراءات التأديبية — تبقى (إنذار / إنهاء خدمات)
 *  · الشفت: ثلاث نوبات ذاتية (صباحي/مسائي/ليلي) · المتعهد: ذاتي/مؤجر
 *  · التحقق من الحقول المطلوبة
 *  · الحفظ يستدعي create بالبيانات
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockCreate = vi.fn().mockResolvedValue({ id: 'd1' })
vi.mock('@features/disclosures', () => ({
  useCreateDisclosure: () => ({ mutate: mockCreate, isPending: false }),
}))

import NewDisclosure from '@portals/disclosures/pages/Statements/NewDisclosure'

function renderPage() {
  return render(
    <MemoryRouter>
      <NewDisclosure />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('NewDisclosure', () => {
  it('يعرض أنواع المخالفات الستة', () => {
    renderPage()
    expect(screen.getByText('تأخير')).toBeInTheDocument()
    expect(screen.getByText('غياب')).toBeInTheDocument()
    expect(screen.getByText('جباية')).toBeInTheDocument()
    expect(screen.getByText('تهرب من العمل')).toBeInTheDocument()
    expect(screen.getByText('انسحاب مبكر')).toBeInTheDocument()
    expect(screen.getByText('نقص حمولة')).toBeInTheDocument()
  })

  it('يخفي «توبيخ» من الإجراءات التأديبية — تبقى إنذار وإنهاء خدمات', () => {
    renderPage()
    expect(screen.getByText('إنذار')).toBeInTheDocument()
    expect(screen.getByText('إنهاء خدمات')).toBeInTheDocument()
    expect(screen.queryByText('توبيخ')).not.toBeInTheDocument()
  })

  it('يعرض الشفت الثلاثي الذاتي (صباحي/مسائي/ليلي)', () => {
    renderPage()
    expect(screen.getByText(/ذاتي · صباحي/)).toBeInTheDocument()
    expect(screen.getByText(/ذاتي · مسائي/)).toBeInTheDocument()
    expect(screen.getByText(/ذاتي · ليلي/)).toBeInTheDocument()
  })

  it('يعرض نوعي المتعهد (ذاتي / مؤجر)', () => {
    renderPage()
    expect(screen.getByText('ذاتي (تشغيل ذاتي)')).toBeInTheDocument()
    expect(screen.getByText('مؤجر (آلية مؤجرة)')).toBeInTheDocument()
  })

  it('يرفض الحفظ دون البيانات المطلوبة', async () => {
    const user = userEvent.setup()
    renderPage()
    // امسح الحقول الإلزامية واضغط حفظ
    await user.click(screen.getByTestId('save-draft'))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText('رقم الآلية (DB) مطلوب')).toBeInTheDocument()
    expect(screen.getByText('اسم السائق مطلوب (حرفان فأكثر)')).toBeInTheDocument()
    expect(screen.getByText('تفاصيل الكشف مطلوبة (10 أحرف فأكثر)')).toBeInTheDocument()
  })

  it('يحفظ الكشف بعد اكتمال الحقول', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-db'), '88120')
    await user.type(screen.getByTestId('f-driver'), 'سائق مخالف')
    await user.type(screen.getByTestId('f-details'), 'تأخر عن الدوام ثلاث مرات دون عذر مقبول')
    await user.click(screen.getByTestId('violation-delay'))
    await user.click(screen.getByTestId('save-draft'))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ db_number: '88120', driver_name: 'سائق مخالف', violation_type: 'delay' }),
      expect.anything(),
    )
  })

  it('يقبل اختيار المخالفات الجديدة (انسحاب مبكر)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-db'), '88120')
    await user.type(screen.getByTestId('f-driver'), 'سائق مخالف')
    await user.type(screen.getByTestId('f-details'), 'انسحب من الموقع قبل نهاية الشفت دون إذن')
    await user.click(screen.getByTestId('violation-early_withdrawal'))
    await user.click(screen.getByTestId('save-draft'))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ violation_type: 'early_withdrawal' }),
      expect.anything(),
    )
  })
})

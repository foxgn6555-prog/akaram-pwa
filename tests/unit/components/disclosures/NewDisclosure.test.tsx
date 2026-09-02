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
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Disclosure } from '@features/disclosures/types'

const mockCreate = vi.fn().mockResolvedValue({ id: 'd1' })
const mockUpdate = vi.fn().mockResolvedValue(undefined)
let byIdData: Disclosure | null = null
vi.mock('@features/disclosures', () => ({
  useCreateDisclosure: () => ({ mutate: mockCreate, isPending: false }),
  useUpdateDisclosure: () => ({ mutate: mockUpdate, isPending: false }),
  useDisclosureById: () => ({ data: byIdData, isLoading: false }),
}))

import NewDisclosure from '@portals/disclosures/pages/Statements/NewDisclosure'

function renderPage() {
  return render(
    <MemoryRouter>
      <NewDisclosure />
    </MemoryRouter>,
  )
}

/** وضع التعديل: مسار مع معرّف السجل */
function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/disclosures/statements/d1/edit']}>
      <Routes>
        <Route path="/disclosures/statements/:id/edit" element={<NewDisclosure />} />
      </Routes>
    </MemoryRouter>,
  )
}

const RECORD: Disclosure = {
  id: 'd1', ref_no: null, db_number: '88120', driver_name: 'سائق مخالف',
  vehicle_type: 'حاوية', contractor_name: 'ذاتي', sector: 'شرق', shift: 'evening',
  log_date: '2026-08-30', violation_type: 'early_withdrawal', penalty_type: 'warning',
  details: 'انسحاب قبل نهاية الشفت دون إذن', status: 'draft', submitted_at: null,
  prepared_by_name: 'منظم الكشف', archived_at: null, archived_by: null,
  archive_reason: null, created_by: null, created_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  byIdData = null
})

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

describe('NewDisclosure — وضع التعديل', () => {
  it('يملأ النموذج ببيانات المسودة', () => {
    byIdData = RECORD
    renderEdit()
    expect((screen.getByTestId('f-db') as HTMLInputElement).value).toBe('88120')
    expect((screen.getByTestId('f-driver') as HTMLInputElement).value).toBe('سائق مخالف')
    expect(screen.getByText('تعديل كشف تأديبي')).toBeInTheDocument()
    expect(screen.getByTestId('save-draft')).toHaveTextContent('حفظ التعديلات')
  })

  it('يحفظ التعديلات عبر update ولا يستدعي create', async () => {
    byIdData = RECORD
    const user = userEvent.setup()
    renderEdit()
    await user.click(screen.getByTestId('save-draft'))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'd1',
        input: expect.objectContaining({ db_number: '88120', driver_name: 'سائق مخالف' }),
      }),
      expect.anything(),
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('يقفل التعديل للكشف المرفوع للمعاون', () => {
    byIdData = { ...RECORD, status: 'submitted_to_deputy' }
    renderEdit()
    expect(screen.getByTestId('edit-locked')).toBeInTheDocument()
    expect(screen.queryByTestId('disclosure-form')).not.toBeInTheDocument()
  })

  it('يعرض رسالة عند عدم العثور على الكشف', () => {
    byIdData = null
    renderEdit()
    expect(screen.getByTestId('edit-not-found')).toBeInTheDocument()
  })
})

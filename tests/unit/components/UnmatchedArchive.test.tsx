import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mocks = vi.hoisted(() => ({ people: vi.fn(), punches: vi.fn(), download: vi.fn() }))
vi.mock('@sdk/biometric.sdk', () => ({ biometric: { unmatchedArchivePeople: mocks.people, unmatchedArchivePunches: mocks.punches } }))
vi.mock('@features/hr/lib/hrExcel', () => ({ downloadWorkbook: mocks.download }))

import UnmatchedArchive from '@portals/hr/pages/Biometric/UnmatchedArchive'
import { archiveLocalTime, buildArchivePeopleWorkbook, buildArchivePunchWorkbook, collectArchivePeople, collectArchivePunches } from '@features/integrations/lib/unmatchedArchiveExcel'
import type { UnmatchedArchivePerson, UnmatchedArchivePunch } from '@features/integrations/types'

const person = (device: string, pin: string): UnmatchedArchivePerson => ({ device_serial: device, pin, device_person_name: 'كريم', device_name: 'الجهاز', branch_id: 'b1', punch_count: 2, first_punch: null, last_punch: null })
const punch = (id: string, at = '2026-09-01T21:30:00Z'): UnmatchedArchivePunch => ({ source_punch_id: id, punched_at: at, original_punch: { direction: 'unknown', method: 'adms_push' }, original_device: { timezone_offset: '+03:00' } })
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}><UnmatchedArchive branches={[{ id: 'b1', name: 'فرع الكرخ' }]} /></QueryClientProvider>)
}

describe('أرشيف غير المطابقين', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.people.mockResolvedValue([person('A', '1'), person('B', '1')]); mocks.punches.mockResolvedValue([punch('p1')]) })
  it('يفصل الرقم المتكرر حسب الجهاز ويرسل فلاتر البحث إلى الخادم', async () => {
    setup()
    expect(await screen.findByTestId('archive-person-A-1')).toBeInTheDocument()
    expect(screen.getByTestId('archive-person-B-1')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('archive-search'), { target: { value: 'كريم' } })
    fireEvent.change(screen.getByTestId('archive-device'), { target: { value: 'B' } })
    fireEvent.change(screen.getByTestId('archive-branch'), { target: { value: 'b1' } })
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }))
    await waitFor(() => expect(mocks.people).toHaveBeenCalledWith({ search: 'كريم', deviceSerial: 'B', branchId: 'b1' }, null, 51))
  })
  it('يعرض الوقت بمنطقة الجهاز والاتجاه الأصلي ويطبق الفترة على الخادم', async () => {
    setup()
    const row = await screen.findByTestId('archive-person-A-1')
    fireEvent.click(within(row).getByRole('button', { name: 'عرض البصمات' }))
    expect(await screen.findByText('2026-09-02 12:30:00 صباحاً (+03:00)')).toBeInTheDocument()
    expect(screen.getByText('غير محدد')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('archive-from'), { target: { value: '2026-09-02' } })
    fireEvent.change(screen.getByTestId('archive-to'), { target: { value: '2026-09-03' } })
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق الفترة' }))
    await waitFor(() => expect(mocks.punches).toHaveBeenCalledWith('A', '1', '2026-09-02', '2026-09-03', null, 51))
    fireEvent.change(screen.getByTestId('archive-from'), { target: { value: '2026-09-04' } })
    expect(screen.getByRole('alert')).toHaveTextContent('البداية')
    expect(screen.getByRole('button', { name: 'تطبيق الفترة' })).toBeDisabled()
  })
  it('تصفح الأشخاص يستخدم آخر شخص ظاهر ثم يرجع للصفحة السابقة', async () => {
    mocks.people.mockImplementation(async (_filters, cursor) => cursor ? [person('Z', 'last')] : Array.from({ length: 51 }, (_, i) => person('D', String(i).padStart(3, '0'))))
    setup()
    await screen.findByTestId('archive-person-D-000')
    expect(screen.queryByTestId('archive-person-D-050')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }))
    expect(await screen.findByTestId('archive-person-Z-last')).toBeInTheDocument()
    expect(mocks.people).toHaveBeenCalledWith({}, { device: 'D', pin: '049' }, 51)
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }))
    expect(await screen.findByTestId('archive-person-D-000')).toBeInTheDocument()
  })
  it('يوقف التصدير حتى تطبيق الفلتر ويصدّر النتائج المطبقة', async () => {
    mocks.download.mockResolvedValue(undefined)
    setup()
    await screen.findByTestId('archive-person-A-1')
    fireEvent.change(screen.getByTestId('archive-search'), { target: { value: 'كريم' } })
    expect(screen.getByTestId('archive-people-export')).toBeDisabled()
    expect(screen.getByText(/اضغط «بحث»/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }))
    await waitFor(() => expect(screen.getByTestId('archive-people-export')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('archive-people-export'))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1))
    const workbook = mocks.download.mock.calls[0]![0]
    expect(workbook.getWorksheet('أشخاص الأرشيف').getCell('A2').value).toContain('كريم')
  })
  it('صفحات تفاصيل البصمات تستعمل معرف البصمة عند تساوي الوقت', async () => {
    mocks.punches.mockImplementation(async (_d, _p, _f, _t, cursor) => cursor ? [punch('tail')] : Array.from({ length: 51 }, (_, i) => punch(`id${String(i).padStart(2, '0')}`)))
    setup()
    const row = await screen.findByTestId('archive-person-A-1')
    fireEvent.click(within(row).getByRole('button', { name: 'عرض البصمات' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'التالي' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }))
    await waitFor(() => expect(mocks.punches).toHaveBeenCalledWith('A', '1', '', '', { at: '2026-09-01T21:30:00Z', id: 'id49' }, 51))
  })

  it('عند فشل التحميل لا يعرض بيانات مزعومة', async () => {
    mocks.people.mockRejectedValue(new Error('offline'))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل الأرشيف')
    expect(screen.queryByText('لا توجد نتائج مطابقة في الأرشيف.')).not.toBeInTheDocument()
  })
  it('تصدير الأرشيف يجلب جميع الصفحات حسب الفلتر والترتيب مع توضيح الوقت', async () => {
    const list = Array.from({ length: 251 }, (_, i) => person('D', String(i).padStart(3, '0')))
    mocks.people.mockImplementation(async (_f, cursor) => cursor ? list.slice(250) : list)
    const filters = { search: 'كريم', branchId: 'b1' }
    const all = await collectArchivePeople(filters)
    expect(all).toHaveLength(251)
    expect(mocks.people).toHaveBeenLastCalledWith(filters, { device: 'D', pin: '249' }, 251)
    const wb = await buildArchivePeopleWorkbook(all, filters, [{ id: 'b1', name: 'فرع الكرخ' }])
    const ws = wb.getWorksheet('أشخاص الأرشيف')!
    expect(ws.getCell('A2').value).toContain('كريم')
    expect(ws.getRow(4).getCell(6).value).toBe('فرع الكرخ')
    expect(ws.getRow(254).getCell(3).value).toBe('250')
    const punches = Array.from({ length: 251 }, (_, i) => punch(`p${String(i).padStart(3, '0')}`))
    mocks.punches.mockImplementation(async (_d, _p, _f, _t, cursor) => cursor ? punches.slice(250) : punches)
    const allPunches = await collectArchivePunches(person('D', '1'), '2026-09-02', '2026-09-02')
    expect(allPunches).toHaveLength(251)
    const pwb = await buildArchivePunchWorkbook(person('D', '1'), allPunches, '2026-09-02', '2026-09-02')
    expect(pwb.getWorksheet('بصمات الأرشيف')!.getRow(4).getCell(2).value).toBe('2026-09-02 12:30:00 صباحاً (+03:00)')
    expect(pwb.getWorksheet('بصمات الأرشيف')!.getRow(4).getCell(3).value).toBe('غير محدد')
    expect(archiveLocalTime('2026-09-01T21:30:00Z', null)).toBe('2026-09-01 09:30:00 مساءً (UTC)')
  })
})

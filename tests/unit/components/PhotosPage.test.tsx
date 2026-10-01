/**
 * وحدة إرسال الصور (بوابة مسؤول القسم) — تفاصيل الآلية:
 * القاطع/القسم/التاريخ تلقائي، ثلاث طرق، أنواع العمل + مخصص، حد 500، ومسار الإرسال.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  send: vi.fn(),
  upload: vi.fn(),
  mine: vi.fn(),
}))
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const sub = (id: string, exec: string, mode = 'street') => ({
  id, mode, title: `تذكرة ${id}`, work_type: null, sector_parent: 'karrada', sector_ids: [1], event_date: exec, exec_date: exec, notes: null, photo_count: 2, status: 'submitted',
  submitted_by: 'u', submitted_by_name: 'م', archived_at: null, archive_reason: null, created_at: `${exec}T06:00:00Z`, location: 'قرب الجامع', supervisors_count: 1, workers_count: 5,
  veh_tipper: 1, veh_tanker: 0, veh_compactor: 0, veh_loader: 0, veh_sweeper: 2, merged_into: null, merged_count: 0,
})

vi.mock('@features/media/hooks', () => ({
  useSendPhotos: () => ({ mutateAsync: h.send, isPending: false }),
  useUploadPhotos: () => ({ mutateAsync: h.upload, isPending: false }),
  useMySubmissions: (from: string | null, to: string | null, mode: string | null) => {
    h.mine(from, to, mode)
    // الخادم يفلتر بالتاريخ — نحاكيه هنا
    const all = [sub('a', today), sub('b', '2026-09-20'), sub('c', today, 'campaign')]
    return { data: all.filter((s) => (!from || s.exec_date >= from) && (!to || s.exec_date <= to) && (!mode || s.mode === mode)), isLoading: false }
  },
}))
vi.mock('@sdk/sector.sdk', () => ({
  sector: {
    listSectors: async () => [{ id: 1, name: 'قسم الآليات', parent_sector: 'karrada' }],
    myProfile: async () => ({ sectors: [1] }),
  },
}))
vi.mock('@components/ui', () => ({
  CameraCapture: () => null,
}))

import PhotosPage from '@portals/manager/pages/Photos/PhotosPage'

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}
const makeFiles = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => new File([new Uint8Array(8)], `img-${i}.jpg`, { type: 'image/jpeg' }),
  )

beforeEach(() => {
  h.send.mockReset()
  h.upload.mockReset()
  h.upload.mockResolvedValue(['u/a.jpg', 'u/b.jpg'])
  h.send.mockResolvedValue({ id: 's1' })
  // jsdom لا يوفّر روابط الكائنات — يكفي رابط وهمي للمعاينات
  URL.createObjectURL = vi.fn(() => 'blob:mock') as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
})

describe('وحدة إرسال الصور', () => {
  it('يعرض القاطع والقسم والتاريخ تلقائياً من الحساب', async () => {
    wrap(<PhotosPage />)
    expect(await screen.findByText('قاطع الكرادة')).toBeInTheDocument()
    expect(screen.getByText('قسم الآليات')).toBeInTheDocument()
    expect(screen.getByText('التاريخ (تلقائي)')).toBeInTheDocument()
  })

  it('طريقة الشارع: بلا نوع عمل، وإرسال ناجح بمصفوفة صور', async () => {
    wrap(<PhotosPage />)
    fireEvent.change(screen.getByTestId('f-photo-title'), { target: { value: 'شارع الرشيد' } })
    fireEvent.change(screen.getByTestId('f-photo-files'), { target: { files: makeFiles(2) } })
    expect(screen.getByText('2 / 500 صورة')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('photo-submit'))
    await waitFor(() => expect(h.upload).toHaveBeenCalled())
    expect(h.send).toHaveBeenCalledWith(
      ['street', 'شارع الرشيد', null, '', [
        { storagePath: 'u/a.jpg', caption: '' },
        { storagePath: 'u/b.jpg', caption: '' },
      ], { location: '', exec_date: today, supervisors: 0, workers: 0, vehicles: { tipper: 0, tanker: 0, compactor: 0, loader: 0, sweeper: 0 } }],
    )
  })

  it('00164: تفاصيل الحملة (الموقع، تاريخ التنفيذ، المراقبون، العمال، الآليات الخمس) تُرسل مع التذكرة، وتسميات الحقول تتغير حسب النوع', async () => {
    wrap(<PhotosPage />)
    expect(screen.getByText('اسم الشارع', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mode-campaign'))
    expect(screen.getByText('موقع الحملة')).toBeInTheDocument()
    expect(screen.getByText('تاريخ تنفيذ الحملة')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mode-school'))
    expect(screen.getByText('موقع المدرسة')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mode-campaign'))
    fireEvent.change(screen.getByTestId('f-photo-title'), { target: { value: 'حملة تنظيف الكرادة' } })
    fireEvent.change(screen.getByTestId('f-photo-worktype'), { target: { value: 'غسل الشارع' } })
    fireEvent.change(screen.getByTestId('f-location'), { target: { value: 'ساحة الفردوس' } })
    fireEvent.change(screen.getByTestId('f-exec-date'), { target: { value: '2026-09-28' } })
    fireEvent.change(screen.getByTestId('f-supervisors'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('f-workers'), { target: { value: '15' } })
    fireEvent.change(screen.getByTestId('f-veh-tanker'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('f-veh-loader'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('f-photo-files'), { target: { files: makeFiles(2) } })
    fireEvent.click(screen.getByTestId('photo-submit'))
    await waitFor(() => expect(h.send).toHaveBeenCalled())
    expect(h.send.mock.calls[0]![0][5]).toEqual({ location: 'ساحة الفردوس', exec_date: '2026-09-28', supervisors: 2, workers: 15, vehicles: { tipper: 0, tanker: 2, compactor: 0, loader: 1, sweeper: 0 } })
  })

  it('00164: الأعداد غير الرقمية تمنع الإرسال', async () => {
    wrap(<PhotosPage />)
    fireEvent.change(screen.getByTestId('f-photo-title'), { target: { value: 'شارع الرشيد' } })
    fireEvent.change(screen.getByTestId('f-workers'), { target: { value: 'عشرة' } })
    fireEvent.change(screen.getByTestId('f-photo-files'), { target: { files: makeFiles(1) } })
    fireEvent.click(screen.getByTestId('photo-submit'))
    expect(await screen.findByText(/أرقاماً صحيحة/)).toBeInTheDocument()
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('00164: «تذكراتي» مفلترة بتاريخ اليوم افتراضياً، وتتغير بالفلتر والنوع', () => {
    wrap(<PhotosPage />)
    expect(h.mine).toHaveBeenLastCalledWith(today, today, null)
    expect(screen.getByTestId('mine-a')).toBeInTheDocument()
    expect(screen.queryByTestId('mine-b')).toBeNull()
    expect(screen.getByText('تذكراتي المرسلة (2)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('اختيار يوم محدد'), { target: { value: '2026-09-20' } })
    expect(screen.getByTestId('mine-b')).toBeInTheDocument()
    expect(screen.queryByTestId('mine-a')).toBeNull()
    fireEvent.click(screen.getByText('كل الأيام'))
    expect(screen.getByText('تذكراتي المرسلة (3)')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('mine-mode'), { target: { value: 'campaign' } })
    expect(h.mine).toHaveBeenLastCalledWith(null, null, 'campaign')
    expect(screen.getByText('تذكراتي المرسلة (1)')).toBeInTheDocument()
    expect(screen.getByTestId('mine-c')).toHaveTextContent('مراقبون 1 · عمال 5 · آليات 3')
  })

  it('الحملة تُظهر أنواع العمل والمدارس تُضيف أنواعها', async () => {
    wrap(<PhotosPage />)
    expect(screen.queryByTestId('f-photo-worktype')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mode-campaign'))
    const select = screen.getByTestId('f-photo-worktype') as HTMLSelectElement
    expect([...select.options].some((o) => o.value === 'رفع حاويات')).toBe(true)
    fireEvent.click(screen.getByTestId('mode-school'))
    const schoolSelect = screen.getByTestId('f-photo-worktype') as HTMLSelectElement
    expect([...schoolSelect.options].some((o) => o.value === 'غسل المدرسة')).toBe(true)
    expect([...schoolSelect.options].some((o) => o.value === 'تنظيف محيط المدرسة')).toBe(true)
  })

  it('خيار مخصص يفتح حقل كتابة نوع العمل', () => {
    wrap(<PhotosPage />)
    fireEvent.click(screen.getByTestId('mode-campaign'))
    fireEvent.change(screen.getByTestId('f-photo-worktype'), { target: { value: 'مخصص' } })
    expect(screen.getByTestId('f-photo-customtype')).toBeInTheDocument()
  })

  it('يحدد الإضافة عند 500 صورة ويعرض تنبيه الحد', () => {
    wrap(<PhotosPage />)
    fireEvent.change(screen.getByTestId('f-photo-files'), { target: { files: makeFiles(505) } })
    expect(screen.getByText('500 / 500 صورة')).toBeInTheDocument()
    expect(screen.getByText('(بلغت الحد الأقصى)')).toBeInTheDocument()
  })

  it('اسم قصير يمنع الإرسال ويعرض رسالة التحقق', async () => {
    wrap(<PhotosPage />)
    fireEvent.change(screen.getByTestId('f-photo-title'), { target: { value: 'ش' } })
    fireEvent.change(screen.getByTestId('f-photo-files'), { target: { files: makeFiles(1) } })
    fireEvent.click(screen.getByTestId('photo-submit'))
    expect(await screen.findByText(/الاسم قصير جداً/)).toBeInTheDocument()
    expect(h.upload).not.toHaveBeenCalled()
  })
})

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
}))

vi.mock('@features/media/hooks', () => ({
  useSendPhotos: () => ({ mutateAsync: h.send, isPending: false }),
  useUploadPhotos: () => ({ mutateAsync: h.upload, isPending: false }),
  useMySubmissions: () => ({ data: [], isLoading: false }),
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
    expect(screen.getByText('2026-09-15')).toBeInTheDocument()
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
      ]],
    )
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

/** اختبارات صفحة غرفة العمليات — وحدة GBS الحاويات (00136). */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({
  containers: [] as unknown[],
  containersArgs: [null, null] as [string | null, string | null],
  updates: [] as unknown[],
  updatesArg: 'pending' as string,
  save: vi.fn(),
  remove: vi.fn(),
  review: vi.fn(),
  uploadImage: vi.fn(),
  imageUrl: vi.fn(),
}))

vi.mock('react-leaflet', () => ({
  useMap: () => ({ flyTo: vi.fn() }),
  useMapEvents: () => null,
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@features/gbs/hooks', () => ({
  gbsKeys: { containers: () => [], updates: () => [], myUpdates: () => [] },
  useGbsContainers: (search: string | null, status: string | null) => {
    h.containersArgs = [search, status]
    return { data: h.containers, isLoading: false }
  },
  useGbsUpdates: (state: string) => {
    h.updatesArg = state
    return { data: h.updates, isLoading: false }
  },
  useGbsSaveContainer: () => ({ mutate: h.save, isPending: false }),
  useGbsDeleteContainer: () => ({ mutate: h.remove, isPending: false }),
  useGbsReviewUpdate: () => ({ mutate: h.review, isPending: false }),
}))

vi.mock('@sdk/gbs.sdk', () => ({
  gbs: { uploadImage: h.uploadImage, imageUrl: h.imageUrl },
}))

import GbsContainersPage from '@portals/ops-room/pages/Gbs/GbsContainersPage'

const container = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  code: 'GBS-0001',
  label: 'حاوية الكرادة',
  latitude: 33.3,
  longitude: 44.4,
  status: 'ok',
  imagePath: null,
  notes: null,
  updatedAt: '2026-09-21T08:00:00Z',
  pendingCount: 0,
  ...over,
})

beforeEach(() => {
  h.containers = [container(), container({ id: 'c2', code: 'GBS-0002', label: 'حاوية الزيرو', status: 'damaged' })]
  h.updates = []
  h.containersArgs = [null, null]
  h.updatesArg = 'pending'
  h.imageUrl.mockResolvedValue('https://signed/x.jpg')
  h.save.mockReset()
  h.remove.mockReset()
  h.review.mockReset()
})

describe('غرفة العمليات — خريطة GBS', () => {
  it('يعرض النقاط والقائمة وإحصاءات الحالات', () => {
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-map')).toBeInTheDocument()
    expect(screen.getByTestId('gbs-popup-c1')).toBeInTheDocument()
    expect(screen.getByTestId('gbs-list-item-c2')).toBeInTheDocument()
    expect(screen.getByTestId('gbs-stat-ok').textContent).toContain('1')
    expect(screen.getByTestId('gbs-stat-damaged').textContent).toContain('1')
    expect(screen.getByTestId('gbs-result-count').textContent).toContain('2')
  })

  it('البحث المتقدم والفلتر يمرران للخادم (لا فلترة محلية)', () => {
    render(<GbsContainersPage />)
    fireEvent.change(screen.getByTestId('gbs-search'), { target: { value: 'زيرو' } })
    fireEvent.change(screen.getByTestId('gbs-status-filter'), { target: { value: 'damaged' } })
    expect(h.containersArgs).toEqual(['زيرو', 'damaged'])
  })

  it('إضافة حاوية: إحداثيات + حالة + حفظ عبر useGbsSaveContainer', () => {
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-add-container'))
    fireEvent.change(screen.getByTestId('gbs-label'), { target: { value: 'حاوية جديدة' } })
    fireEvent.change(screen.getByTestId('gbs-lat'), { target: { value: '33.25' } })
    fireEvent.change(screen.getByTestId('gbs-lng'), { target: { value: '44.35' } })
    fireEvent.click(screen.getByTestId('gbs-status-replace'))
    fireEvent.change(screen.getByTestId('gbs-notes'), { target: { value: 'بجانب المدرسة' } })
    h.save.mockImplementation((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    fireEvent.click(screen.getByTestId('gbs-save'))
    expect(h.save).toHaveBeenCalledWith(
      {
        id: null,
        label: 'حاوية جديدة',
        latitude: 33.25,
        longitude: 44.35,
        status: 'replace',
        imagePath: null,
        notes: 'بجانب المدرسة',
      },
      expect.anything(),
    )
    expect(screen.queryByTestId('gbs-save')).not.toBeInTheDocument()
  })

  it('الحذف يتطلب تأكيداً وينفذ عبر useGbsDeleteContainer', () => {
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-delete-c1'))
    expect(screen.getByText(/سيُحذف GBS-0001/)).toBeInTheDocument()
    h.remove.mockImplementation((_id: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    fireEvent.click(screen.getByTestId('gbs-confirm-delete'))
    expect(h.remove).toHaveBeenCalledWith('c1', expect.anything())
    expect(screen.queryByTestId('gbs-confirm-delete')).not.toBeInTheDocument()
  })

  it('تعديل حاوية قائمة يعبئ النموذج ويمرر id', () => {
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-edit-c2'))
    expect(screen.getByTestId('gbs-label')).toHaveValue('حاوية الزيرو')
    fireEvent.change(screen.getByTestId('gbs-label'), { target: { value: 'اسم معدل' } })
    fireEvent.click(screen.getByTestId('gbs-save'))
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c2', label: 'اسم معدل', status: 'damaged' }),
      expect.anything(),
    )
  })
})

describe('غرفة العمليات — اعتماد طلبات التحديث', () => {
  const update = (over: Record<string, unknown> = {}) => ({
    id: 'u1',
    containerId: 'c1',
    code: 'GBS-0001',
    label: 'حاوية الكرادة',
    proposedStatus: 'missing',
    photoPath: null,
    note: 'فقدت بعد الفيضان',
    state: 'pending',
    requestedBy: 'm1',
    requesterName: 'أبو أحمد',
    createdAt: '2026-09-21T08:00:00Z',
    reviewedAt: null,
    reviewNote: null,
    ...over,
  })

  it('يعرض الطلب المعلق مع بيانات الطالب ويعتمده', () => {
    h.updates = [update()]
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-update-u1').textContent).toContain('أبو أحمد')
    expect(screen.getByTestId('gbs-update-u1').textContent).toContain('فقدت بعد الفيضان')
    h.review.mockImplementation((_x: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    fireEvent.change(screen.getByTestId('gbs-review-note-u1'), { target: { value: 'تم الكشف' } })
    fireEvent.click(screen.getByTestId('gbs-approve-u1'))
    expect(h.review).toHaveBeenCalledWith(
      { updateId: 'u1', approve: true, reviewNote: 'تم الكشف' },
      expect.anything(),
    )
  })

  it('الرفض يمرر approve=false', () => {
    h.updates = [update()]
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-reject-u1'))
    expect(h.review).toHaveBeenCalledWith(
      { updateId: 'u1', approve: false, reviewNote: undefined },
      expect.anything(),
    )
  })

  it('الطلبات المحسومة تعرض الحالة ولا أزرار مراجعة + تبديل الطابور', () => {
    h.updates = [update({ state: 'approved', reviewNote: 'تم التحقق' })]
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-update-u1').textContent).toContain('معتمد')
    expect(screen.getByTestId('gbs-update-u1').textContent).toContain('تم التحقق')
    expect(screen.queryByTestId('gbs-approve-u1')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('gbs-queue-state'), { target: { value: 'rejected' } })
    expect(h.updatesArg).toBe('rejected')
  })

  it('شارة الطلبات المعلقة تظهر على الحاوية', () => {
    h.containers = [container({ pendingCount: 2 })]
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-list-item-c1').textContent).toContain('2 طلب')
  })
})

/** اختبارات صفحة مسؤول القسم — وحدة GBS الحاويات (00136): اقتراحات لا تُطبق إلا بالموافقة. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  containers: [] as unknown[],
  myUpdates: [] as unknown[],
  request: vi.fn(),
  zones: [] as unknown[],
  jur: [4] as number[],
  uploadImage: vi.fn(),
  imageUrl: vi.fn(),
}))

vi.mock('react-leaflet', () => ({
  useMap: () => ({
    flyTo: vi.fn(),
    getPane: vi.fn(() => ({ style: {} })),
    createPane: vi.fn(() => ({ style: {} })),
  }),
  useMapEvents: () => null,
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Polygon: ({
    children,
    pane,
    interactive,
  }: {
    children: ReactNode
    pane?: string
    interactive?: boolean
  }) => (
    <div data-testid="gbs-zone" data-pane={pane} data-interactive={String(interactive)}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@features/gbs/hooks', () => ({
  gbsKeys: { containers: () => [], updates: () => [], myUpdates: () => [], jurisdiction: () => [] },
  useGbsContainers: () => ({ data: h.containers, isLoading: false }),
  useGbsMyUpdates: () => ({ data: h.myUpdates, isLoading: false }),
  useGbsRequestUpdate: () => ({ mutate: h.request, isPending: false }),
  useGbsZones: () => ({ data: h.zones, isLoading: false }),
  useGbsJurisdiction: () => ({ data: h.jur, isLoading: false }),
}))

vi.mock('@sdk/gbs.sdk', () => ({
  gbs: { uploadImage: h.uploadImage, imageUrl: h.imageUrl },
}))

import GbsContainersPage from '@portals/manager/pages/Gbs/GbsContainersPage'

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
  sectorId: 4,
  areaName: 'الجادرية',
  parentSector: 'karrada',
  ...over,
})

beforeEach(() => {
  h.containers = [container()]
  h.myUpdates = []
  h.zones = []
  h.jur = [4]
  h.request.mockReset()
  h.uploadImage.mockReset()
  h.imageUrl.mockReset()
  h.imageUrl.mockResolvedValue('https://signed/x.jpg')
})

describe('مسؤول القسم — حاويات GBS', () => {
  it('لافتة توضيح أن التحديث لا يُطبق إلا بموافقة غرفة العمليات', () => {
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-approval-banner').textContent).toContain('قيد الانتظار')
    expect(screen.getByTestId('gbs-approval-banner').textContent).toContain('توافق غرفة العمليات')
  })

  it('لافتة نطاق الاختصاص تعرض مناطق المسؤول المسندة إليه', () => {
    h.jur = [4, 6]
    render(<GbsContainersPage />)
    const banner = screen.getByTestId('gbs-jurisdiction-banner')
    expect(banner.textContent).toContain('الجادرية')
    expect(banner.textContent).toContain('الزعفرانية')
    expect(screen.queryByTestId('gbs-jurisdiction-empty')).not.toBeInTheDocument()
  })

  it('مسؤول بلا مناطق مسندة يرى تحذيراً واضحاً', () => {
    h.jur = []
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-jurisdiction-empty').textContent).toContain('لم تُسند إليك أي منطقة')
    expect(screen.queryByTestId('gbs-jurisdiction-banner')).not.toBeInTheDocument()
  })

  it('الزونات في طبقة أدنى من النقاط فتبقى الحاويات قابلة للضغط', () => {
    h.zones = [
      {
        id: 'z1',
        name: 'زون الجادرية',
        source: 'platform',
        color: '#7c3aed',
        polygon: [
          [33.3, 44.4],
          [33.3, 44.5],
          [33.4, 44.5],
        ],
      },
    ]
    render(<GbsContainersPage />)
    const zones = screen.getAllByTestId('gbs-zone')
    expect(zones.length).toBeGreaterThan(0)
    // طبقة مستقلة أدنى من overlayPane(400) — لا تغطي نقاط الحاويات مهما كان ترتيب التحميل
    expect(zones[0]).toHaveAttribute('data-pane', 'gbsZones')
    // وضع العرض: الزون تفاعلي (popup باسم الزون)
    expect(zones[0]).toHaveAttribute('data-interactive', 'true')
    expect(screen.getByText('زون الجادرية')).toBeInTheDocument()
  })

  it('لا يملك أزرار إضافة أو حذف أو تعديل مباشر', () => {
    render(<GbsContainersPage />)
    expect(screen.queryByTestId('gbs-add-container')).not.toBeInTheDocument()
    expect(screen.queryByTestId('gbs-delete-c1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('gbs-edit-c1')).not.toBeInTheDocument()
  })

  it('اقتراح تحديث: يفتح من القائمة ويرسل الحالة المقترحة والملاحظة', () => {
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-list-item-c1'))
    expect(screen.getByText(/اقتراح تحديث · GBS-0001/)).toBeInTheDocument()
    expect(screen.getByText(/الحالة الحالية:/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('gbs-proposed-replace'))
    fireEvent.change(screen.getByTestId('gbs-update-note'), {
      target: { value: 'الغطاء مكسور ويجب الاستبدال' },
    })
    h.request.mockImplementation((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    fireEvent.click(screen.getByTestId('gbs-submit-update'))
    expect(h.request).toHaveBeenCalledWith(
      {
        containerId: 'c1',
        proposedStatus: 'replace',
        photoPath: null,
        note: 'الغطاء مكسور ويجب الاستبدال',
      },
      expect.anything(),
    )
    expect(screen.queryByTestId('gbs-submit-update')).not.toBeInTheDocument()
  })

  it('الحالة المفقودة متاحة كخيار اقتراح', () => {
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-list-item-c1'))
    fireEvent.click(screen.getByTestId('gbs-proposed-missing'))
    fireEvent.click(screen.getByTestId('gbs-submit-update'))
    expect(h.request).toHaveBeenCalledWith(
      expect.objectContaining({ proposedStatus: 'missing' }),
      expect.anything(),
    )
  })

  it('إرفاق صورة اختيارية مع الطلب يمرر مسارها', async () => {
    h.uploadImage.mockResolvedValue('gbs-user/gbs-1-photo.jpg')
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-list-item-c1'))
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('gbs-update-photo'), { target: { files: [file] } })
    await waitFor(() => expect(h.uploadImage).toHaveBeenCalledWith(file))
    fireEvent.click(screen.getByTestId('gbs-submit-update'))
    expect(h.request).toHaveBeenCalledWith(
      expect.objectContaining({ photoPath: 'gbs-user/gbs-1-photo.jpg' }),
      expect.anything(),
    )
  })

  it('سجل طلباتي يعرض الحالات وملاحظات غرفة العمليات', () => {
    h.myUpdates = [
      {
        id: 'u1', containerId: 'c1', code: 'GBS-0001', label: 'حاوية الكرادة',
        proposedStatus: 'damaged', photoPath: null, note: 'تضرر', state: 'approved',
        createdAt: '2026-09-21T08:00:00Z', reviewedAt: '2026-09-21T09:00:00Z', reviewNote: 'تم التحقق',
      },
      {
        id: 'u2', containerId: 'c1', code: 'GBS-0001', label: 'حاوية الكرادة',
        proposedStatus: 'missing', photoPath: null, note: null, state: 'pending',
        createdAt: '2026-09-21T10:00:00Z', reviewedAt: null, reviewNote: null,
      },
    ]
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-my-request-u1').textContent).toContain('معتمد')
    expect(screen.getByTestId('gbs-my-request-u1').textContent).toContain('تم التحقق')
    expect(screen.getByTestId('gbs-my-request-u2').textContent).toContain('قيد الانتظار')
  })

  it('يعرض القاطع والمنطقة في القائمة والpopup', () => {
    render(<GbsContainersPage />)
    expect(screen.getByTestId('gbs-list-item-c1').textContent).toContain('قاطع الكرادة')
    expect(screen.getByTestId('gbs-popup-c1').textContent).toContain('الجادرية')
  })

  it('الضغط على نقطة الحاوية في الخريطة يفتح الاقتراح أيضاً', () => {
    render(<GbsContainersPage />)
    fireEvent.click(screen.getByTestId('gbs-propose-c1'))
    expect(screen.getByTestId('gbs-submit-update')).toBeInTheDocument()
  })
})

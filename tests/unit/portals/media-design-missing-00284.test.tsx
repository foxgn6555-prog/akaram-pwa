/** 00284 — رابط ?open= لتصميم محذوف: لا سبينر أبدي؛ رسالة واضحة وإغلاق الرابط */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

const h = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@features/media/hooks', () => ({
  useDesigns: () => ({ data: [], isLoading: false }),
  useDesignDetail: () => ({ isLoading: false, isError: true, error: new Error('P0001: MEDIA_DESIGN_NOT_FOUND'), data: undefined, refetch: vi.fn() }),
  useUpdateDesign: () => ({ mutate: vi.fn(), isPending: false }), useCompleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhoto: () => ({ mutate: vi.fn(), isPending: false }), useRemoveDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveCoverToLibrary: () => ({ mutate: vi.fn(), isPending: false }), useSetDesignShift: () => ({ mutate: vi.fn(), isPending: false }),
  useMediaCovers: () => ({ data: [], isLoading: false }), useAddMediaCover: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMediaCover: () => ({ mutate: vi.fn(), isPending: false }), useSetMediaCoverStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useTouchMediaCover: () => ({ mutate: vi.fn(), isPending: false }), useAddDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadCover: () => ({ mutate: vi.fn(), isPending: false }), useDeleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveDesignReport: () => ({ mutateAsync: vi.fn(), isPending: false }), useReorderDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useSignedPhotoUrls: () => ({ data: {} }), useSubmissions: () => ({ data: [] }), useSubmissionPhotos: () => ({ data: [], isLoading: false }),
}))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }) }))
import MediaDesignsPage from '@portals/media/pages/Designs/MediaDesignsPage'

function Probe() { const l = useLocation(); return <output data-testid="loc">{l.search}</output> }

describe('00284 — تصميم محذوف في الرابط', () => {
  it('يعرض تنبيهاً ويزيل ?open= ولا يبقى سبينر «جارٍ فتح التصميم»', async () => {
    render(<MemoryRouter initialEntries={['/media/designs?open=deleted-id']}><Routes><Route path="/media/designs" element={<><MediaDesignsPage /><Probe /></>} /></Routes></MemoryRouter>)
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning', message: expect.stringContaining('غير موجود') })))
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent(''))
    expect(screen.queryByText('جارٍ فتح التصميم…')).toBeNull()
  })
})

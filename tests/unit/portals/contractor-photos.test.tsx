/**
 * 00257 — إرسال الصور من بوابة المتعهد: نفس وحدة مسؤول القسم، لكن القاطع/المنطقة من ملف المتعهد (المرتبط بمسؤول قسمه)،
 * ووحدة «إرسال الصور» ضمن الشريط الجانبي للمتعهد، والإرسال يمر بنفس المسار (رفع ثم media_send_photos).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import sidebarAr from '../../../src/i18n/ar/sidebar.json'

const h = vi.hoisted(() => ({ send: vi.fn(), upload: vi.fn(), me: null as Record<string, unknown> | null, sectorCalls: 0 }))
vi.mock('@features/contractors/hooks', () => ({ useContractorMe: () => ({ data: h.me, isLoading: false }) }))
vi.mock('@features/media/hooks', () => ({
  useSendPhotos: () => ({ mutateAsync: h.send, isPending: false }),
  useUploadPhotos: () => ({ mutateAsync: h.upload, isPending: false }),
  useMySubmissions: () => ({ data: [], isLoading: false }),
}))
vi.mock('@sdk/sector.sdk', () => ({
  sector: {
    listSectors: async () => { h.sectorCalls++; return [] },
    myProfile: async () => { h.sectorCalls++; return { sectors: [] } },
  },
}))
vi.mock('@components/ui', () => ({ CameraCapture: () => null }))
import ContractorPhotosPage from '@portals/employee/pages/Photos/ContractorPhotosPage'

const me = { user_id: 'c1', full_name: 'متعهد الرياض', manager_user_id: 'm1', manager_name: 'مسؤول الرياض', sector_id: 2, area_name: 'الرياض', parent_sector: 'karrada', shift: 'morning', workers_count: 3, today: '2026-10-15', checked_in_today: true }
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)

beforeEach(() => {
  h.send.mockReset(); h.upload.mockReset(); h.sectorCalls = 0; h.me = { ...me }
  h.upload.mockResolvedValue(['c1/a.jpg']); h.send.mockResolvedValue({ id: 's1' })
  URL.createObjectURL = vi.fn(() => 'blob:mock') as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
})

describe('إرسال الصور — بوابة المتعهد (00257)', () => {
  it('الشريط الجانبي للمتعهد يحوي وحدة «إرسال الصور» رابعةً بعد الثلاث الأصلية', () => {
    const units = PORTAL_UNITS[PORTALS.EMPLOYEE]
    expect(units.map((u) => u.path)).toEqual(['/employee', '/employee/team', '/employee/attendance', '/employee/photos'])
    expect((sidebarAr as { nav: Record<string, string> }).nav.contractor_photos).toBe('إرسال الصور')
  })

  it('القاطع والقسم من ملف المتعهد (منطقته + مسؤول قسمه) — لا يُستدعى ملف مسؤول القسم، ونفس نموذج مسؤول القسم', async () => {
    wrap(<ContractorPhotosPage />)
    const root = screen.getByTestId('contractor-photos')
    expect(root.getAttribute('data-sector')).toBe('2')
    expect(root.getAttribute('data-manager')).toBe('m1')
    expect(screen.getByTestId('photos-page')).toHaveTextContent('الكرادة')
    expect(screen.getByTestId('photos-page')).toHaveTextContent('الرياض (مسؤول القسم: مسؤول الرياض)')
    expect(screen.getByTestId('mode-street')).toBeInTheDocument()
    expect(screen.getByTestId('mode-campaign')).toBeInTheDocument()
    expect(screen.getByTestId('mode-school')).toBeInTheDocument()
    expect(screen.getByTestId('photo-form')).toBeInTheDocument()
    await waitFor(() => expect(h.sectorCalls).toBe(0))
  })

  it('الإرسال يمر بنفس مسار مسؤول القسم: رفع الصور ثم media_send_photos بالوضع والعنوان', async () => {
    wrap(<ContractorPhotosPage />)
    fireEvent.change(screen.getByTestId('f-photo-title'), { target: { value: 'تنظيف شارع الرياض' } })
    const input = screen.getByTestId('f-photo-files') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(8)], 'a.jpg', { type: 'image/jpeg' })] } })
    fireEvent.submit(screen.getByTestId('photo-form'))
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(1))
    expect(h.upload).toHaveBeenCalledTimes(1)
    const args = h.send.mock.calls[0]?.[0] as unknown[]
    expect(args[0]).toBe('street')
    expect(args[1]).toBe('تنظيف شارع الرياض')
  })

  it('بلا تعيين: رسالة واضحة ولا نموذج', () => {
    h.me = null
    wrap(<ContractorPhotosPage />)
    expect(screen.getByText('لم تُعيَّن بعد متعهداً على منطقة')).toBeInTheDocument()
    expect(screen.queryByTestId('photo-form')).toBeNull()
  })
})

/** غرفة العمليات — عارض إثباتات تواجد المتعهدين: قراءة فقط، صور موقّعة، فلاتر، ولا أزرار تصحيح/اعتماد. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { PERMISSION_UNIT_KEYS, UNIT_ACTIONS } from '@config/permission-catalog'
import sidebar from '../../../src/i18n/ar/sidebar.json'
import type { ContractorPresenceProofRow } from '@sdk/ops-contractor-headcounts.sdk'

const h = vi.hoisted(() => ({ proofs: vi.fn(), error: null as unknown }))
const ROWS: ContractorPresenceProofRow[] = [
  { contractor_user_id: 'c1', contractor_name: 'متعهد أ', contractor_phone: '07701', sector_id: 1, area_name: 'أرخيته', parent_sector: 'karrada', shift: 'morning', department_manager_name: 'مسؤول القسم أ',
    checked_in: true, checkin_at: '2026-11-14T04:00:00Z', latitude: 33.3, longitude: 44.4, accuracy_m: 6, in_zone: true, selfie_path: 'c1/s.jpg', team_photo_path: 'c1/t.jpg',
    contractor_headcount: 16, follow_up_headcount: 15, sector_manager_headcount: 14 },
  { contractor_user_id: 'c2', contractor_name: 'متعهد ب', contractor_phone: null, sector_id: 5, area_name: 'السندباد', parent_sector: 'zaafaraniya', shift: 'evening', department_manager_name: null,
    checked_in: false, checkin_at: null, latitude: null, longitude: null, accuracy_m: null, in_zone: null, selfie_path: null, team_photo_path: null,
    contractor_headcount: 12, follow_up_headcount: null, sector_manager_headcount: null },
]
vi.mock('@features/ops-contractor-headcounts/hooks', () => ({ useContractorPresenceProofs: (date: string, parent: string | null) => h.proofs(date, parent) }))
vi.mock('@features/contractors/hooks', () => ({ useContractorPhotoUrl: (p: string | null) => ({ data: p ? `https://signed/${p}` : undefined, isError: false }) }))
vi.mock('@features/sectors', () => ({ useParentSectors: () => ({ parents: [{ code: 'karrada', title: 'قاطع الكرادة' }, { code: 'zaafaraniya', title: 'قاطع الزعفرانية' }] }) }))
import OpsContractorPresenceProofsPage from '@portals/ops-room/pages/ContractorProofs/OpsContractorPresenceProofsPage'

const mount = () => render(<MemoryRouter><OpsContractorPresenceProofsPage /></MemoryRouter>)

beforeEach(() => {
  h.error = null
  h.proofs.mockReset().mockImplementation(() => ({ data: ROWS, isLoading: false, error: h.error }))
})

describe('OpsContractorPresenceProofsPage', () => {
  it('الوحدة مسجلة في الشريط/الكتالوج بصلاحية عرض فقط', () => {
    expect(PORTAL_UNITS[PORTALS.OPS_ROOM].find((u) => u.path === '/ops-room/contractor-proofs')).toMatchObject({ labelKey: 'nav.ops_contractor_proofs', icon: 'camera' })
    expect(sidebar.nav.ops_contractor_proofs).toBe('إثباتات تواجد المتعهدين')
    expect(PERMISSION_UNIT_KEYS.has('ops-room.contractor-proofs')).toBe(true)
    expect(UNIT_ACTIONS['ops-room.contractor-proofs']).toBeUndefined()
  })
  it('يعرض الإثباتات والصور الموقّعة والأعداد الثلاثة بلا أي إدخال/حفظ/اعتماد', () => {
    mount()
    const c1 = screen.getByTestId('proof-c1'), c2 = screen.getByTestId('proof-c2')
    expect(screen.getByTestId('proof-readonly-badge')).toHaveTextContent('قراءة فقط')
    expect(within(c1).getByTestId('proof-checkin-badge')).toHaveTextContent('تواجد')
    expect(within(c1).getByTestId('proof-location')).toHaveTextContent('داخل نطاق المنطقة')
    expect(within(c1).getByTestId('proof-location')).toHaveTextContent('±6 م')
    expect(within(c1).getByTestId('proof-map-link')).toHaveAttribute('href', 'https://www.google.com/maps?q=33.3,44.4')
    expect(within(c1).getByTestId('proof-photo-selfie').querySelector('img')).toHaveAttribute('src', 'https://signed/c1/s.jpg')
    expect(within(c1).getByTestId('proof-photo-team').querySelector('img')).toHaveAttribute('src', 'https://signed/c1/t.jpg')
    expect(within(c1).getByTestId('proof-contractor-headcount')).toHaveTextContent('16')
    expect(within(c1).getByTestId('proof-follow-up-headcount')).toHaveTextContent('15')
    expect(within(c1).getByTestId('proof-sector-manager-headcount')).toHaveTextContent('14')
    expect(within(c2).getByTestId('proof-checkin-badge')).toHaveTextContent('لم يُثبت التواجد')
    expect(screen.queryByTestId('headcount-input')).toBeNull()
    expect(screen.queryByTestId('headcount-save')).toBeNull()
    expect(screen.queryByTestId('correct-dialog')).toBeNull()
    expect(screen.queryByTestId('approve-btn')).toBeNull()
    expect(screen.getByTestId('proof-st-proved')).toHaveTextContent('1/2')
  })
  it('فلتر المتعهد يخفي الآخر؛ تكبير الصورة يفتح عارضاً ويُغلق بـ Escape', () => {
    mount()
    fireEvent.change(screen.getByTestId('proof-contractor-filter'), { target: { value: 'c2' } })
    expect(screen.queryByTestId('proof-c1')).toBeNull()
    expect(screen.getByTestId('proof-c2')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('proof-contractor-filter'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('proof-photo-selfie'))
    expect(screen.getByTestId('proof-photo-selfie-lightbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('proof-photo-selfie-lightbox')).toBeNull()
  })
  it('خطأ الاستعلام يظهر رسالة عربية ولا يختلق إثباتات', () => {
    h.error = new Error('OPS_ROOM_FORBIDDEN')
    h.proofs.mockImplementation(() => ({ data: undefined, isLoading: false, error: h.error }))
    mount()
    expect(screen.getByTestId('proof-error')).toHaveTextContent('غرفة العمليات فقط')
    expect(screen.queryByTestId('proofs-list')).toBeNull()
  })
})

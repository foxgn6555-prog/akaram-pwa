import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ save: vi.fn(), profile: null as Record<string, unknown> | null }))
vi.mock('@features/sector-manager/hooks', () => ({
  useSectorManagerProfile: () => ({ data: h.profile }),
  useSectorManagerOptions: () => ({ data: [
    { parent_sector: 'karrada', name: 'الكرادة', areas: 4, department_managers: 2, sector_managers: [] },
    { parent_sector: 'zaafaraniya', name: 'الزعفرانية', areas: 4, department_managers: 1, sector_managers: [{ user_id: 'o', name: 'سعد' }] },
  ] }),
  useSaveSectorManagerProfile: () => ({ mutate: h.save, isPending: false }),
}))
import { SectorManagerCard } from '@portals/it/pages/UserManagement/SectorManagerCard'

describe('بطاقة قواطع مسؤول القاطع', () => {
  it('بلا إسناد: تنبيه؛ اختيار قاطعين وحفظهما', () => {
    render(<SectorManagerCard userId="u1" />)
    expect(screen.getByTestId('sm-none')).toBeInTheDocument()
    expect(screen.getByTestId('sm-save')).toBeDisabled()
    expect(screen.getByTestId('sm-opt-zaafaraniya')).toHaveTextContent('يشغله: سعد')
    fireEvent.click(screen.getByTestId('sm-opt-karrada')); fireEvent.click(screen.getByTestId('sm-opt-zaafaraniya'))
    fireEvent.click(screen.getByTestId('sm-save'))
    expect(h.save).toHaveBeenCalledWith({ userId: 'u1', parentSectors: ['karrada', 'zaafaraniya'] })
  })
  it('مع إسناد: يعرض الحالي ويُحمّله مسبقاً', () => {
    h.profile = { user_id: 'u1', parent_sectors: ['karrada'], parent_names: ['الكرادة'], notes: null, updated_at: 'x' }
    render(<SectorManagerCard userId="u1" />)
    expect(screen.getByTestId('sm-current')).toHaveTextContent('الكرادة')
    expect(screen.getByTestId('sm-opt-karrada')).toHaveAttribute('aria-pressed', 'true')
  })
})

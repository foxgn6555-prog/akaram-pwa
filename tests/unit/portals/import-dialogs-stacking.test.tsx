/** عقد: حوارات الاستيراد تُعرض عبر portal في body وبطبقة أعلى من خريطة Leaflet (z ≥ 2100) حتى لا تتداخل مع الخريطة */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('@features/gbs/hooks', () => ({ useGbsImport: () => ({ mutate: vi.fn(), isPending: false }), useGbsExport: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@features/central-garage/hooks', () => ({ useFleetImport: () => ({ mutate: vi.fn(), isPending: false }), useFleetExport: () => ({ mutate: vi.fn(), isPending: false }) }))
import { GbsImportDialog } from '@portals/ops-room/pages/Gbs/GbsImportDialog'
import { FleetImportDialog } from '@portals/central-garage/components/FleetImportDialog'

const zOf = (cls: string) => Number(/z-\[(\d+)\]/.exec(cls)?.[1] ?? 0)

describe('تراكب حوارات الاستيراد فوق الخريطة', () => {
  it('حوار الحاويات: في body مباشرة وبطبقة أعلى من الخريطة وملء الشاشة (2200)', () => {
    const { container, getByTestId } = render(<div data-testid="host"><GbsImportDialog onClose={() => {}} /></div>)
    const dlg = getByTestId('gbs-import-dialog')
    expect(container.contains(dlg)).toBe(false); expect(dlg.parentElement).toBe(document.body)
    expect(zOf(dlg.className)).toBeGreaterThan(2200)
  })
  it('حوار الآليات: الشيء نفسه', () => {
    const { container, getByTestId } = render(<div><FleetImportDialog onClose={() => {}} /></div>)
    const dlg = getByTestId('fleet-import-dialog')
    expect(container.contains(dlg)).toBe(false); expect(zOf(dlg.className)).toBeGreaterThan(2200)
  })
  it('كل النوافذ الثابتة في صفحة الحاويات أعلى من طبقات Leaflet (≥ 2100)', () => {
    const src = readFileSync('src/portals/ops-room/pages/Gbs/GbsContainersPage.tsx', 'utf8')
    const fixed = [...src.matchAll(/className="fixed inset-0 ([^"]+)"/g)].map((m) => m[1]!)
    expect(fixed.length).toBeGreaterThan(0)
    for (const cls of fixed) expect(zOf(cls)).toBeGreaterThanOrEqual(2100)
  })
})

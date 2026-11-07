import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { PORTALS } from '@lib/constants/portals.constants'
import { PortalVisualPreview } from '@components/layout/PortalVisualPreview'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@features/auth/hooks/useAuth', () => ({ useLogout: () => ({ mutateAsync: vi.fn() }) }))

function CurrentPath() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

describe('PortalVisualPreview', () => {
  it('renders a data-free preview instead of portal records', () => {
    render(
      <MemoryRouter initialEntries={['/ops-room/gbs-containers']}>
        <PortalVisualPreview portal={PORTALS.OPS_ROOM} />
        <CurrentPath />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('portal-visual-preview')).toBeInTheDocument()
    expect(screen.getByText('وضع المعاينة — بلا بيانات')).toBeInTheDocument()
    expect(screen.getByText('لا توجد بيانات في المعاينة')).toBeInTheDocument()
    expect(screen.queryByText('GBS-0001')).not.toBeInTheDocument()
  })

  it('navigates through static menu entries without leaving preview mode', () => {
    render(
      <MemoryRouter initialEntries={['/ops-room']}>
        <PortalVisualPreview portal={PORTALS.OPS_ROOM} />
        <CurrentPath />
      </MemoryRouter>,
    )

    const gbsMenu = screen.getAllByRole('button', { name: 'nav.ops_gbs_containers' })[0]
    if (!gbsMenu) throw new Error('GBS menu entry is missing from the preview navigation')
    fireEvent.click(gbsMenu)
    expect(screen.getByTestId('current-path')).toHaveTextContent('/ops-room/gbs-containers')
    expect(screen.getByText('لا توجد بيانات في المعاينة')).toBeInTheDocument()
  })
})

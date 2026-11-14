import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('leaflet', () => ({ default: { divIcon: (options: unknown) => ({ options }) } }))
vi.mock('react-leaflet', () => {
  const map = { getContainer: () => document.querySelector('[data-testid="gbs-leaflet-map"]'), getZoom: () => 12, flyTo: vi.fn(), flyToBounds: vi.fn() }
  return {
    useMap: () => map,
    useMapEvents: () => map,
    MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="gbs-leaflet-map">{children}</div>,
    TileLayer: ({ url }: { url: string }) => <i data-testid="gbs-tile" data-url={url} />,
    Marker: () => null,
    Polygon: () => null,
    CircleMarker: () => null,
    Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  }
})

import GbsMap from '@features/gbs/GbsMap'

describe('GBS containers map dark labels', () => {
  afterEach(() => window.localStorage.removeItem('akaram.map-theme'))

  it('prefers filtered OSM in dark mode for clearer street labels', () => {
    render(<GbsMap containers={[]} zones={[]} />)
    expect(screen.getByTestId('gbs-leaflet-map').getAttribute('data-tiles')).toBe('osm')
    fireEvent.click(screen.getByTestId('gbs-map-theme'))
    expect(screen.getByTestId('gbs-leaflet-map').getAttribute('data-tiles')).toBe('osm-filtered')
    expect(screen.getByTestId('gbs-map').getAttribute('data-map-theme')).toBe('dark')
  })
})

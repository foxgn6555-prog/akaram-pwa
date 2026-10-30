/** 00388-د — الخرائط الثانوية (محرر الزونات، منتقي المعالم) تشارك زر النهاري/الليلي الموحّد */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('leaflet', () => ({ default: { latLngBounds: vi.fn((p: unknown) => p), divIcon: vi.fn(() => ({})), icon: vi.fn(() => ({})) } }))
vi.mock('react-leaflet', () => ({
  useMap: () => null, useMapEvents: () => null,
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: ({ url }: { url: string }) => <i data-testid="tile" data-url={url} />,
  Polygon: () => null, Polyline: () => null, Circle: () => null, CircleMarker: () => null, Marker: () => null, Popup: () => null, Tooltip: () => null,
}))
vi.mock('@portals/ops-room/pages/Gps/LandmarkIcon', () => ({ landmarkDivIcon: () => ({}) }))
import ZoneMapEditor from '@portals/ops-room/pages/Gps/ZoneMapEditor'
import LandmarkMapPicker from '@portals/ops-room/pages/Gps/LandmarkMapPicker'

describe('00388-د · الخرائط الثانوية', () => {
  afterEach(() => { window.localStorage.removeItem('akaram.map-theme') })
  it('محرر الزونات: زر الوضع يبدّل البلاطات ويحفظ الاختيار', () => {
    render(<ZoneMapEditor points={[]} color="#f00" shape="polygon" zones={[]} landmarks={[]} vehicles={[]} onShapeChange={() => {}} onChange={() => {}} />)
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('openstreetmap')
    fireEvent.click(screen.getByTestId('zone-editor-theme'))
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('dark')
    expect(window.localStorage.getItem('akaram.map-theme')).toBe('dark')
  })
  it('منتقي المعالم: يقرأ الوضع المحفوظ (ليلي) ويعود للنهاري بالزر', () => {
    window.localStorage.setItem('akaram.map-theme', 'dark')
    render(<LandmarkMapPicker point={null} color="#f00" icon="pin" zones={[]} landmarks={[]} vehicles={[]} onChange={() => {}} />)
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('dark')
    fireEvent.click(screen.getByTestId('landmark-picker-theme'))
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('openstreetmap')
  })
})

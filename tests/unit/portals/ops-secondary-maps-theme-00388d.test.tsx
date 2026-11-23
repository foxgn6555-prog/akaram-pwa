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
  /*
   * ⚠ كان هذان الاختباران يثبّتان أن أول بلاطة ليلية هي `World_Dark_Gray_Base`
   * (Esri). وهي **خدمة خلفية** أسموتية: أرضية وماء وحدود إدارية بلا طبقة طرق.
   * فكان الوضع الليلي يعرض «خطوطاً رمادية صمّاء» بلا أسماء — ووصف المشغّل ذلك
   * بأن «التخطيط يختلف» عن النهاري.
   *
   * الصواب أن يبقى **نفس مصدر البلاطات (OSM)** في الوضعين، والفرق ألوان
   * فقط (فلتر CSS). Esri تصير تراجعاً عند فشل OSM.
   */
  it('محرر الزونات: زر الوضع يبدّل البلاطات (OSM مفلتر) ويحفظ الاختيار', () => {
    render(<ZoneMapEditor points={[]} color="#f00" shape="polygon" zones={[]} landmarks={[]} vehicles={[]} onShapeChange={() => {}} onChange={() => {}} />)
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('openstreetmap')
    fireEvent.click(screen.getByTestId('zone-editor-theme'))
    // نفس المصدر: الهندسة والأسماء مطابقة للنهاري، الألوان فقط تتغيّر
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('openstreetmap')
    expect(window.localStorage.getItem('akaram.map-theme')).toBe('dark')
  })
  it('منتقي المعالم: يقرأ الوضع المحفوظ (ليلي) ويعود للنهاري بالزر', () => {
    window.localStorage.setItem('akaram.map-theme', 'dark')
    render(<LandmarkMapPicker point={null} color="#f00" icon="pin" zones={[]} landmarks={[]} vehicles={[]} onChange={() => {}} />)
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('openstreetmap')
    fireEvent.click(screen.getByTestId('landmark-picker-theme'))
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('openstreetmap')
  })
})

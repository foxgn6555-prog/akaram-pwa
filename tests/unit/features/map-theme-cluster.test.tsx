/** 00388-أ — وضع الخريطة الموحّد (محفوظ ومتزامن) + التجميع الشبكي + أحجام علامات الحاويات */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clusterPoints, clusterSizePx, conicByShare, project, CLUSTER_MIN_TOTAL } from '@features/map-theme/cluster'
import { DARK_TILES, LIGHT_TILES, MAP_THEME_KEY, readMapTheme, writeMapTheme } from '@features/map-theme/map-theme'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import { containerIcon, containerSizePx, clusterIcon } from '@features/gbs/GbsMap'
import type { GbsContainer } from '@features/gbs/types'

const pts = (n: number, lat = 33.3, lng = 44.4, spread = 0.0005) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, lat: lat + (i % 7) * spread, lng: lng + Math.floor(i / 7) * spread, item: i }))
afterEach(() => localStorage.removeItem(MAP_THEME_KEY))

describe('map theme (00388)', () => {
  it('القراءة/الكتابة محفوظة في المتصفح والافتراضي حسب الخريطة', () => {
    expect(readMapTheme('light')).toBe('light'); expect(readMapTheme('dark')).toBe('dark')
    writeMapTheme('dark'); expect(readMapTheme('light')).toBe('dark')
    localStorage.setItem(MAP_THEME_KEY, 'weird'); expect(readMapTheme('light')).toBe('light')
  })
  it('الخطاف يتزامن بين خريطتين مفتوحتين في الصفحة نفسها', () => {
    const a = renderHook(() => useMapTheme('light')), b = renderHook(() => useMapTheme('dark'))
    expect(a.result.current[0]).toBe('light'); expect(b.result.current[0]).toBe('dark')
    act(() => a.result.current[2]())
    expect(a.result.current[0]).toBe('dark'); expect(b.result.current[0]).toBe('dark')
    act(() => b.result.current[1]('light'))
    expect(a.result.current[0]).toBe('light')
  })
  it('سلسلة الخلفيات الداكنة تنتهي بـ OSM مفلتراً، والنهارية OSM', () => {
    expect(DARK_TILES.at(-1)).toMatchObject({ id: 'osm-filtered', filter: true }); expect(LIGHT_TILES.id).toBe('osm')
  })
})

describe('grid clustering (00388-أ)', () => {
  it('إسقاط Web Mercator: الشرق أكبر x، الشمال أصغر y، ويتضاعف مع كل مستوى', () => {
    const a = project(33.3, 44.4, 12), b = project(33.4, 44.5, 12), c = project(33.3, 44.4, 13)
    expect(b.x).toBeGreaterThan(a.x); expect(b.y).toBeLessThan(a.y); expect(c.x / a.x).toBeCloseTo(2, 6)
  })
  it('أقل من الحد الأدنى ⇒ لا تجميع؛ فوق مستوى 17 ⇒ لا تجميع؛ وإلا تتجمّع المتقاربة', () => {
    const few = clusterPoints(pts(CLUSTER_MIN_TOTAL - 1), 12)
    expect(few.clusters.length).toBe(0); expect(few.singles.length).toBe(CLUSTER_MIN_TOTAL - 1)
    const many = clusterPoints(pts(200), 12)
    expect(many.clusters.length).toBeGreaterThan(0)
    expect(many.clusters.reduce((a, c) => a + c.count, 0) + many.singles.length).toBe(200)
    expect(many.clusters[0]!.bounds[0][0]).toBeLessThanOrEqual(many.clusters[0]!.lat)
    expect(clusterPoints(pts(200), 17).clusters.length).toBe(0)
    // بعيدة جداً ⇒ منفردة حتى مع الكثرة
    const far = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, lat: 33 + i * 0.2, lng: 44 + i * 0.2, item: i }))
    expect(clusterPoints(far, 12).clusters.length).toBe(0)
  })
  it('التقريب يفكك المجموعات: عدد المجموعات لا يقل عند التصغير', () => {
    const z12 = clusterPoints(pts(300, 33.3, 44.4, 0.002), 12), z15 = clusterPoints(pts(300, 33.3, 44.4, 0.002), 15)
    expect(z12.clusters.length).toBeLessThanOrEqual(z15.clusters.length + z15.singles.length)
    expect(z15.singles.length).toBeGreaterThan(z12.singles.length)
  })
  it('حجم الدائرة ونِسب الحالات', () => {
    expect(clusterSizePx(2)).toBe(32); expect(clusterSizePx(5000)).toBe(56)
    expect(conicByShare([{ color: '#1', count: 3 }, { color: '#2', count: 1 }])).toBe('conic-gradient(#1 0.0deg 270.0deg, #2 270.0deg 360.0deg)')
    expect(conicByShare([])).toContain('#64748b')
  })
})

describe('container markers (00388-أ)', () => {
  const c = { id: 'x1', code: 'K-1', label: 'ح', latitude: 33.3, longitude: 44.4, status: 'ok', areaName: 'أ', parentSector: 'karrada' } as unknown as GbsContainer
  it('الحجم يكبر مع التقريب: نقطة بلا رمز ≤ 13 وسلة من 14', () => {
    expect(containerSizePx(11)).toBe(7); expect(containerSizePx(14)).toBe(12); expect(containerSizePx(17)).toBe(24)
    expect(containerIcon(c, false, 12).options.html as string).toContain('gbs-bin--dot')
    expect(containerIcon(c, false, 15).options.html as string).not.toContain('gbs-bin--dot')
    expect(containerIcon(c, false, 15).options.html as string).toContain('<svg')
    expect(containerIcon(c, true, 11).options.html as string).toContain('gbs-bin--selected')
    expect(containerIcon(c, false, 15)).toBe(containerIcon(c, false, 15))   // ذاكرة
  })
  it('أيقونة المجموعة تحمل العدد والتدرّج', () => {
    const html = clusterIcon(37, [{ color: '#16a34a', count: 30 }, { color: '#dc2626', count: 7 }], 'k').options.html as string
    expect(html).toContain('>37<'); expect(html).toContain('conic-gradient'); expect(html).toContain('data-count="37"')
  })
})

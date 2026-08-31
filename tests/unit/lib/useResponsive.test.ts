/**
 * اختبارات خطاف تجاوب الشاشات useResponsive
 *  · نقاط التوقف الصحيحة (موبايل/تابليت/دسكتوب/عريض)
 *  · التفاعل مع تغيير حجم النافذة
 *  · أمان غياب window (الافتراضي دسكتوب)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResponsive, BREAKPOINTS } from '@lib/utils/useResponsive'

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

describe('useResponsive — نقاط التوقف', () => {
  beforeEach(() => setWidth(1280))
  afterEach(() => setWidth(1280))

  it('شاشة هاتف 375px → موبايل', () => {
    setWidth(375)
    const { result } = renderHook(() => useResponsive(375))
    expect(result.current.isMobile).toBe(true)
    expect(result.current.isDesktop).toBe(false)
    expect(result.current.isTabletUp).toBe(false)
  })

  it('شاشة تابليت 768px → ليست موبايل-صغير لكن تحت الدسكتوب', () => {
    const { result } = renderHook(() => useResponsive(768))
    expect(result.current.isTabletUp).toBe(true)
    expect(result.current.isMobile).toBe(true) // أقل من lg=1024
    expect(result.current.isDesktop).toBe(false)
  })

  it('شاشة لابتوب 1024px → دسكتوب (حد lg)', () => {
    const { result } = renderHook(() => useResponsive(1024))
    expect(result.current.isDesktop).toBe(true)
    expect(result.current.isMobile).toBe(false)
  })

  it('شاشة عريضة 1440px → isWide', () => {
    const { result } = renderHook(() => useResponsive(1440))
    expect(result.current.isWide).toBe(true)
    expect(result.current.isDesktop).toBe(true)
  })

  it('الحد الأدنى للموبايل 320px (iPhone SE) → isMobile', () => {
    const { result } = renderHook(() => useResponsive(320))
    expect(result.current.isMobile).toBe(true)
  })
})

describe('useResponsive — التفاعل مع resize', () => {
  beforeEach(() => setWidth(1440))
  afterEach(() => setWidth(1440))

  it('يتحدّث من الدسكتوب إلى الموبايل عند تصغير النافذة', () => {
    setWidth(1280)
    const { result } = renderHook(() => useResponsive())
    expect(result.current.isDesktop).toBe(true)

    act(() => {
      setWidth(500)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.isMobile).toBe(true)
    expect(result.current.width).toBe(500)
    expect(result.current.isDesktop).toBe(false)
  })

  it('يستجيب لتغيير اتجاه الجهاز (orientationchange)', () => {
    setWidth(900)
    const { result } = renderHook(() => useResponsive())

    act(() => {
      setWidth(412)
      window.dispatchEvent(new Event('orientationchange'))
    })

    expect(result.current.isMobile).toBe(true)
  })
})

describe('useResponsive — ثوابت النقاط', () => {
  it('النقاط مطابقة لـ Tailwind (sm640 · md768 · lg1024 · xl1280)', () => {
    expect(BREAKPOINTS).toEqual({ sm: 640, md: 768, lg: 1024, xl: 1280 })
  })
})

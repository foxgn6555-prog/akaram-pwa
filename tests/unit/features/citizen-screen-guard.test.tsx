/** رادع لقطات الشاشة (00169): اختصارات اللقطة/الطباعة، التمويه عند فقدان التركيز، تفريغ الحافظة، التنظيف عند الإلغاء */
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { isCaptureShortcut, SCREEN_GUARD_NOTICE, useScreenGuard } from '@features/citizen/screen-guard'

const k = (o: Partial<KeyboardEvent>) => ({ key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, ...o })

describe('isCaptureShortcut', () => {
  it('يتعرّف على PrintScreen وCtrl+P وCtrl/⌘+Shift+S و⌘⇧3/4/5 ولا يعترض الكتابة العادية', () => {
    expect(isCaptureShortcut(k({ key: 'PrintScreen' }))).toBe(true)
    expect(isCaptureShortcut(k({ code: 'PrintScreen' }))).toBe(true)
    expect(isCaptureShortcut(k({ key: 'p', ctrlKey: true }))).toBe(true)
    expect(isCaptureShortcut(k({ key: 'S', ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isCaptureShortcut(k({ key: '4', metaKey: true, shiftKey: true }))).toBe(true)
    expect(isCaptureShortcut(k({ key: 's', metaKey: true, shiftKey: true }))).toBe(true)
    expect(isCaptureShortcut(k({ key: 'a' }))).toBe(false)
    expect(isCaptureShortcut(k({ key: 's', ctrlKey: true }))).toBe(false)
    expect(isCaptureShortcut(k({ key: 'Enter' }))).toBe(false)
  })
})

describe('useScreenGuard', () => {
  it('يموّه عند إخفاء التبويب/فقدان التركيز ويعيد الوضوح عند العودة؛ PrintScreen يفرّغ الحافظة ويُظهر الإشعار', async () => {
    vi.useFakeTimers()
    const write = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    const el = document.createElement('div'); document.body.appendChild(el)
    const { result } = renderHook(() => useScreenGuard(useRef(el), true))
    expect(result.current.blurred).toBe(false)
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(result.current.blurred).toBe(true)
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current.blurred).toBe(false)
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current.blurred).toBe(true)
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current.blurred).toBe(false)
    const ev = new KeyboardEvent('keydown', { key: 'PrintScreen', cancelable: true })
    act(() => { window.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(write).toHaveBeenCalledWith('')
    expect(result.current.notice).toBe(SCREEN_GUARD_NOTICE)
    expect(result.current.blurred).toBe(true)
    act(() => { vi.advanceTimersByTime(1300) })
    expect(result.current.blurred).toBe(false)
    act(() => { vi.advanceTimersByTime(4000) })
    expect(result.current.notice).toBeNull()
    // النسخ داخل العنصر ممنوع
    const cp = new Event('copy', { cancelable: true }); act(() => { el.dispatchEvent(cp) }); expect(cp.defaultPrevented).toBe(true)
    vi.useRealTimers()
  })
  it('معطّل ⇒ لا مستمعات (لا تمويه)؛ والإلغاء يزيل المستمعات', () => {
    const el = document.createElement('div')
    const { result, unmount } = renderHook(() => useScreenGuard(useRef(el), false))
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(result.current.blurred).toBe(false)
    const on = renderHook(() => useScreenGuard(useRef(el), true))
    on.unmount(); unmount()
    const cp = new Event('copy', { cancelable: true }); el.dispatchEvent(cp); expect(cp.defaultPrevented).toBe(false)
  })
})

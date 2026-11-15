/** أزرار الرجوع/التقدم/التحديث للكمبيوتر فقط، داخل الهيدر ولا صف مستقل. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { PwaNavControls } from '@features/pwa/PwaNavControls'

function App({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <>
      <PwaNavControls onRefresh={onRefresh} />
      <Link to="/two">اذهب إلى اثنين</Link>
      <Routes>
        <Route path="/" element={<div>واحد</div>} />
        <Route path="/two" element={<div>اثنين</div>} />
      </Routes>
    </>
  )
}

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function setViewport(width: number, userAgent = DESKTOP_UA): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent })
  Object.defineProperty(window.navigator, 'platform', { configurable: true, value: userAgent === IOS_UA ? 'iPhone' : 'Win32' })
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: userAgent === DESKTOP_UA ? 0 : 5 })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  setViewport(1280)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

describe('PwaNavControls — كمبيوتر فقط', () => {
  it('يظهر على شاشة الكمبيوتر حتى في المتصفح العادي', () => {
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.getByTestId('pwa-nav-controls')).toBeInTheDocument()
  })
  it('لا يظهر على الهاتف عموديًا ولا أفقيًا حتى لو كان عرض النافذة كبيرًا', () => {
    setViewport(390, ANDROID_UA)
    const phone = render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.queryByTestId('pwa-nav-controls')).toBeNull()
    phone.unmount()
    setViewport(1280, ANDROID_UA)
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.queryByTestId('pwa-nav-controls')).toBeNull()
  })
  it('لا يظهر على iPhone/iPad حتى بعرض كبير', () => {
    setViewport(1180, IOS_UA)
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.queryByTestId('pwa-nav-controls')).toBeNull()
  })
  it('رجوع معطّل أول صفحة، ثم يتفعّل بعد التنقل؛ التقدم يعمل بعد الرجوع؛ التحديث يعيد التحميل', async () => {
    const reload = vi.fn()
    render(<BrowserRouter><App onRefresh={reload} /></BrowserRouter>)
    expect(screen.getByTestId('pwa-nav-back')).toBeDisabled()
    expect(screen.getByTestId('pwa-nav-forward')).toBeDisabled()
    fireEvent.click(screen.getByText('اذهب إلى اثنين'))
    expect(screen.getByTestId('pwa-nav-back')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('pwa-nav-back'))
    await screen.findByText('واحد', { exact: true })
    expect(screen.getByTestId('pwa-nav-forward')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('pwa-nav-forward'))
    await screen.findByText('اثنين', { exact: true })
    fireEvent.click(screen.getByTestId('pwa-nav-refresh'))
    expect(reload).toHaveBeenCalledOnce()
  })
})

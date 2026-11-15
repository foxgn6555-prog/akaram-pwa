/** أزرار الرجوع/التقدم/التحديث داخل التطبيق المثبّت فقط. */
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

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: query.includes('standalone'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }))
})
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

describe('PwaNavControls', () => {
  it('لا يظهر في وضع المتصفح العادي', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }))
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(screen.queryByTestId('pwa-nav-controls')).toBeNull()
  })
  it('في standalone: رجوع معطّل أول صفحة، ثم يتفعّل بعد التنقل؛ التقدم يعمل بعد الرجوع؛ التحديث يعيد التحميل', async () => {
    const reload = vi.fn()
    render(<BrowserRouter><App onRefresh={reload} /></BrowserRouter>)
    expect(screen.getByTestId('pwa-nav-back')).toBeDisabled()
    expect(screen.getByTestId('pwa-nav-forward')).toBeDisabled()
    fireEvent.click(screen.getByText('اذهب إلى اثنين'))
    expect(screen.getByTestId('pwa-nav-back')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('pwa-nav-back'))
    // history.back/forward يطلقان popstate لاحقاً (غير متزامن)، بخلاف pushState الفوري.
    await screen.findByText('واحد', { exact: true })
    expect(screen.getByTestId('pwa-nav-forward')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('pwa-nav-forward'))
    await screen.findByText('اثنين', { exact: true })
    fireEvent.click(screen.getByTestId('pwa-nav-refresh'))
    expect(reload).toHaveBeenCalledOnce()
  })
})

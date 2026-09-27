/** تحميل كسول ذاتي الإصلاح: قطعة قديمة → إعادة تحميل مرة واحدة فقط؛ خطأ آخر → يصل إلى حدود الخطأ */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Component, Suspense, type ReactNode } from 'react'
import { isChunkLoadError, lazy, reloadOnce } from '@lib/router/lazy'

class Boundary extends Component<{ children: ReactNode }, { msg: string | null }> {
  state = { msg: null as string | null }
  static getDerivedStateFromError(e: Error) { return { msg: e.message } }
  render() { return this.state.msg ? <p data-testid="boundary">{this.state.msg}</p> : this.props.children }
}
const reload = vi.fn()
beforeEach(() => { sessionStorage.clear(); reload.mockReset(); Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true, configurable: true }) })
afterEach(() => vi.restoreAllMocks())

describe('lazy ذاتي الإصلاح', () => {
  it('يتعرّف على أخطاء القطع القديمة فقط', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: http://x/Page.tsx'))).toBe(true)
    expect(isChunkLoadError(new Error('504 Outdated Optimize Dep'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('HR_FORBIDDEN'))).toBe(false)
  })
  it('قطعة قديمة → إعادة تحميل مرة واحدة، والمحاولة الثانية لنفس القطعة تُظهر الخطأ بدل حلقة لا نهائية', async () => {
    const importer = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /src/portals/deputy/pages/DataAnalysis/DataAnalysisPage.tsx'))
    const Page = lazy(importer)
    render(<Boundary><Suspense fallback="…"><Page /></Suspense></Boundary>)
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('boundary')).toBeNull()         // لا شاشة خطأ: الصفحة تُعاد
    // «بعد» إعادة التحميل: نفس القطعة تفشل مجدداً → لا إعادة ثانية، الخطأ يصل للحدود
    const Page2 = lazy(importer)
    render(<Boundary><Suspense fallback="…"><Page2 /></Suspense></Boundary>)
    await waitFor(() => expect(screen.getByTestId('boundary')).toHaveTextContent('Failed to fetch dynamically imported module'))
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('نجاح التحميل يمسح الحرّاس كي تعمل الحماية في النشر التالي', async () => {
    sessionStorage.setItem('lazy-reload:old', '1')
    const Page = lazy(() => Promise.resolve({ default: () => <p>صفحة</p> }))
    render(<Suspense fallback="…"><Page /></Suspense>)
    await screen.findByText('صفحة')
    expect(sessionStorage.getItem('lazy-reload:old')).toBeNull()
  })
  it('الأخطاء غير المتعلقة بالقطع تمرّ كما هي بلا إعادة تحميل', async () => {
    const Page = lazy(() => Promise.reject(new Error('عطل حقيقي في الصفحة')))
    render(<Boundary><Suspense fallback="…"><Page /></Suspense></Boundary>)
    await waitFor(() => expect(screen.getByTestId('boundary')).toHaveTextContent('عطل حقيقي'))
    expect(reload).not.toHaveBeenCalled()
  })
  it('reloadOnce بمفتاح مستقل لحدث vite:preloadError', () => {
    expect(reloadOnce('preload')).toBe(true); expect(reloadOnce('preload')).toBe(false); expect(reload).toHaveBeenCalledTimes(1)
  })
})

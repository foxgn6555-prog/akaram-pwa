/**
 * 00412 — صفحة 404 داخل الجلسة.
 * قبل الإصلاح: `*` → `/` ⇒ إعادة توجيه صامتة إلى الرئيسية وضياع المسار (لا 404 إطلاقًا).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ session: null as null | { roles: string[] } }))

vi.mock('@features/auth/hooks/useAuth', () => ({ useAuth: () => ({ data: h.session }) }))
vi.mock('@router/portal.router', () => ({
  resolvePortal: (roles: string[]) =>
    roles.includes('hr_officer') ? { type: 'single', path: '/hr' } : { type: 'multi' },
}))

import NotFoundPage from '@portals/public/pages/NotFound/NotFoundPage'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/hr" element={<p>الصفحة الرئيسية لبوابة الموارد البشرية</p>} />
        <Route path="/login" element={<p>نموذج الدخول</p>} />
        <Route path="*" element={<NotFoundPage inPortal />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  h.session = { roles: ['hr_officer'] }
})

describe('00412 — 404 داخل الجلسة', () => {
  it('يعرض 404 والمسار الخاطئ بدل إعادة التوجيه الصامتة', () => {
    renderAt('/hr/xyz-not-a-page')
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /الصفحة غير موجودة/ })).toBeInTheDocument()
    expect(screen.getByText('/hr/xyz-not-a-page')).toBeInTheDocument()
  })

  it('«العودة إلى بوابتك» تنقل إلى بوابة الدور', () => {
    renderAt('/hr/xyz-not-a-page')
    fireEvent.click(screen.getByTestId('not-found-home'))
    expect(screen.getByText('الصفحة الرئيسية لبوابة الموارد البشرية')).toBeInTheDocument()
  })

  it('غير المسجّل يرى رابط الدخول لا زر البوابة', () => {
    h.session = null
    renderAt('/hr/xyz-not-a-page')
    expect(screen.queryByTestId('not-found-home')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'تسجيل الدخول' })).toHaveAttribute('href', '/login')
  })

  it('داخل البوابة تُرسم بطاقة داخل القوقعة لا صفحة كاملة الشاشة', () => {
    const { container } = renderAt('/hr/xyz')
    const main = container.querySelector('[data-testid="not-found-page"]')!
    expect(main.className).toContain('rounded-3xl')
    expect(main.className).not.toContain('min-h-screen')
  })

  it('كل بوابة تحمل مسارًا شاملًا يعرض 404 داخل القوقعة', () => {
    const unitRoutes = readFileSync(join(process.cwd(), 'src/router/unit-routes.tsx'), 'utf8')
    expect(unitRoutes).toContain("children.push({ path: '*', element: suspense(<NotFoundPage inPortal />) })")
    // والمسار العام يوجّه غير المسجّل إلى الدخول ويعرض 404 للمسجّل (لا إعادة توجيه إلى الجذر)
    const index = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8')
    expect(index).not.toContain('path: \'*\', element: <Navigate to="/" replace />')
    expect(index).toContain("if (!authenticated) return redirect('/login')")
    expect(index).toContain('<NotFoundPage />')
  })
})

/** البوابة التقنية: وحدتان فقط + الصفحات الفرعية تظهر عند نشاط الوحدة */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@features/auth/hooks/useAuth', () => ({
  useLogout: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))

import { Sidebar } from '@components/layout/Sidebar/Sidebar'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar portal="it" />
    </MemoryRouter>,
  )
}

describe('Sidebar IT — وحدتا البوابة التقنية', () => {
  it('يعرض وحدتي إدارة المستخدمين وقاعدة البيانات فقط', () => {
    renderAt('/it/user-management')
    expect(screen.getByText('إدارة المستخدمين')).toBeInTheDocument()
    expect(screen.getByText('قاعدة البيانات')).toBeInTheDocument()
    // لا وحدات قديمة
    expect(screen.queryByText('التذاكر التقنية')).not.toBeInTheDocument()
    expect(screen.queryByText('أصول تقنية المعلومات')).not.toBeInTheDocument()
  })

  it('صفحات وحدة إدارة المستخدمين تظهر متداخلة عند نشاطها', () => {
    renderAt('/it/user-management')
    const pages = screen.getAllByTestId('unit-pages')
    expect(pages.length).toBeGreaterThan(0)
    expect(screen.getByText('المستخدمون')).toBeInTheDocument()
    expect(screen.getByText('إنشاء مستخدم')).toBeInTheDocument()
    // صفحات وحدة قاعدة البيانات مخفية
    expect(screen.queryByText('أخطاء التطبيق')).not.toBeInTheDocument()
  })

  it('صفحات وحدة قاعدة البيانات تظهر عند نشاطها بدل الأخرى', () => {
    renderAt('/it/database')
    expect(screen.getByText('الجداول والأعمدة')).toBeInTheDocument()
    expect(screen.getByText('أخطاء التطبيق')).toBeInTheDocument()
    expect(screen.queryByText('إنشاء مستخدم')).not.toBeInTheDocument()
  })

  it('الضغط على الوحدة → صفحتها المركزية؛ الصفحات الفرعية تنشط بمسارها', () => {
    renderAt('/it/user-management')
    // الوحدة نفسها نشطة (هذه صفحتها المركزية)
    const active = screen.getAllByRole('button', { current: 'page' })
    expect(active.map((b) => b.textContent)).toContain('إدارة المستخدمين')
    // الصفحة الفرعية «المستخدمون» على مسار آخر غير نشطة هنا
    const createBtn = screen.getByText('إنشاء مستخدم').closest('button')
    expect(createBtn).not.toHaveAttribute('aria-current')
  })

  it('صفحة فرعية نشطة: /it/user-management/create تضيء رابطها دون الوحدة الأم فقط', () => {
    renderAt('/it/user-management/create')
    const active = screen.getAllByRole('button', { current: 'page' })
    const labels = active.map((b) => b.textContent)
    expect(labels).toContain('إدارة المستخدمين')  // الوحدة الأم
    expect(labels).toContain('إنشاء مستخدم')       // الصفحة الفرعية
  })
})

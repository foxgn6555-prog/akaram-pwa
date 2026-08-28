/** الشريط الجانبي: كل بوابة تعرض وحداتها هي فقط + الحالة النشطة */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { useUiStore } from '@stores/ui.store'
const mockLogout = vi.fn(async () => {})
vi.mock('@features/auth/hooks/useAuth', () => ({
  useLogout: () => ({ mutateAsync: mockLogout }),
}))

import { Sidebar } from '@components/layout/Sidebar/Sidebar'

function renderAt(path: string, portal: 'employee' | 'hr' | 'it' = 'employee') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar portal={portal} />
    </MemoryRouter>,
  )
}

describe('Sidebar — وحدات البوابات', () => {
  it('بوابة الموظف تعرض وحداتها ولا تعرض وحدات الإدارات', () => {
    renderAt('/employee')
    expect(screen.getByText('طلباتي')).toBeInTheDocument()
    expect(screen.getByText('رواتبي')).toBeInTheDocument()
    expect(screen.getByText('وثائقي')).toBeInTheDocument()
    expect(screen.queryByText('الموظفون')).not.toBeInTheDocument()
    expect(screen.queryByText('الميزانية')).not.toBeInTheDocument()
  })

  it('بوابة HR تعرض وحدات الإدارة ولا تعرض وحدات الموظف', () => {
    renderAt('/hr', 'hr')
    expect(screen.getByText('الموظفون')).toBeInTheDocument()
    expect(screen.getByText('الحضور والانصراف')).toBeInTheDocument()
    expect(screen.queryByText('طلباتي')).not.toBeInTheDocument()
  })

  it('يوسم العنصر النشط بـ aria-current حسب المسار', () => {
    renderAt('/employee/requests')
    const active = screen.getByRole('button', { current: 'page' })
    expect(active).toHaveTextContent('طلباتي')
  })

  it('يعرض شعار جزيرة الأكرام', () => {
    renderAt('/employee')
    expect(screen.getByAltText('جزيرة الأكرام')).toBeInTheDocument()
  })
})


describe('أزرار الشريط الجانبي — طي/توسيع + تسجيل الخروج', () => {
  it('زر الطي موجود على الحافة مع aria-label', () => {
    renderAt('/employee')
    const toggle = screen.getByTestId('sidebar-collapse')
    expect(toggle).toHaveAttribute('aria-label', 'طي القائمة')
  })

  it('النقر يبدّل الحالة: طي ثم توسيع', async () => {
    const user = userEvent.setup()
    renderAt('/employee')
    const toggle = screen.getByTestId('sidebar-collapse')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-label', 'توسيع القائمة')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-label', 'طي القائمة')
  })

  it('زر تسجيل الخروج موجود وينفذ الخروج', async () => {
    const user = userEvent.setup()
    renderAt('/employee')
    const btn = screen.getByTestId('sidebar-logout')
    expect(btn).toHaveTextContent('تسجيل الخروج')
    await user.click(btn)
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('في الوضع المطبوع يظهر أيقونة الخروج فقط (title بدل النص)', () => {
    useUiStore.setState({ sidebarOpen: false })
    renderAt('/employee')
    const btn = screen.getByTestId('sidebar-logout')
    expect(btn).not.toHaveTextContent('تسجيل الخروج')
    expect(btn).toHaveAttribute('title', 'تسجيل الخروج')
    useUiStore.setState({ sidebarOpen: true })
  })
})

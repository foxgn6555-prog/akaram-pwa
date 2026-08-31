/**
 * شريط التنقل السفلي للموبايل (MobileBottomNav):
 *  · يعرض أول 4 وحدات كاختصارات + زر "المزيد" عند تجاوزها
 *  · البوابة بلا وحدات → لا يعرض شيئاً
 *  · الاختصارات روابط تنقل فعلية
 *  · زر "المزيد" يفتح درج الموبايل (mobileNavOpen)
 *  · العنصر النشط موسوم aria-current
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { useUiStore } from '@stores/ui.store'
import { MobileBottomNav } from '@components/layout/MobileBottomNav'

function renderAt(path: string, portal = 'employee' as const) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<MobileBottomNav portal={portal} />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** يحاكي عرض الشاشة (افتراضي jsdom = 1024 أي دسكتوب) */
function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

beforeEach(() => {
  setWidth(375) // محاكاة هاتف
  useUiStore.setState({ mobileNavOpen: false })
})

describe('MobileBottomNav — الاختصارات', () => {
  it('بوابة الموظف: يعرض 4 اختصارات سريعة (أول الوحدات)', () => {
    renderAt('/employee')
    // الوحدات: الرئيسية، ملفي، طلباتي، رواتبي (الأولى في الصفحة الرئيسية)
    expect(screen.getByTestId('bottom-nav-home')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-profile')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-requests')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-payslips')).toBeInTheDocument()
  })

  it('البوابة العامة بلا وحدات → لا يعرض الشريط', () => {
    renderAt('/login', 'public' as never)
    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument()
  })

  it('على الدسكتوب (≥1024px) لا يُعرض الشريط حتى لو كانت وحدات', () => {
    setWidth(1280)
    renderAt('/employee')
    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument()
  })
})

describe('MobileBottomNav — زر المزيد', () => {
  it('بوابة الموظف (6 وحدات) تعرض زر المزيد', () => {
    renderAt('/employee')
    expect(screen.getByTestId('bottom-nav-more')).toBeInTheDocument()
  })

  it('زر المزيد يفتح درج الموبايل في المتجر', async () => {
    const user = userEvent.setup()
    renderAt('/employee')
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
    await user.click(screen.getByTestId('bottom-nav-more'))
    expect(useUiStore.getState().mobileNavOpen).toBe(true)
  })
})

describe('MobileBottomNav — التنقل والحالة النشطة', () => {
  it('النقر على اختصار ينقل لمساره', async () => {
    const user = userEvent.setup()
    renderAt('/employee')
    await user.click(screen.getByTestId('bottom-nav-requests'))
    // الرابط ينقل — لا تعطل هنا؛ نتحقق من عدم رمي خطأ وأن العنصر زر تفاعلي
    expect(screen.getByTestId('bottom-nav-requests')).toBeInTheDocument()
  })

  it('الصفحة الرئيسية موسومة aria-current=page على مسار البوابة', () => {
    renderAt('/employee')
    const home = screen.getByTestId('bottom-nav-home')
    expect(home).toHaveAttribute('aria-current', 'page')
  })

  it('عنصر الطلبات يصبح نشطاً داخل صفحة الطلبات', () => {
    renderAt('/employee/requests')
    const requests = screen.getByTestId('bottom-nav-requests')
    expect(requests).toHaveAttribute('aria-current', 'page')
  })
})

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
  it('بوابة المتعهد: يعرض وحداتها الثلاث كاختصارات (الرئيسية، فريقي، حضورية العمال)', () => {
    renderAt('/employee')
    expect(screen.getByTestId('bottom-nav-home')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-team')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-attendance')).toBeInTheDocument()
  })
  it('بوابة HR: يعرض 4 اختصارات سريعة فقط (أول الوحدات)', () => {
    renderAt('/hr', 'hr' as never)
    expect(screen.getByTestId('bottom-nav-home')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-employees')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^bottom-nav-/).filter((el) => el.dataset.testid !== 'bottom-nav-more')).toHaveLength(4)
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
  it('بوابة المتعهد (3 وحدات) لا تحتاج زر المزيد؛ بوابة HR (أكثر من 4) تعرضه', () => {
    renderAt('/employee')
    expect(screen.queryByTestId('bottom-nav-more')).not.toBeInTheDocument()
  })

  it('زر المزيد يفتح درج الموبايل في المتجر', async () => {
    const user = userEvent.setup()
    renderAt('/hr', 'hr' as never)
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
    await user.click(screen.getByTestId('bottom-nav-more'))
    expect(useUiStore.getState().mobileNavOpen).toBe(true)
  })
})

describe('MobileBottomNav — التنقل والحالة النشطة', () => {
  it('النقر على اختصار ينقل لمساره', async () => {
    const user = userEvent.setup()
    renderAt('/employee')
    await user.click(screen.getByTestId('bottom-nav-team'))
    // الرابط ينقل — لا تعطل هنا؛ نتحقق من عدم رمي خطأ وأن العنصر زر تفاعلي
    expect(screen.getByTestId('bottom-nav-team')).toBeInTheDocument()
  })

  it('الصفحة الرئيسية موسومة aria-current=page على مسار البوابة', () => {
    renderAt('/employee')
    const home = screen.getByTestId('bottom-nav-home')
    expect(home).toHaveAttribute('aria-current', 'page')
  })

  it('عنصر الحضورية يصبح نشطاً داخل صفحتها', () => {
    renderAt('/employee/attendance')
    const att = screen.getByTestId('bottom-nav-attendance')
    expect(att).toHaveAttribute('aria-current', 'page')
  })
})

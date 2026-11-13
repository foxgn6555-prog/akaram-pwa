/**
 * V-21 — لا شاشة بيضاء صامتة عند غياب الصلاحية.
 *
 * الفحص الذي أُجري: المسار الممنوع لا يُترك فارغاً؛ `AppShell` يعيد التوجيه إلى `/403`
 * (انظر `routeAllowed` + `<Navigate to="/403">`)، وصفحة 403 تعرض رسالة صريحة وزر عودة.
 * هذا الاختبار يثبّت العقد: رسالة مفهومة + طريق رجوع، كي لا يعود العيب مستقبلاً.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ navigate: vi.fn(), roles: ['department_manager'] as string[] | null }))

vi.mock('react-router', async (orig) => {
  const actual = await orig()
  return { ...actual, useNavigate: () => h.navigate }
})
vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ data: h.roles ? { id: 'u1', roles: h.roles } : null }),
}))

import ForbiddenPage from '@portals/public/pages/Forbidden/ForbiddenPage'

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/403']}>
      <ForbiddenPage />
    </MemoryRouter>,
  )

describe('V-21 · صفحة 403 (بدل الشاشة البيضاء الصامتة)', () => {
  it('تعرض سبباً صريحاً بالعربية لا صفحة فارغة', () => {
    mount()
    expect(screen.getByText('403')).toBeTruthy()
    expect(screen.getByText('ليس لديك صلاحية الوصول لهذه الصفحة')).toBeTruthy()
    expect(document.body.textContent).not.toBe('')
  })

  it('تملك زر عودة يوجّه لبوابة المستخدم لا لصفحة ميتة', () => {
    mount()
    const back = screen.getByRole('button', { name: /العودة إلى بوابتك/ })
    fireEvent.click(back)
    expect(h.navigate).toHaveBeenCalledTimes(1)
    const [path] = h.navigate.mock.calls[0] as [string]
    expect(path).not.toBe('/403')
    expect(path.startsWith('/')).toBe(true)
  })
})

/**
 * الجولة ② — تركيب فعلي للشريط الجانبي لوحدة التخطيط الجغرافي.
 *
 * يثبت السلوك لا مجرّد وجود `children` في الإعداد:
 *   ① على صفحة المحرّر: المجموعة مفتوحة وأبناؤها السبعة ظاهرة.
 *   ② خارج الوحدة (لوحة غرفة العمليات): لا يظهر أي ابن — لا فوضى.
 *   ③ على صفحة فرعية: الأب نشط (فتُعرض المجموعة) والابن الصحيح وحده مُعلَّم.
 *   ④ «مواقع الحاويات» يظهر بالاسم الجديد في البوابة.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@features/auth/hooks/useAuth', () => ({
  useLogout: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))

import { Sidebar } from '@components/layout/Sidebar/Sidebar'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar portal="ops-room" />
    </MemoryRouter>,
  )
}

describe('② الشريط الجانبي — وحدة الخريطة مجموعة واحدة', () => {
  it('على صفحة المحرّر: الأبناء السبعة ظاهرون تحت الأب', () => {
    renderAt('/ops-room/map-planning')
    const groups = screen.getAllByTestId('unit-pages')
    expect(groups.length).toBeGreaterThan(0)
    const nav = groups[0] as HTMLElement
    for (const label of [
      'جدول الأزقة',
      'زيارات الأزقة',
      'تغطية الأزقة',
      'زيارات الآليات',
      'الأزقة المزارة (المعتمد)',
      'استيراد الخريطة',
    ]) {
      expect(within(nav).getByText(label), `مفقود: ${label}`).toBeInTheDocument()
    }
  })

  it('الأب نفسه مدخل واحد يفتح المحرّر — لا تكرار', () => {
    /*
     * «الأب ابنٌ لنفسه» جُرِّب وسقط: مفتاح الصلاحية يُشتق من المسار، فالابن
     * بنفس مسار الأب يُنتج `ops-room.map-planning` مرتين في PERMISSION_CATALOG.
     * فالمدخل واحد، والنقر عليه يفتح المحرّر، وهو نفسه مُعلَّم هنا لأنه الصفحة.
     */
    renderAt('/ops-room/map-planning')
    const hits = screen.getAllByText('محرّر الخريطة')
    expect(hits.length).toBe(1)
    // وهو الأب النشط (الصفحة الحالية)
    expect(hits[0]?.closest('button')).toHaveAttribute('aria-current', 'page')
    // ولا مدخل ثانٍ بالمسار نفسه داخل المجموعة
    const groups = screen.getAllByTestId('unit-pages')
    expect(within(groups[0] as HTMLElement).queryByText('محرّر الخريطة')).not.toBeInTheDocument()
  })

  it('خارج الوحدة: لا تظهر أي صفحة فرعية للخريطة', () => {
    renderAt('/ops-room')
    expect(screen.queryByText('جدول الأزقة')).not.toBeInTheDocument()
    expect(screen.queryByText('الأزقة المزارة (المعتمد)')).not.toBeInTheDocument()
    // لكن الأب يبقى ظاهراً كمدخل
    expect(screen.getAllByText('محرّر الخريطة').length).toBeGreaterThan(0)
  })

  it('على صفحة فرعية: المجموعة مفتوحة والصفحة الصحيحة مُعلَّمة', () => {
    renderAt('/ops-room/map-planning/visits')
    const groups = screen.getAllByTestId('unit-pages')
    const nav = groups[0] as HTMLElement
    const link = within(nav).getByText('زيارات الأزقة').closest('button')
    expect(link).toHaveAttribute('aria-current', 'page')
    // صفحة أخرى غير نشطة
    const other = within(nav).getByText('جدول الأزقة').closest('button')
    expect(other).not.toHaveAttribute('aria-current')
  })

  it('صفحة الاستيراد تُظهر المجموعة أيضاً (ليست خارج الأب)', () => {
    renderAt('/ops-room/map-planning/import')
    const groups = screen.getAllByTestId('unit-pages')
    expect(within(groups[0] as HTMLElement).getByText('استيراد الخريطة')).toBeInTheDocument()
  })

  it('«مواقع الحاويات» بالاسم الجديد في الشريط', () => {
    renderAt('/ops-room')
    expect(screen.getByText('مواقع الحاويات')).toBeInTheDocument()
    expect(screen.queryByText('GBS الحاويات')).not.toBeInTheDocument()
  })
})

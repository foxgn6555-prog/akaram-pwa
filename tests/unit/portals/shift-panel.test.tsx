/**
 * لوحة الشفتات — «لا صفر كاذب» في واجهة الزيارات.
 *
 * الشفت بلا نقاط ليس شفتاً بلا عمل: قد يكون غير مسحوب من المزوّد، أو بُني ثم
 * حُذفت نقاطه بعد ٤٨ ساعة. الاختبار يمنع أن يعود أي منهما معروضاً كصمت.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ShiftPanel } from '../../../src/portals/ops-room/pages/MapPlanning/ShiftPanel'

const h = vi.hoisted(() => ({
  pending: null as unknown,
  pendingLoading: false,
  pendingError: false,
  pull: { mutate: vi.fn(), isPending: false, isSuccess: false, data: null as unknown },
}))

vi.mock('@features/gps-lvn/hooks', () => ({
  useGpsShiftPending: () => ({
    data: h.pending,
    isLoading: h.pendingLoading,
    isError: h.pendingError,
  }),
  usePullShiftWindow: () => h.pull,
}))

const shift = (over: Record<string, unknown> = {}) => ({
  shift_id: 's1', shift_name: 'مرن مسائي', start: '17:00', end: '04:00',
  start_utc: '2026-11-20T14:00:00Z', end_utc: '2026-11-21T01:00:00Z',
  crosses_midnight: true, points: 0, oldest: null, newest: null,
  visits_built: 0, state: 'missing', can_pull: true, ...over,
})

const day = '2026-11-20'

beforeEach(() => {
  h.pending = { day, fleet: 149, shifts: [shift()] }
  h.pendingLoading = false
  h.pendingError = false
  h.pull = { mutate: vi.fn(), isPending: false, isSuccess: false, data: null }
})

describe('لوحة الشفتات', () => {
  it('تُظهر نافذة الشفت مع علامة عبور منتصف الليل', () => {
    render(<ShiftPanel day={day} />)
    const panel = screen.getByTestId('shift-panel')
    expect(panel.textContent).toContain('مرن مسائي')
    expect(panel.textContent).toContain('17:00')
    expect(panel.textContent).toContain('04:00')
    expect(panel.textContent).toContain('(+1)')
  })

  it('شفت بلا نقاط يُعرض «لم تُسحب» لا فراغاً', () => {
    render(<ShiftPanel day={day} />)
    expect(screen.getByTestId('shift-panel').textContent).toContain('لم تُسحب')
  })

  it('شفت بُني ثم حُذفت نقاطه له عبارة مستقلة', () => {
    h.pending = { day, fleet: 149, shifts: [shift({ state: 'built_points_purged', visits_built: 42 })] }
    render(<ShiftPanel day={day} />)
    expect(screen.getByTestId('shift-panel').textContent).toContain('بُني ثم حُذفت نقاطه')
  })

  it('شفت بنقاط محلية لا يعرض زر سحب', () => {
    h.pending = { day, fleet: 149, shifts: [shift({ state: 'local', points: 900 })] }
    render(<ShiftPanel day={day} />)
    fireEvent.click(screen.getByText('مرن مسائي'))
    expect(screen.queryByTestId('shift-pull-start')).toBeNull()
    expect(screen.getByTestId('shift-panel').textContent).toContain('900')
  })

  it('الشفت الأقدم من احتفاظ المزوّد لا يُطلب سحبه', () => {
    h.pending = { day, fleet: 149, shifts: [shift({ can_pull: false })] }
    render(<ShiftPanel day={day} />)
    fireEvent.click(screen.getByText('مرن مسائي'))
    expect(screen.queryByTestId('shift-pull-start')).toBeNull()
    expect(screen.getByTestId('shift-panel').textContent).toContain('أقدم من احتفاظ المزوّد')
  })

  it('زر السحب يمرّر نافذة الشفت بالضبط', () => {
    render(<ShiftPanel day={day} />)
    fireEvent.click(screen.getByText('مرن مسائي'))
    fireEvent.click(screen.getByTestId('shift-pull-start'))
    expect(h.pull.mutate).toHaveBeenCalledTimes(1)
    const arg = (h.pull.mutate.mock.calls[0] as Array<Record<string, unknown>>)[0] ?? {}
    expect(arg.day).toBe(day)
    expect(arg.window).toEqual({ from: '17:00', to: '04:00' })
    expect(arg.signal).toBeInstanceOf(AbortSignal)
  })

  it('فشل أجهزة يظهر بالاسم لا يُخفى', () => {
    h.pull = {
      mutate: vi.fn(), isPending: false, isSuccess: true,
      data: { day, window: { from: '17:00', to: '04:00' }, total: 149, done: 10, inserted: 120, aborted: false,
        failed: [{ device: 'آلية ٧', error: 'GPS_HISTORY_TARGET_NOT_FOUND' }] },
    }
    render(<ShiftPanel day={day} />)
    fireEvent.click(screen.getByText('مرن مسائي'))
    const box = screen.getByTestId('shift-pull-failed')
    expect(box.textContent).toContain('آلية ٧')
    expect(box.textContent).toContain('GPS_HISTORY_TARGET_NOT_FOUND')
  })

  it('حالة التحميل والفشل صريحتان لا صامتتان', () => {
    h.pendingLoading = true
    h.pending = { day, fleet: 0, shifts: [] }
    const { unmount } = render(<ShiftPanel day={day} />)
    expect(screen.getByTestId('shift-panel').textContent).toContain('جارٍ حساب')
    unmount()
    h.pendingLoading = false
    h.pendingError = true
    render(<ShiftPanel day={day} />)
    expect(screen.getByTestId('shift-panel').textContent).toContain('تعذّر جلب')
  })
})

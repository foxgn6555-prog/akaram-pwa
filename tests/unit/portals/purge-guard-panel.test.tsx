/**
 * لوحة «تصدير قبل الحذف» — الفرق بين «ممنوع» و«ناقص».
 *
 * أخطر ما يمكن أن تفعله واجهة هنا: أن تُظهر يوماً بلا إثبات كأنه «جاهز».
 * الاختبار يمنع ثلاثة أشكال من هذا الخطأ:
 *   ① عرض «ممنوع» و«ناقص» كأنهما شيء واحد (فيضيع سبب المنع).
 *   ② جمع «الزيارات المعرّضة للفقدان» مع الجاهزة في رقم واحد مطمئن.
 *   ③ وجود زر حذف في لوحة إثبات (مسار حذف ثانٍ بلا سجل).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  PurgeGuardPanel,
  VERDICT_LABEL,
  summarize,
  verdictOf,
} from '../../../src/portals/ops-room/pages/MapPlanning/PurgeGuardPanel'
import type { VisitPurgeVerdict } from '@sdk/map-planning.sdk'

const h = vi.hoisted(() => ({
  rows: null as unknown,
  loading: false,
  error: false,
  err: null as unknown,
}))

vi.mock('@features/map-planning/hooks/useMapPlanning', () => ({
  useVisitPurgeGuard: () => ({
    data: h.rows,
    isLoading: h.loading,
    isError: h.error,
    error: h.err,
  }),
}))

const row = (over: Partial<VisitPurgeVerdict> = {}): VisitPurgeVerdict => ({
  placeday: '2026-10-01',
  visits: 120,
  days_old: 54,
  exported: false,
  can_purge: false,
  reason: 'لا طلب تصدير يغطي هذا اليوم — الحذف ممنوع',
  ...over,
})

const ready = (over: Partial<VisitPurgeVerdict> = {}) =>
  row({ exported: true, can_purge: true, reason: 'جاهز للحذف — التصدير مُثبت', ...over })
const incomplete = (over: Partial<VisitPurgeVerdict> = {}) =>
  row({ exported: true, can_purge: false, reason: 'طلب تصدير بلا بصمة أو عدد صفوف — الإثبات ناقص', ...over })

beforeEach(() => {
  h.rows = [ready()]
  h.loading = false
  h.error = false
  h.err = null
})

describe('① تصنيف الحكم — ثلاث حالات لا اثنتان', () => {
  it('exported=false ⇒ ممنوع مهما كان can_purge', () => {
    expect(verdictOf(row({ exported: false, can_purge: true }))).toBe('blocked')
  })

  it('exported=true و can_purge=false ⇒ ناقص لا جاهز', () => {
    expect(verdictOf(row({ exported: true, can_purge: false }))).toBe('incomplete')
  })

  it('الاثنان معاً ⇒ جاهز', () => {
    expect(verdictOf(ready())).toBe('ready')
  })

  it('الوسوم الثلاثة مختلفة نصاً — لا وسم عام يخلط بينها', () => {
    const labels = [VERDICT_LABEL.ready, VERDICT_LABEL.blocked, VERDICT_LABEL.incomplete]
    expect(new Set(labels).size).toBe(3)
    expect(VERDICT_LABEL.incomplete).toContain('ناقص')
    expect(VERDICT_LABEL.blocked).toContain('ممنوع')
  })
})

describe('② التلخيص — الأرقام المعرّضة للفقدان منفصلة', () => {
  it('يوم ممنوع ويوم ناقص يُجمعان في «يحتاج تدخّلاً» معاً', () => {
    const s = summarize([ready(), row(), incomplete(), ready({ placeday: '2026-10-02' })])
    expect(s.days).toBe(4)
    expect(s.readyDays).toBe(2)
    expect(s.blockedDays).toBe(1)
    expect(s.incompleteDays).toBe(1)
    expect(s.needsAction).toBe(true)
  })

  it('atRiskVisits = زيارات الممنوع + الناقص فقط', () => {
    const s = summarize([
      ready({ visits: 10 }),
      row({ visits: 100 }),
      incomplete({ visits: 50 }),
      ready({ visits: 5, placeday: '2026-10-03' }),
    ])
    expect(s.atRiskVisits).toBe(150)
    expect(s.visits).toBe(165)  // المجموع الكلي شامل
  })

  it('كل الأيام جاهزة ⇒ needsAction=false و atRisk=0', () => {
    const s = summarize([ready(), ready({ placeday: '2026-10-02' })])
    expect(s.needsAction).toBe(false)
    expect(s.atRiskVisits).toBe(0)
  })

  it('لا صفوف ⇒ صفر بلا انفجار ولا NaN', () => {
    const s = summarize([])
    expect(s).toMatchObject({ days: 0, visits: 0, readyDays: 0, atRiskVisits: 0, needsAction: false })
  })
})

describe('③ العرض — الحالة والتقرير صادقان', () => {
  it('العنوان يذكر عدد الأيام والزيارات', () => {
    h.rows = [row({ visits: 120 }), ready({ placeday: '2026-10-02', visits: 80 })]
    render(<PurgeGuardPanel />)
    expect(screen.getByTestId('purge-headline').textContent).toContain('2 يوماً')
    expect(screen.getByTestId('purge-headline').textContent).toContain('200 زيارة')
  })

  it('عند وجود يوم بلا إثبات: يذكر العدد والزيارات المعرّضة للفقدان', () => {
    h.rows = [row({ visits: 120 }), ready({ placeday: '2026-10-02', visits: 80 })]
    render(<PurgeGuardPanel />)
    const text = screen.getByTestId('purge-headline').textContent ?? ''
    expect(text).toContain('معرّضة للفقدان')
    expect(text).toContain('120')
  })

  it('كل صفّ يحمل data-verdict الصحيح — يمكن عزله في العرض', () => {
    h.rows = [row(), incomplete({ placeday: '2026-10-02' }), ready({ placeday: '2026-10-03' })]
    render(<PurgeGuardPanel />)
    expect(screen.getByTestId('purge-row-2026-10-01').dataset.verdict).toBe('blocked')
    expect(screen.getByTestId('purge-row-2026-10-02').dataset.verdict).toBe('incomplete')
    expect(screen.getByTestId('purge-row-2026-10-03').dataset.verdict).toBe('ready')
  })

  it('السبب يُعرض كما أعادته القاعدة — لا نصّ مُعاد كتابته في العميل', () => {
    h.rows = [row({ reason: 'طلب تصدير بلا بصمة أو عدد صفوف — الإثبات ناقص' })]
    render(<PurgeGuardPanel />)
    expect(screen.getByTestId('purge-guard').textContent).toContain(
      'طلب تصدير بلا بصمة أو عدد صفوف — الإثبات ناقص',
    )
  })

  it('لا صفوف ⇒ رسالة صريحة «لا بيانات» لا «آمن»', () => {
    h.rows = []
    render(<PurgeGuardPanel />)
    const text = screen.getByTestId('purge-empty').textContent ?? ''
    expect(text).toContain('لا زيارات أقدم من')
    expect(text).toContain('ليست حالة «آمنة»')
  })

  it('الخطأ يُعرض نصاً — لا شاشة صامتة تُقرأ كـ«لا شيء للحذف»', () => {
    h.error = true
    h.err = new Error('RETENTION_FORBIDDEN')
    render(<PurgeGuardPanel />)
    expect(screen.getByTestId('purge-error').textContent).toContain('RETENTION_FORBIDDEN')
  })
})

describe('④ لا مسار حذف في لوحة الإثبات', () => {
  it('لا زر حذف إطلاقاً', () => {
    h.rows = [ready()]
    render(<PurgeGuardPanel />)
    const buttons = screen.queryAllByRole('button')
    expect(buttons).toHaveLength(0)
  })

  it('لا نداء RPC للحذف من اللوحة — قراءة فقط', () => {
    // mock الهوك لا يوفّر أي mutation؛ وجود واحدة كان سيُفشل الاختبار بالاستيراد
    h.rows = [ready()]
    render(<PurgeGuardPanel />)
    expect(screen.getByTestId('purge-guard')).toBeTruthy()
  })

  it('عند نقص الإثبات يوجّه للتقرير المعتمد لا إلى حذف مباشر', () => {
    h.rows = [row()]
    render(<PurgeGuardPanel />)
    const hint = screen.getByTestId('purge-hint').textContent ?? ''
    expect(hint).toContain('التقرير المعتمد')
    expect(hint).toContain('الحذف لا ينفَّذ من هنا')
  })
})

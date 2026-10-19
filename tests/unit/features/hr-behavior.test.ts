/** 00249: تقارير سلوك الموظفين — الفترات، التصنيف، الاستنتاجات النصية، بيانات الرادار */
import { describe, expect, it } from 'vitest'
import { defaultAnchor, employeeInsights, gradeOf, periodTitle, radarData, reportInsights, shiftAnchor } from '@features/hr/lib/behavior'
import type { BehaviorEmployeeReport, BehaviorEmployeeRow, BehaviorSummary } from '@features/hr'

const summary = (p: Partial<BehaviorSummary> = {}): BehaviorSummary => ({
  employees: 20, avg_score: 84.2, prev_avg_score: 80.1, attendance_rate: 96, punctuality_rate: 88, early_leave_rate: 3, absence_rate: 4, incomplete_rate: 6,
  late_minutes: 900, early_minutes: 120, extra_minutes: 300, absent_days: 12, avg_late_minutes_per_late_day: 18, chronic_late: 2, perfect: 3,
  grades: { excellent: 6, very_good: 8, good: 3, fair: 2, poor: 1 }, improved: 7, declined: 2, ...p,
})
const row = (p: Partial<BehaviorEmployeeRow>): BehaviorEmployeeRow => ({
  employee_id: 'e', employee_number: 'E1', full_name: 'أحمد', department_id: null, department_name: 'النقل', branch_name: null, job_title: null,
  scheduled_days: 30, leave_days: 0, expected_days: 30, worked_days: 30, present_days: 30, late_days: 0, late_minutes: 0, early_days: 0, early_minutes: 0, absent_days: 0, incomplete_days: 0,
  extra_minutes: 0, avg_in_offset: -5, sd_in_offset: 4, perfect_days: 30, max_perfect_streak: 30, score: 100, grade: 'excellent', prev_score: 95, prev_grade: 'excellent', delta: 5, rank: 1,
  indices: { attendance: 1, punctuality: 1, early: 1, complete: 1, consistency: 1 }, chronic_late: false, high_absence: false, ...p,
})

describe('00249 — الفترات والتصنيف', () => {
  it('التصنيف وفق الحدود 90/80/70/60', () => {
    expect([gradeOf(100), gradeOf(90), gradeOf(89.9), gradeOf(80), gradeOf(70), gradeOf(60), gradeOf(59.9), gradeOf(null)]).toEqual(['excellent', 'excellent', 'very_good', 'very_good', 'good', 'fair', 'poor', null])
  })
  it('تحريك المرساة بحسب نوع الفترة', () => {
    expect(shiftAnchor('monthly', '2026-03-15', -1)).toBe('2026-02-01')
    expect(shiftAnchor('quarterly', '2026-01-01', 1)).toBe('2026-04-01')
    expect(shiftAnchor('half_yearly', '2026-07-01', -1)).toBe('2026-01-01')
    expect(shiftAnchor('yearly', '2026-05-05', 1)).toBe('2027-05-01')
  })
  it('المرساة الافتراضية = آخر فترة مكتملة', () => {
    const today = new Date(2026, 9, 19)   // 19 تشرين الأول 2026
    expect(defaultAnchor('monthly', today)).toBe('2026-09-01')
    expect(defaultAnchor('quarterly', today)).toBe('2026-07-01')
    expect(defaultAnchor('half_yearly', today)).toBe('2026-01-01')
    expect(defaultAnchor('yearly', today)).toBe('2025-01-01')
  })
  it('عنوان الفترة بالعربية', () => {
    expect(periodTitle('monthly', '2026-09-01')).toBe('أيلول 2026')
    expect(periodTitle('quarterly', '2026-07-01')).toBe('الربع الثالث 2026')
    expect(periodTitle('half_yearly', '2026-07-01')).toBe('النصف الثاني 2026')
    expect(periodTitle('yearly', '2025-01-01')).toBe('سنة 2025')
  })
})

describe('00249 — الاستنتاجات', () => {
  it('تقرير الفترة: تحسّن المتوسط، المزمنون، الدرجة الكاملة، أسوأ يوم تأخير، فارق الأقسام، المرتبة الأولى', () => {
    const wd = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, late_days: dow === 2 ? 12 : 1, absent_days: dow === 6 ? 4 : 0, early_days: 0, worked_days: 40, late_rate: dow === 2 ? 30 : 2.5 }))
    const deps = [{ department_id: 'a', name: 'الإدارة', employees: 5, avg_score: 92, late_rate: 2, absence_rate: 1 }, { department_id: 'b', name: 'النقل', employees: 8, avg_score: 74, late_rate: 20, absence_rate: 6 }]
    const texts = reportInsights(summary(), wd, deps, [row({})]).map((i) => i.text)
    expect(texts.some((t) => t.includes('تحسّن 4.1 نقطة'))).toBe(true)
    expect(texts.some((t) => t.includes('2 موظفاً متأخرون بشكل مزمن'))).toBe(true)
    expect(texts.some((t) => t.includes('3 موظفاً حققوا الدرجة الكاملة'))).toBe(true)
    expect(texts.some((t) => t.includes('يوم الثلاثاء هو الأعلى تأخيراً'))).toBe(true)
    expect(texts.some((t) => t.includes('أكثر الغياب يقع يوم السبت'))).toBe(true)
    expect(texts.some((t) => t.includes('«الإدارة» (92) وأدناها «النقل» (74)'))).toBe(true)
    expect(texts.some((t) => t.includes('المرتبة الأولى: أحمد (100)'))).toBe(true)
    expect(texts.some((t) => t.includes('ببصمة واحدة فقط'))).toBe(true)
    expect(reportInsights(null, [], [], [])).toEqual([])
  })
  it('بطاقة الموظف: تراجع، مزمن مع بوابة، وقت وصول، تذبذب، أكثر أيام التأخير', () => {
    const cur = { employee_id: 'e', scheduled_days: 30, leave_days: 0, expected_days: 30, worked_days: 30, present_days: 30, late_days: 18, late_minutes: 360, early_days: 0, early_minutes: 0, absent_days: 0, incomplete_days: 0, extra_minutes: 0, avg_in_offset: 18, sd_in_offset: 14.9, perfect_days: 12, max_perfect_streak: 3, score: 69.9, idx_attendance: 1, idx_punctuality: 0.33, idx_early: 1, idx_complete: 1, idx_consistency: 0.75, grade: 'fair' as const }
    const r: BehaviorEmployeeReport = {
      period: { kind: 'monthly', period_from: '2026-09-01', period_to: '2026-09-30', period_to_effective: '2026-09-30', prev_from: '2026-08-01', prev_to: '2026-08-31', label: '2026-09' },
      employee: { id: 'e', employee_number: 'E2', full_name: 'سامر', department_name: null, branch_name: null, job_title: null, hire_date: '2024-01-01', biometric_pin: '1' },
      current: cur, previous: { ...cur, late_days: 0, late_minutes: 0, score: 100, idx_punctuality: 1, grade: 'excellent' }, rank: 3, population: 20,
      trend: [], weekdays: [{ dow: 0, late_days: 6, absent_days: 0, early_days: 0, worked_days: 8 }, { dow: 1, late_days: 2, absent_days: 0, early_days: 0, worked_days: 8 }], in_histogram: [], days: [],
      weights: { attendance: 40, punctuality: 25, early: 15, complete: 10, consistency: 10 },
    }
    const texts = employeeInsights(r).map((i) => i.text)
    expect(texts[0]).toContain('تراجع 30.1 نقطة')
    expect(texts.some((t) => t.includes('المرتبة 3 من 20'))).toBe(true)
    expect(texts.some((t) => t.includes('تأخير مزمن: 18 يوم تأخير من 30 (60٪)') && t.includes('69.9'))).toBe(true)
    expect(texts.some((t) => t.includes('يصل بعد موعده بمتوسط 18 دقيقة'))).toBe(true)
    expect(texts.some((t) => t.includes('تذبذب وقت الوصول ±14.9'))).toBe(true)
    expect(texts.some((t) => t.includes('أكثر أيام التأخير تكراراً: الأحد (6 من 8)'))).toBe(true)
    expect(radarData(r)).toEqual([
      { axis: 'الحضور', current: 100, previous: 100 }, { axis: 'الدخول', current: 33, previous: 100 }, { axis: 'الخروج', current: 100, previous: 100 }, { axis: 'الاكتمال', current: 100, previous: 100 }, { axis: 'الاستقرار', current: 75, previous: 75 },
    ])
    expect(employeeInsights({ ...r, current: null })[0]!.text).toContain('لا بصمات')
  })
})

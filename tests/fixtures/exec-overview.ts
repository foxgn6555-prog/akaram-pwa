/** عيّنة ملخص تنفيذي كاملة للاختبارات */
import type { ExecOverview } from '@features/executive/types'

export function sample(over: Partial<ExecOverview> = {}): ExecOverview {
  return {
    period: { from: '2026-09-01', to: '2026-09-27', days: 27, sector: null, shift: null, generated_at: '2026-09-27T10:00:00Z' },
    workforce: { active: 120, hired: 3, terminated: 1, by_department: [{ name: 'النقل', count: 50 }], attendance: { present: 800, late: 60, absent: 40, incomplete: 10, leave: 30, shortfall_minutes: 3000, overtime_minutes: 500, deduction_days: 12 }, attendance_series: [{ d: '2026-09-01', present: 90, absent: 5, late: 5 }], leaves: { pending: 4, approved: 20, rejected: 2, days: 35 }, alerts: 6 },
    complaints: { total: 100, open: 30, resolved: 70, by_status: [{ key: 'new', count: 30 }, { key: 'sent', count: 70 }], by_sector: [{ name: 'karrada', count: 60 }, { name: 'zaafaraniya', count: 40 }], by_type: [{ name: 'نفايات', count: 80 }], series: [{ d: '2026-09-01', count: 4 }] },
    fleet: { vehicles: 40, departures: 500, returned: 480, open_now: 6, avg_hours: 7.5, by_shift: [{ name: 'morning', count: 300 }], by_sector: [{ name: 'قاطع 1', count: 100 }], series: [{ d: '2026-09-01', count: 20 }], breakdowns: 5, gps_alerts: 12, maintenance: { opened: 9, closed: 7, open_now: 4, avg_hours: 30, cost: 1500000, by_fault: [{ name: 'محرك', count: 4 }] } },
    station: { weighings: 400, tons: 2800, violations: 20, deficit_tons: 30, by_kind: [{ name: 'كابسة كبيرة', count: 300, tons: 2400 }], by_destination: [], series: [{ d: '2026-09-01', count: 15, tons: 100 }], top_violators: [{ name: 'سائق أ · DB-1', count: 5, deficit: 8 }] },
    disclosures: { total: 12, by_violation: [{ name: 'delay', count: 8 }], by_status: [{ key: 'submitted_to_deputy', count: 12 }], by_contractor: [{ name: 'مقاول', count: 12 }] },
    media: { submissions: 15, photos: 300, by_work_type: [{ name: 'رفع نفايات', count: 10 }] },
    gbs: { total: 200, by_status: [{ key: 'active', count: 190 }], updates: 30 },
    supplies: { total: 8, by_status: [{ key: 'pending', count: 3 }], by_type: [{ name: 'أكياس', count: 5, qty: 500 }] },
    finance: { payroll: { month: '2026-08-01', status: 'approved', employees: 118, proposed_total: 90000000, final_total: 88000000, deductions_total: 2000000, allowances_total: 0 }, payroll_months: [{ month: '2026-08-01', status: 'approved', total: 88000000 }], purchases: { orders: 3, total: 4000000, items: 12 }, budget: { year: 2026, allocated: 100000000, spent: 60000000, by_category: [{ name: 'وقود', allocated: 50000000, spent: 30000000 }] }, maintenance_cost: 1500000 },
    ...over,
  }
}


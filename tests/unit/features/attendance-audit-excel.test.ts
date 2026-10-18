/** 00283 — مصنف Excel الحقيقي لسجل تعديلات الحضور: الأوراق، الترويسة، الأعمدة المختارة، الملخصات، لا أرقام عربية */
import { describe, expect, it } from 'vitest'
import type { AttendanceAuditRow } from '@features/hr'
import type { Worksheet } from 'exceljs'
import { exportAttendanceAudit } from '@portals/it/pages/Integrations/biometric/attendance-audit.export'

const rows: AttendanceAuditRow[] = [
  { id: 'a1', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', department_name: 'النقل', work_date: '2026-10-02', action: 'edit', before: { status: 'absent' }, after: { status: 'late', late_minutes: 25 }, reason: 'بصمة الدخول لم تُسجَّل', actor: 'u1', actor_name: 'مدقق العمليات', created_at: '2026-10-05T07:30:00Z' },
  { id: 'a2', employee_id: 'e2', employee_number: 'E200', full_name: 'كرار يوسف', department_name: null, work_date: '2026-10-03', action: 'waive', before: { waived: false }, after: { waived: true }, reason: 'عذر مقبول', actor: 'u1', actor_name: 'مدقق العمليات', created_at: '2026-10-05T08:00:00Z' },
]
const text = (ws: Worksheet) => { const out: string[] = []; ws.eachRow((r) => r.eachCell((c) => out.push(String(c.value ?? '')))); return out.join('\n') }

describe('exportAttendanceAudit', () => {
  it('يبني مصنفاً بأربع أوراق بيانات + ورقة رسم (إن توفر canvas)، بالأعمدة المختارة فقط وبترويسة الشركة وصف الإجمالي', async () => {
    const wb = await exportAttendanceAudit(rows, { columns: ['seq', 'action', 'full_name', 'work_date', 'reason'], diffMode: 'text', summarySheets: true, chart: false, from: '2026-10-01', to: '2026-10-18', filtersLabel: 'القسم: النقل' })
    expect(wb.worksheets.map((w) => w.name)).toEqual(['سجل التعديلات', 'حسب الإجراء', 'حسب الموظف', 'حسب المدقّق'])
    const main = text(wb.getWorksheet('سجل التعديلات')!)
    expect(main).toContain('شركة جزيرة الأكارم'); expect(main).toContain('سجل تعديلات الحضور'); expect(main).toContain('القسم: النقل')
    for (const hdr of ['ت', 'الإجراء', 'اسم الموظف', 'يوم الحضور', 'السبب']) expect(main).toContain(hdr)
    expect(main).not.toContain('المدقّق\n'); expect(main).not.toContain('الفرق (قبل ← بعد)')
    expect(main).toContain('تعديل يوم حضور'); expect(main).toContain('كرار يوسف')
    const byEmp = text(wb.getWorksheet('حسب الموظف')!)
    expect(byEmp).toContain('أحمد علي (E100)'); expect(byEmp).toContain('الإجمالي')
    expect(main + byEmp).not.toMatch(/[\u0660-\u0669]/)
    const ws = wb.getWorksheet('سجل التعديلات')!
    expect(ws.views[0]?.rightToLeft).toBe(true)
    expect(ws.autoFilter).toBeTruthy()
  })
})

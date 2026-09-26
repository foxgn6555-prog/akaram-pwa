/** Excel الموارد البشرية: قالب الاستيراد ↔ التحليل (تطبيع القيم العربية)، أعمدة التصدير بلا رواتب، ترويسة وفلاتر */
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { attendanceSpec, buildImportTemplate, buildWorkbook, EMPLOYEE_COLUMNS, EMPLOYEE_DEFAULT_COLUMNS, employeesSpec, IMPORT_COLUMNS, importReportSpec, leavesSpec, parseImportFile } from '@features/hr/lib/hrExcel'

async function sheetBuffer(headers: string[], rows: unknown[][]) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('x')
  ws.addRow(headers); rows.forEach((r) => ws.addRow(r))
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

describe('قالب الاستيراد', () => {
  it('يحتوي كل الأعمدة الرسمية (الإلزامية بعلامة *) وورقة قيم مرجعية بالأقسام والفروع والشفتات', async () => {
    const wb = await buildImportTemplate({ departments: ['النقل', 'الورشة'], branches: ['بغداد'], shifts: ['صباحي'] })
    const ws = wb.getWorksheet('الموظفون')!
    const headers = (ws.getRow(1).values as string[]).slice(1)
    expect(headers).toHaveLength(IMPORT_COLUMNS.length)
    expect(headers[0]).toBe('الرقم الوظيفي *'); expect(headers[1]).toBe('الاسم الرباعي *')
    const ref = wb.getWorksheet('القيم المرجعية')!
    expect(ref.getRow(2).getCell(1).value).toBe('النقل'); expect(ref.getRow(3).getCell(1).value).toBe('الورشة'); expect(ref.getRow(2).getCell(3).value).toBe('صباحي')
  })
  it('القالب المنزّل يُحلَّل مباشرة: صف التلميحات يُتجاهل وصف المثال يُقرأ بقيم مطبَّعة', async () => {
    const wb = await buildImportTemplate({ departments: ['النقل'], branches: ['بغداد'], shifts: ['صباحي'] })
    const parsed = await parseImportFile((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    expect(parsed.missingRequired).toEqual([]); expect(parsed.unknownHeaders).toEqual([])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({ employee_number: 'E-1001', department: 'النقل', shift: 'صباحي', contract_type: 'monthly', gender: 'male', marital_status: 'married', hire_date: '2026-01-15' })
    expect(parsed.localErrors).toEqual([])
  })
})

describe('تحليل ملف الاستيراد', () => {
  it('يطبّع القيم العربية (يومي/أنثى/عزباء) ويكشف القيم غير المعروفة والتواريخ الخاطئة محلياً', async () => {
    const buf = await sheetBuffer(['الرقم الوظيفي', 'الاسم الرباعي', 'نوع التعاقد', 'الجنس', 'الحالة الاجتماعية', 'تاريخ المباشرة', 'عمود غريب'], [
      ['A1', 'سارة', 'يومي', 'أنثى', 'عزباء', new Date(Date.UTC(2026, 2, 5)), 'x'],
      ['A2', 'علي', 'أسبوعي', 'ذكر', 'متزوج', '5/3/2026', ''],
    ])
    const p = await parseImportFile(buf)
    expect(p.unknownHeaders).toEqual(['عمود غريب'])
    expect(p.rows[0]).toMatchObject({ employee_number: 'A1', contract_type: 'daily', gender: 'female', marital_status: 'single', hire_date: '2026-03-05' })
    expect(p.rows[1]).not.toHaveProperty('x')
    expect(p.localErrors).toEqual([{ row: 2, errors: ['HR_CONTRACT_INVALID', 'HR_DATE_INVALID'] }])
  })
  it('يرفض ملفاً بلا الأعمدة الإلزامية ويتجاهل الصفوف الفارغة والأرقام كنص', async () => {
    const p = await parseImportFile(await sheetBuffer(['الاسم الرباعي', 'الهاتف'], [['x', 7701234567], [], ['', '']]))
    expect(p.missingRequired).toEqual(['الرقم الوظيفي'])
    expect(p.rows).toHaveLength(1); expect(p.rows[0]!.phone).toBe('7701234567')
  })
})

describe('مواصفات التصدير', () => {
  it('أعمدة الموظفين لا تحتوي أي عمود راتب أو مبلغ، والافتراضية مجموعة فرعية صالحة', () => {
    // الحالة فقط مسموحة (مُعرَّف/بانتظار) — لا أساسي ولا أجر يومي ولا مخصصات ولا صافي
    for (const c of EMPLOYEE_COLUMNS) expect(c.key + c.header).not.toMatch(/base_salary|daily_rate|allowance|deduction|net|الأساسي|أجر اليوم|مخصصات|صافي|مبلغ/)
    expect(EMPLOYEE_COLUMNS.filter((c) => /salary/.test(c.key)).map((c) => c.key)).toEqual(['salary_status'])
    for (const k of EMPLOYEE_DEFAULT_COLUMNS) expect(EMPLOYEE_COLUMNS.some((c) => c.key === k)).toBe(true)
    const spec = employeesSpec([{ id: 'e', employee_number: 'E1', full_name: 'أحمد', contract_type: 'daily', employment_status: 'active', salary_status: 'defined' } as never], ['employee_number', 'salary_status', 'contract_type'], [['القسم', 'النقل']])
    expect(spec.columns.map((c) => c.header)).toEqual(['الرقم الوظيفي', 'نوع التعاقد', 'حالة الراتب'])
    expect(spec.columns[2]!.value(spec.rows[0]!)).toBe('مُعرَّف لدى المالية')
  })
  it('المصنّف يحمل العنوان والفلاتر المطبّقة وصفاً لكل سجل بترقيم تلقائي وRTL', async () => {
    const wb = await buildWorkbook(employeesSpec([{ id: 'e', employee_number: 'E1', full_name: 'أحمد', contract_type: 'monthly', employment_status: 'active', salary_status: 'pending' } as never, { id: 'f', employee_number: 'E2', full_name: 'سارة', contract_type: 'daily', employment_status: 'terminated', salary_status: 'pending' } as never], EMPLOYEE_DEFAULT_COLUMNS, [['القسم', 'النقل'], ['الفرع', '']]))
    const ws = wb.worksheets[0]!
    expect(ws.views[0]).toMatchObject({ rightToLeft: true })
    expect(String(ws.getCell('A1').value)).toContain('كشف الموظفين')
    expect(String(ws.getCell('A2').value)).toContain('القسم: النقل'); expect(String(ws.getCell('A2').value)).not.toContain('الفرع')
    expect(ws.getRow(4).getCell(2).value).toBe('الرقم الوظيفي')
    expect(ws.getRow(5).getCell(1).value).toBe(1); expect(ws.getRow(6).getCell(3).value).toBe('سارة'); expect(ws.getRow(6).getCell(9).value).toBe('منتهية خدمته')
  })
  it('الحضور والإجازات وتقرير الاستيراد يترجمون الحالات والرموز إلى العربية', () => {
    const a = attendanceSpec([{ work_date: '2026-09-05', status: 'late', source: 'manual', check_in: null, check_out: null, expected_in: null, late_minutes: 12, early_minutes: 0, worked_minutes: 0 } as never], [['من', '2026-09-01']])
    const val = (k: string) => a.columns.find((c) => c.key === k)!.value(a.rows[0]!)
    expect(val('status')).toBe('متأخر'); expect(val('source')).toBe('مُعدَّل يدوياً'); expect(val('weekday')).toBe('السبت'); expect(a.fileName).toBe('الحضور-2026-09-01.xlsx')
    const l = leavesSpec([{ kind: 'leave', leave_type: 'اعتيادية', start_date: '2026-09-01', end_date: '2026-09-03', start_time: null, employees: { full_name: 'x', employee_number: '1' } } as never], [])
    expect(l.columns.find((c) => c.key === 'days')!.value(l.rows[0]!)).toBe(3)
    const r = importReportSpec([{ row: 1, employee_number: 'E1', full_name: 'x', ok: false, id: null, errors: ['HR_NUMBER_TAKEN'] }], (c) => (c === 'HR_NUMBER_TAKEN' ? 'مكرر' : c))
    expect(r.columns.find((c) => c.key === 'errors')!.value(r.rows[0]!)).toBe('مكرر'); expect(r.columns.find((c) => c.key === 'ok')!.value(r.rows[0]!)).toBe('مرفوض')
  })
})

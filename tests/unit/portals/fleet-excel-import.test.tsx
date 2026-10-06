/** 00182: استرداد قاعدة بيانات الآليات من Excel — التحليل المرن، التصدير كقالب (round-trip)، الحوار، وأزرار الصفحة */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FLEET_COLUMNS, buildFleetWorkbook, fleetExportValues, fleetImportMessage, matchFleetHeader, parseFleetFile, type FleetExportRow, type FleetImportResult } from '@features/central-garage/fleet-excel'

const h = vi.hoisted(() => ({ imp: vi.fn(), exp: vi.fn(), parsed: null as unknown }))
vi.mock('@features/central-garage/hooks', () => ({
  useFleetImport: () => ({ mutate: h.imp, isPending: false }),
  useFleetExport: () => ({ mutate: h.exp, isPending: false }),
  useGarageAreas: () => ({ data: [], isLoading: false }),
  useGarageVehicles: () => ({ data: { rows: [], totalCount: 0 }, isLoading: false, isError: false }),
  useCreateGarageVehicle: () => ({ mutate: vi.fn(), isPending: false }),
  useFleetDriverOptions: () => ({ data: [], isLoading: false }),
}))
vi.mock('@features/central-garage/fleet-excel', async (orig) => { const m = await orig<Record<string, unknown>>(); return { ...m, parseFleetFile: (f: unknown) => (h.parsed ? Promise.resolve(h.parsed) : (m.parseFleetFile as (f: unknown) => Promise<unknown>)(f)) } })
import { FleetImportDialog } from '@portals/central-garage/components/FleetImportDialog'
import VehiclesDatabasePage from '@portals/central-garage/pages/VehiclesDatabasePage'

const exportRow: FleetExportRow = { db_number: 'DB-7', vehicle_name: 'كابسة 7', vehicle_category: 'compactor_large', plate_number: '777 بغداد', chassis_number: 'CH777', sector_id: 4, area_name: 'القاطع الرابع', parent_sector: 'karrada', shift: 'evening', driver_name: 'علي حسين', driver_employee_number: 'E-1', ownership_type: 'rented', lessor_name: 'النور', rental_contract_no: 'C1', rental_start_date: '2026-01-01', rental_end_date: '2026-12-31', model_year: 2020, vehicle_color: 'أبيض', specifications: null, has_photo: false, created_at: '2026-01-01T00:00:00Z' }

describe('Excel الآليات — التحليل والتصدير', () => {
  it('مرادفات الرؤوس تُفهم (عربية بتنويعات وإنكليزية)', () => {
    expect(matchFleetHeader('رقم DB *')).toBe('db_number'); expect(matchFleetHeader('رقم الآلية')).toBe('db_number'); expect(matchFleetHeader('DB')).toBe('db_number')
    expect(matchFleetHeader('المنطقة')).toBe('area'); expect(matchFleetHeader('القاطع والمنطقة')).toBe('area'); expect(matchFleetHeader('اسم السائق')).toBe('driver')
    expect(matchFleetHeader('نوع الآلية')).toBe('vehicle_category'); expect(matchFleetHeader('الشاسيه')).toBe('chassis_number'); expect(matchFleetHeader('عمود غريب')).toBeNull()
    expect(fleetImportMessage('FLEET_IMPORT_AREA_UNKNOWN')).toContain('المنطقة'); expect(fleetImportMessage('X_UNKNOWN')).toBe('X_UNKNOWN')
  })
  it('ملف التصدير يُعاد استيراده كما هو (round-trip) مع تطبيع المنطقة والقيم', async () => {
    const wb = await buildFleetWorkbook([exportRow])
    expect(wb.getWorksheet('الآليات')!.getRow(1).values).toEqual([undefined, ...FLEET_COLUMNS.map((c) => c.header + (c.required ? ' *' : ''))])
    expect(fleetExportValues(exportRow)[5]).toBe('4 - القاطع الرابع')
    expect(wb.getWorksheet('ملخص')).toBeDefined()
    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseFleetFile(buf as ArrayBuffer)
    expect(parsed.headerRow).toBe(1); expect(parsed.missingRequired).toEqual([]); expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({ db_number: 'DB-7', vehicle_name: 'كابسة 7', vehicle_category: 'كابسة كبيرة', area: '4', shift: 'مسائي', driver: 'علي حسين', driver_employee_number: 'E-1', ownership_type: 'آلية مؤجرة', lessor_name: 'النور', rental_start_date: '2026-01-01', model_year: '2020' })
  })
  it('ملف المستخدم الحر: عنوان مدمج قبل الرؤوس، رؤوس بمرادفات، تواريخ بصيغ مختلفة، صفوف بلا DB تُجوهل', async () => {
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('x')
    ws.addRow(['قاعدة بيانات آليات الشركة 2026']); ws.addRow([])
    ws.addRow(['ت', 'رقم الآلية', 'النوع', 'المنطقة', 'اسم السائق', 'الوجبة', 'بداية الإيجار'])
    ws.addRow([1, 'K-1', 'كابسة', 'منطقة 7', 'حسن عبد الله', 'مسائي', '5/3/2026'])
    ws.addRow([2, '', 'شفل', '4', '', '', ''])
    ws.addRow([3, 'K-3', 'قلاب', '', 'x', 'صباحي', ''])
    const parsed = await parseFleetFile((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    expect(parsed.headerRow).toBe(3); expect(parsed.rows).toHaveLength(2); expect(parsed.skippedEmpty).toBe(1)
    expect(parsed.rows[0]).toMatchObject({ db_number: 'K-1', vehicle_category: 'كابسة', area: 'منطقة 7', driver: 'حسن عبد الله', shift: 'مسائي', rental_start_date: '2026-03-05' })
    expect(parsed.localErrors).toEqual([{ row: 2, errors: ['FLEET_IMPORT_AREA_UNKNOWN'] }])
    expect(parsed.unknownHeaders).toEqual([])
  })
})

describe('حوار الاسترداد وأزرار الصفحة', () => {
  it('الصفحة (وضع غرفة العمليات) تعرض تصدير Excel واسترداد من Excel ويفتح الحوار', () => {
    render(<MemoryRouter><VehiclesDatabasePage managementMode /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('fleet-export')); expect(h.exp).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByTestId('fleet-import-open')); expect(screen.getByTestId('fleet-import-dialog')).toBeInTheDocument()
  })
  it('اختيار ملف → معاينة (dryRun) → تنفيذ؛ النتائج تُعرض بالعربية والتنفيذ معطّل قبل المعاينة', async () => {
    h.parsed = { rows: [{ db_number: 'K-1', area: '7' }, { db_number: 'K-2', area: 'x' }], mapped: [{ header: 'رقم DB', key: 'db_number' }, { header: 'المنطقة', key: 'area' }], unknownHeaders: [], headerRow: 1, skippedEmpty: 0, missingRequired: [], localErrors: [] }
    const preview: FleetImportResult = { dry_run: true, total: 2, inserted: 1, updated: 0, skipped: 1, failed: 1, rows: [
      { row: 1, db_number: 'K-1', vehicle_name: 'آلية K-1', area: 'القاطع السابع', driver: 'غير مسنَد', driver_linked: false, action: 'inserted', ok: true, id: null, errors: [], warnings: ['FLEET_IMPORT_DRIVER_MISSING'] },
      { row: 2, db_number: 'K-2', vehicle_name: 'آلية K-2', area: null, driver: null, driver_linked: false, action: 'skipped', ok: false, id: null, errors: ['FLEET_IMPORT_AREA_UNKNOWN'], warnings: [] },
    ] }
    h.imp.mockImplementation((x: { dryRun: boolean }, o: { onSuccess: (r: FleetImportResult) => void }) => o.onSuccess({ ...preview, dry_run: x.dryRun }))
    render(<FleetImportDialog onClose={() => {}} />)
    expect(screen.getByTestId('fleet-import-preview')).toBeDisabled(); expect(screen.getByTestId('fleet-import-confirm')).toBeDisabled()
    const file = new File([new Uint8Array([1])], 'fleet.xlsx')
    fireEvent.change(screen.getByTestId('fleet-import-file'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByTestId('fleet-import-summary')).toHaveTextContent('2 آلية في الملف'))
    fireEvent.click(screen.getByTestId('fleet-import-preview'))
    expect(h.imp).toHaveBeenLastCalledWith({ rows: (h.parsed as { rows: unknown }).rows, dryRun: true, updateExisting: true }, expect.any(Object))
    expect(screen.getByTestId('fleet-import-result')).toHaveTextContent('معاينة فقط')
    expect(screen.getByTestId('fleet-import-row-1')).toHaveTextContent('جديد'); expect(screen.getByTestId('fleet-import-row-1')).toHaveTextContent('بلا سائق')
    expect(screen.getByTestId('fleet-import-row-2')).toHaveTextContent('المنطقة غير معروفة')
    fireEvent.click(screen.getByTestId('fleet-import-update'))
    expect(screen.queryByTestId('fleet-import-result')).toBeNull()
    fireEvent.click(screen.getByTestId('fleet-import-preview'))
    fireEvent.click(screen.getByTestId('fleet-import-confirm'))
    expect(h.imp).toHaveBeenLastCalledWith({ rows: (h.parsed as { rows: unknown }).rows, dryRun: false, updateExisting: false }, expect.any(Object))
    expect(screen.getByTestId('fleet-import-result')).toHaveTextContent('تم التنفيذ')
  })
})

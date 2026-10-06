/** 00183: استرداد حاويات GBS من Excel — التحليل المرن (إحداثيات مدمجة/رابط خرائط)، round-trip التصدير، الحوار، أزرار الصفحة */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GBS_COLUMNS, buildGbsWorkbook, gbsImportMessage, matchGbsHeader, parseCoords, parseGbsFile, type GbsExportRow, type GbsImportResult } from '@features/gbs/gbs-excel'

const h = vi.hoisted(() => ({ imp: vi.fn(), exp: vi.fn(), parsed: null as unknown }))
vi.mock('@features/gbs/hooks', () => ({ useGbsImport: () => ({ mutate: h.imp, isPending: false }), useGbsExport: () => ({ mutate: h.exp, isPending: false }) }))
vi.mock('@features/gbs/gbs-excel', async (orig) => { const m = await orig<Record<string, unknown>>(); return { ...m, parseGbsFile: (f: unknown) => (h.parsed ? Promise.resolve(h.parsed) : (m.parseGbsFile as (f: unknown) => Promise<unknown>)(f)) } })
import { GbsImportDialog } from '@portals/ops-room/pages/Gbs/GbsImportDialog'

const row: GbsExportRow = { code: 'GBS-0007', label: 'أمام مدرسة الرافدين', latitude: 33.3152, longitude: 44.3661, status: 'damaged', sector_id: 4, area_name: 'القاطع الرابع', parent_sector: 'karrada', notes: 'غطاء مكسور', has_photo: false, updated_at: '2026-01-01T00:00:00Z' }

describe('Excel الحاويات', () => {
  it('المرادفات والإحداثيات بصيغها', () => {
    expect(matchGbsHeader('الموقع')).toBe('label'); expect(matchGbsHeader('خط العرض *')).toBe('latitude'); expect(matchGbsHeader('الإحداثيات')).toBe('coords'); expect(matchGbsHeader('القاطع')).toBe('area'); expect(matchGbsHeader('x')).toBe('longitude')
    expect(parseCoords('33.3152, 44.3661')).toEqual({ lat: '33.3152', lng: '44.3661' }); expect(parseCoords('33.31 44.36')).toEqual({ lat: '33.31', lng: '44.36' }); expect(parseCoords('33.31،44.36')).toEqual({ lat: '33.31', lng: '44.36' })
    expect(parseCoords('https://www.google.com/maps/@33.3152,44.3661,17z')).toEqual({ lat: '33.3152', lng: '44.3661' }); expect(parseCoords('https://maps.google.com/?q=33.31,44.36')).toEqual({ lat: '33.31', lng: '44.36' }); expect(parseCoords('بغداد')).toBeNull()
    expect(gbsImportMessage('GBS_POINT_INVALID')).toContain('الإحداثيات')
  })
  it('round-trip: التصدير يُعاد استيراده', async () => {
    const wb = await buildGbsWorkbook([row])
    expect(wb.getWorksheet('الحاويات')!.getRow(1).values).toEqual([undefined, ...GBS_COLUMNS.map((c) => c.header + (c.required ? ' *' : ''))])
    expect(wb.getWorksheet('ملخص')!.getRow(2).values).toEqual([undefined, 'الكرادة', 'القاطع الرابع', 0, 1, 0, 0, 1])
    const parsed = await parseGbsFile((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    expect(parsed.rows).toEqual([{ code: 'GBS-0007', label: 'أمام مدرسة الرافدين', latitude: '33.3152', longitude: '44.3661', status: 'متضررة', area: '4', notes: 'غطاء مكسور' }])
    expect(parsed.missingRequired).toEqual([])
  })
  it('ملف حر: عنوان قبل الرؤوس، إحداثيات في عمود واحد، صف بلا إحداثيات يُعلَّم محلياً', async () => {
    const ExcelJS = await import('exceljs'); const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('x')
    ws.addRow(['حاويات القاطع الرابع']); ws.addRow(['ت', 'الموقع', 'الإحداثيات', 'الحالة', 'المنطقة'])
    ws.addRow([1, 'شارع 60', '33.30, 44.45', 'سليمة', 'منطقة 7']); ws.addRow([2, 'بلا نقطة', '', 'سليمة', '4']); ws.addRow([3, '', '33,44', '', '4'])
    const p = await parseGbsFile((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    expect(p.headerRow).toBe(2); expect(p.rows).toHaveLength(2); expect(p.skippedEmpty).toBe(1)
    expect(p.rows[0]).toEqual({ label: 'شارع 60', latitude: '33.30', longitude: '44.45', status: 'سليمة', area: 'منطقة 7' })
    expect(p.localErrors).toEqual([{ row: 2, errors: ['GBS_POINT_INVALID'] }]); expect(p.missingRequired).toEqual([])
  })
  it('الحوار: ملف → معاينة → تنفيذ بالنتائج العربية', async () => {
    h.parsed = { rows: [{ label: 'أ', latitude: '33', longitude: '44', area: '4' }], mapped: [{ header: 'الموقع', key: 'label' }], unknownHeaders: [], headerRow: 1, skippedEmpty: 0, missingRequired: [], localErrors: [] }
    const res: GbsImportResult = { dry_run: true, total: 2, inserted: 1, updated: 0, skipped: 1, failed: 1, rows: [
      { row: 1, code: null, label: 'أ', area: 'القاطع الرابع', status: 'ok', latitude: 33, longitude: 44, action: 'inserted', ok: true, id: null, errors: [], warnings: ['GBS_IMPORT_POINT_OUTSIDE_IRAQ'] },
      { row: 2, code: 'GBS-0001', label: 'ب', area: null, status: 'ok', latitude: null, longitude: null, action: 'skipped', ok: false, id: null, errors: ['GBS_IMPORT_AREA_UNKNOWN'], warnings: [] } ] }
    h.imp.mockImplementation((x: { dryRun: boolean }, o: { onSuccess: (r: GbsImportResult) => void }) => o.onSuccess({ ...res, dry_run: x.dryRun }))
    render(<GbsImportDialog onClose={() => {}} />)
    expect(screen.getByTestId('gbs-import-preview')).toBeDisabled()
    fireEvent.change(screen.getByTestId('gbs-import-file'), { target: { files: [new File([new Uint8Array([1])], 'c.xlsx')] } })
    await waitFor(() => expect(screen.getByTestId('gbs-import-summary')).toHaveTextContent('1 حاوية في الملف'))
    fireEvent.click(screen.getByTestId('gbs-import-preview'))
    expect(h.imp).toHaveBeenLastCalledWith({ rows: (h.parsed as { rows: unknown }).rows, dryRun: true, updateExisting: true }, expect.any(Object))
    expect(screen.getByTestId('gbs-import-row-1')).toHaveTextContent('جديدة'); expect(screen.getByTestId('gbs-import-row-1')).toHaveTextContent('خارج العراق'); expect(screen.getByTestId('gbs-import-row-1')).toHaveTextContent('سليمة')
    expect(screen.getByTestId('gbs-import-row-2')).toHaveTextContent('المنطقة غير معروفة')
    fireEvent.click(screen.getByTestId('gbs-import-confirm'))
    expect(h.imp).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false }), expect.any(Object))
    expect(screen.getByTestId('gbs-import-result')).toHaveTextContent('تم التنفيذ')
  })
})

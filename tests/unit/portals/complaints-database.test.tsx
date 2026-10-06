/** قاعدة بيانات الشكاوى (00180): الجدول بالأعمدة الأربعة عشر، الفلاتر، العدادات، وExcel مطابق */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ComplaintDatabaseRow } from '@features/complaints/types'
import { DATABASE_COLUMNS, buildComplaintDatabaseWorkbook, databaseCell, databaseFileName } from '@features/complaints/lib/database-excel'

const base: ComplaintDatabaseRow = { item_id: 'i1', complaint_id: 'c1', reference_no: 'CMP-1', ticket_name: 'CMP-1-1', received_at: '2026-02-05T06:24:00Z', received_date: '2026-02-05', received_time: '09:24', sender_name: 'لجنة الاشراف', municipal_center: 'الرياض', sector: 'الكرادة', shift: 'الصباحية', neighborhood: '908', street: '5', delay_type: 'تراكم النفايات', source: 'البريد الإلكتروني', handler_name: 'مهدي قاسم', item_status: 'approved', completion: 'منجز', hours_to_complete: 5, attachments: 'صور', attachments_count: 1, ack_confirmed: true }
const rows: ComplaintDatabaseRow[] = [
  base,
  { ...base, item_id: 'i2', street: 'شارع مأمون', handler_name: null, completion: 'متأخر', hours_to_complete: null, attachments: 'بلا مرفقات', attachments_count: 0, ack_confirmed: false, item_status: 'under_review' },
  { ...base, item_id: 'i3', sector: 'الزعفرانية', shift: 'المسائية', source: 'إدخال يدوي', completion: 'قيد المعالجة', item_status: 'in_progress' },
]
const h = { args: null as unknown }
vi.mock('@features/complaints', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useComplaintDatabase: (from: string, to: string, sector: string | null) => { h.args = { from, to, sector }; return { data: rows, isLoading: false, isError: false } } }))
import DatabasePage, { monthRange } from '@portals/complaints/pages/Database/DatabasePage'

describe('قاعدة بيانات الشكاوى', () => {
  it('الأعمدة الأربعة عشر بترتيب الملف المعتمد', () => {
    expect(DATABASE_COLUMNS.map((c) => c.header)).toEqual(['التاريخ', 'وقت استلام الشكوى', 'اسم مرسل الشكوى', 'المركز البلدي', 'القاطع', 'الشفت', 'رقم المحلة', 'اسم الشارع', 'نوع التلكؤ', 'مصدر الشكوى', 'المسؤول عن المعالجة', 'هل يعتبر منجز ام متأخر', 'ما نوع المرفقات', 'هل تم تأكيد الأستلام'])
    expect(databaseCell(base, 'ack')).toBe('نعم'); expect(databaseCell(rows[1]!, 'handler_name')).toBe('—')
    expect(monthRange('2026-02')).toEqual(['2026-02-01', '2026-02-28']); expect(monthRange('2026-12')).toEqual(['2026-12-01', '2026-12-31'])
    expect(databaseFileName('2026-02-01', '2026-02-28')).toBe('قاعدة-بيانات-الشكاوى-2026-02.xlsx')
  })
  it('الصفحة: ترويسة الجدول، الصفوف بالقيم، العدادات، وفلتر الشهر يمرر حدود الشهر', () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    const table = screen.getByTestId('db-table')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(DATABASE_COLUMNS.map((c) => c.header))
    const r1 = screen.getByTestId('db-row-i1')
    expect(screen.getByTestId('db-sheet-banner')).toHaveTextContent('قاعدة بيانات الشكاوى'); expect(screen.getByTestId('db-sheet-banner').querySelectorAll('img')).toHaveLength(2)
    for (const v of ['2026-02-05', '09:24', 'لجنة الاشراف', 'الرياض', 'الكرادة', 'الصباحية', '908', '5', 'تراكم النفايات', 'البريد الإلكتروني', 'مهدي قاسم', 'منجز', 'صور', 'نعم']) expect(r1).toHaveTextContent(v)
    expect(screen.getByTestId('db-row-i2')).toHaveTextContent('متأخر'); expect(screen.getByTestId('db-row-i2')).toHaveTextContent('لا')
    expect(screen.getByTestId('db-k-total')).toHaveTextContent('3'); expect(screen.getByTestId('db-k-done')).toHaveTextContent('1'); expect(screen.getByTestId('db-k-late')).toHaveTextContent('1'); expect(screen.getByTestId('db-k-acked')).toHaveTextContent('2')
    expect(table.textContent).not.toMatch(/[\u0660-\u0669]/)
    fireEvent.change(screen.getByTestId('db-month'), { target: { value: '2026-02' } })
    expect(h.args).toEqual({ from: '2026-02-01', to: '2026-02-28', sector: null })
    fireEvent.change(screen.getByTestId('db-sector'), { target: { value: 'zaafaraniya' } })
    expect((h.args as { sector: string }).sector).toBe('zaafaraniya')
  })
  it('فلتر حالة الإنجاز والبحث يعملان', () => {
    render(<MemoryRouter><DatabasePage /></MemoryRouter>)
    fireEvent.change(screen.getByTestId('db-completion'), { target: { value: 'متأخر' } })
    expect(screen.queryByTestId('db-row-i1')).toBeNull(); expect(screen.getByTestId('db-row-i2')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('db-completion'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText(/بحث بالمرسل/), { target: { value: 'مأمون' } })
    expect(screen.getAllByTestId(/^db-row-/)).toHaveLength(1)
  })
  it('Excel: عنوان كبير، ترويسة خضراء بالأعمدة نفسها، صف لكل شكوى بقيم الجدول حرفياً', async () => {
    const wb = await buildComplaintDatabaseWorkbook(rows, { from: '2026-02-01', to: '2026-02-28', sectorLabel: 'كل القواطع' })
    const ws = wb.getWorksheet('قاعدة بيانات الشكاوى')!
    expect(ws.getCell('A1').value).toBe('قاعدة بيانات الشكاوى')
    expect(ws.getRow(2).values).toEqual([undefined, ...DATABASE_COLUMNS.map((c) => c.header)])
    expect((ws.getRow(2).getCell(1).fill as { fgColor: { argb: string } }).fgColor.argb).toBe('FFC6E0A5')
    expect(ws.getRow(3).values).toEqual([undefined, ...DATABASE_COLUMNS.map((c) => databaseCell(base, c.key))])
    expect(ws.rowCount).toBe(2 + rows.length)
    expect(ws.views[0]?.rightToLeft).toBe(true)
  })
})

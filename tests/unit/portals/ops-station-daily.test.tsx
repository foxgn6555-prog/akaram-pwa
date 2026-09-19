/** التقرير اليومي للمحطة في غرفة العمليات: مجاميع/صادر/مخالفات/إرسال للمعاون */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ report: vi.fn(), send: vi.fn() }))
vi.mock('@features/transfer-station', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    useOpsDailyReport: () => ({ data: h.report(), isLoading: false }),
    useSendDailyToDeputy: () => ({ mutate: h.send, isPending: false, error: null }),
  }
})
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: vi.fn().mockResolvedValue({}) }))

import StationDailyReportPage from '@portals/ops-room/pages/StationDaily/StationDailyReportPage'

const REPORT = {
  day: '2026-09-18',
  inbound: [
    { db_number: 'DB-1', driver_name: 'سائق أول', area_name: 'قطاع 7', weight_tons: 5, destination_label: 'المكبس', kind_label: 'كابسة وسط', arrived_at: '2026-09-18T08:00:00Z', weighed_at: '2026-09-18T08:10:00Z', completed_at: '2026-09-18T08:12:00Z', violation: false },
    { db_number: 'DB-2', driver_name: 'سائق ثان', area_name: 'قطاع 7', weight_tons: 1.5, destination_label: 'المحطة التحويلية', kind_label: 'كيا', arrived_at: '2026-09-18T09:00:00Z', weighed_at: '2026-09-18T09:10:00Z', completed_at: '2026-09-18T09:12:00Z', violation: true, deficit_tons: 0.5 },
  ],
  inbound_totals: { press: { count: 1, tons: 5 }, transfer_station: { count: 1, tons: 1.5 }, total_count: 2, total_tons: 6.5 },
  outbound: { saksat: { count: 1, tons: 10 }, trips: { count: 1, tons: 25 }, carrier: { count: 1, tons: 16 }, total_count: 3, total_tons: 51 },
  violations: [{ driver_name: 'سائق ثان', db_number: 'DB-2', kind_label: 'كيا', weight_tons: 1.5, min_tons: 2 }],
}

beforeEach(() => { h.report.mockReset(); h.send.mockReset(); h.report.mockReturnValue(REPORT) })

describe('التقرير اليومي للمحطة — غرفة العمليات', () => {
  it('يعرض البطاقات والمجاميع حسب الوجهة وموقف الصادرات', () => {
    render(<StationDailyReportPage />)
    expect(screen.getByTestId('ops-station-daily-page')).toBeInTheDocument()
    expect(screen.getByText('6.50 طن')).toBeInTheDocument()
    expect(screen.getByText('51.00 طن')).toBeInTheDocument()
    expect(screen.getByTestId('daily-outbound')).toHaveTextContent('ناقلة حاويات مكبسية')
    expect(screen.getByTestId('daily-outbound')).toHaveTextContent('16.00')
    expect(screen.getAllByText('1 شحنة').length).toBeGreaterThan(0)
  })

  it('يعرض تفاصيل الداخلة وشارة المخالفة', () => {
    render(<StationDailyReportPage />)
    expect(screen.getByTestId('daily-inbound-table')).toHaveTextContent('DB-1')
    expect(screen.getByTestId('daily-violations')).toHaveTextContent('سائق ثان')
    expect(screen.getByText(/مخالفة −0.50 طن/)).toBeInTheDocument()
  })

  it('يرسل اليوم إلى المعاون بعد تأكيد التدقيق', () => {
    render(<StationDailyReportPage />)
    fireEvent.click(screen.getByTestId('daily-send'))
    fireEvent.change(screen.getByTestId('daily-send-note'), { target: { value: 'دقيق' } })
    fireEvent.click(screen.getByTestId('daily-send-confirm'))
    expect(h.send).toHaveBeenCalledWith({ day: expect.any(String), note: 'دقيق' }, expect.any(Object))
  })
})

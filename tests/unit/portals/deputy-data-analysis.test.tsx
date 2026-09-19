/** وحدة تحليل البيانات في بوابة المعاون: مؤشرات ورسوم وتنبؤ من تقارير العمليات */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@features/transfer-station', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, useDeputyDailyReports: () => ({ data: h.list(), isLoading: false }) }
})
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: vi.fn().mockResolvedValue({}) }))

import DataAnalysisPage from '@portals/deputy/pages/DataAnalysis/DataAnalysisPage'

const day = (reportDay: string, inbound: number, outbound: number) => ({
  report_day: reportDay,
  sent_at: `${reportDay}T18:00:00Z`,
  sender_name: 'غرفة العمليات',
  note: null,
  payload: {
    inbound_totals: { press: { count: 1, tons: inbound * 0.6 }, transfer_station: { count: 1, tons: inbound * 0.4 }, total_count: 2, total_tons: inbound },
    outbound: { saksat: { count: 1, tons: outbound * 0.5 }, trips: { count: 1, tons: outbound * 0.5 }, carrier: { count: 0, tons: 0 }, total_count: 2, total_tons: outbound },
    inbound: [],
    violations: [],
  },
})

beforeEach(() => { h.list.mockReset(); h.list.mockReturnValue([day('2026-09-14', 10, 8), day('2026-09-15', 12, 9), day('2026-09-16', 14, 10), day('2026-09-17', 16, 12)]) })

describe('وحدة تحليل البيانات — المعاون', () => {
  it('يعرض المؤشرات المركبة والتنبؤ والاتجاه', () => {
    render(<DataAnalysisPage />)
    expect(screen.getByTestId('data-analysis-page')).toBeInTheDocument()
    expect(screen.getByText('52 طن')).toBeInTheDocument() // إجمالي الوارد
    expect(screen.getByTestId('forecast-card')).toHaveTextContent('طن')
    expect(screen.getByTestId('trend-card')).toHaveTextContent('اتجاه تصاعدي')
  })

  it('يعرض جدول اليوميات المدققة بترتيب تنازلي', () => {
    render(<DataAnalysisPage />)
    const table = screen.getByTestId('analysis-table')
    expect(table).toHaveTextContent('2026-09-17')
    expect(table).toHaveTextContent('16.00')
  })

  it('يعرض حالة عدم وجود تقارير بعد', () => {
    h.list.mockReturnValue([])
    render(<DataAnalysisPage />)
    expect(screen.getByText('لا توجد تقارير يومية بعد')).toBeInTheDocument()
  })
})

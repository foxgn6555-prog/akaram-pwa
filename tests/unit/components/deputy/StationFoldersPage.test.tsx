/** فولدر المحطة لمعاون المدير — النمط الجديد: فولدرات يومية مدققة واردة من غرفة العمليات */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  reports: vi.fn(),
}))

vi.mock('@features/transfer-station', () => ({
  useDeputyDailyReports: () => ({ data: h.reports(), isLoading: false }),
  UNIT_CAPACITIES: {
    saksat: { label: 'السكسات الخارجة', tons: 10 },
    trips: { label: 'النسافات الخارجة', tons: 25 },
    carrier: { label: 'ناقلة حاويات مكبسية', tons: 16 },
  },
}))

import StationFoldersPage from '@portals/deputy/pages/StationFolders/StationFoldersPage'

const REPORT = {
  report_day: '2026-09-18',
  sent_at: '2026-09-18T18:05:00Z',
  sender_name: 'عمليات الرصافة',
  note: 'تدقيق كامل قبل الإرسال',
  payload: {
    day: '2026-09-18',
    inbound_totals: {
      press: { count: 6, tons: 24 },
      transfer_station: { count: 3, tons: 12.5 },
      total_count: 9,
      total_tons: 36.5,
    },
    outbound: {
      saksat: { count: 4, tons: 40, capacity: 10 },
      trips: { count: 2, tons: 50, capacity: 25 },
      carrier: { count: 1, tons: 16, capacity: 16 },
      total_count: 7,
      total_tons: 106,
    },
    violations: [{ id: 'v1' }],
  },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StationFoldersPage />
    </MemoryRouter>,
  )
}

describe('StationFoldersPage — فولدر المحطة بالنمط الجديد', () => {
  it('يعرض العنوان ووصف التدفق: المحطة ← غرفة العمليات ← المعاون', () => {
    h.reports.mockReturnValue([])
    renderPage()
    expect(screen.getByTestId('station-folders-page')).toBeInTheDocument()
    expect(screen.getByText('فولدر المحطة')).toBeInTheDocument()
    expect(
      screen.getByText(
        'فولدرات يومية مدققة واردة من غرفة العمليات — النمط: المحطة ← غرفة العمليات ← المعاون',
      ),
    ).toBeInTheDocument()
  })

  it('يعرض حالة فارغة تشرح مصدر الإرسال عندما لا توجد فولدرات', () => {
    h.reports.mockReturnValue([])
    renderPage()
    expect(screen.getByTestId('station-folders-empty')).toBeInTheDocument()
    expect(screen.getByText('لا توجد فولدرات واردة بعد')).toBeInTheDocument()
  })

  it('يعرض الفولدر اليومي بوحداته الثلاث ومجاميعه ومخالفاته', () => {
    h.reports.mockReturnValue([REPORT])
    renderPage()
    const folder = screen.getByTestId('deputy-folder-2026-09-18')
    expect(within(folder).getByText('عمليات الرصافة', { exact: false })).toBeInTheDocument()
    expect(within(folder).getByText(/تدقيق كامل قبل الإرسال/)).toBeInTheDocument()

    const saksat = within(folder).getByTestId('folder-unit-saksat')
    expect(within(saksat).getByText('السكسات الخارجة')).toBeInTheDocument()
    expect(within(saksat).getByText('4')).toBeInTheDocument()
    expect(within(saksat).getByText('40.0')).toBeInTheDocument()
    expect(within(saksat).getByText(/قياسي 10 طن/)).toBeInTheDocument()

    const trips = within(folder).getByTestId('folder-unit-trips')
    expect(within(trips).getByText('النسافات الخارجة')).toBeInTheDocument()
    expect(within(trips).getByText(/قياسي 25 طن/)).toBeInTheDocument()

    const carrier = within(folder).getByTestId('folder-unit-carrier')
    expect(within(carrier).getByText(/قياسي 16 طن/)).toBeInTheDocument()

    expect(within(folder).getByText('9')).toBeInTheDocument() // شحنات واردة
    expect(within(folder).getByText('36.5')).toBeInTheDocument() // أطنان واردة
    expect(within(folder).getByText('7 شحنة · 106.0 طن')).toBeInTheDocument()
    // مخالفات الوزن — تُقرأ من بطاقتها لأن القيمة 1 تتكرر مع عدد الناقلات
    expect(within(folder).getByText('مخالفات الوزن').parentElement).toHaveTextContent('1')
  })

  it('يرتب الفولدرات من الأحدث إلى الأقدم', () => {
    h.reports.mockReturnValue([
      REPORT,
      { ...REPORT, report_day: '2026-09-19', note: null },
    ])
    renderPage()
    const folders = screen
      .getAllByTestId(/^deputy-folder-/)
      .map((el) => el.getAttribute('data-testid'))
    expect(folders).toEqual(['deputy-folder-2026-09-19', 'deputy-folder-2026-09-18'])
  })
})

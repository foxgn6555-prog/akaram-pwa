import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ excel: vi.fn() }))
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: h.excel }))
const summary = {
  departure_id: 'd1',
  vehicle_name: 'كابسة',
  db_number: 'DB-1',
  driver_name: 'علي',
  shift: 'morning',
  sector_id: 1,
  area_name: 'أرخيته',
  manager_name: 'مسؤول',
  started_at: '2026-09-09T06:00:00Z',
  completed_at: '2026-09-09T14:00:00Z',
  total_minutes: 480,
  movement_minutes: 60,
  productive_minutes: 300,
  station_minutes: 45,
  maintenance_minutes: 30,
  downtime_minutes: 35,
  other_minutes: 45,
  station_visit_count: 2,
  breakdown_count: 1,
  maintenance_count: 1,
}
vi.mock('@features/vehicle-operations/hooks', () => ({
  useOpsAlerts: () => ({
    data: [
      {
        alert_id: 'a1',
        severity: 'critical',
        title: 'تجاوز موعد إنجاز الصيانة',
        details: 'حالة متأخرة',
        db_number: 'DB-1',
        area_name: 'أرخيته',
        elapsed_minutes: 90,
        threshold_minutes: 0,
        departure_id: 'd1',
        action_link: '/maintenance/vehicle-cases',
        shift: 'morning',
        sector_id: 1,
      },
    ],
  }),
  useOpsVehicleKpis: () => ({ data: [summary] }),
  useOpsMovements: () => ({ data: [] }),
  useOpsStationVisits: () => ({
    data: [
      {
        visit_id: 'x',
        departure_id: 'd1',
        vehicle_name: 'كابسة',
        db_number: 'DB-1',
        shift: 'morning',
        sector_id: 1,
        area_name: 'أرخيته',
        stay_minutes: 45,
      },
    ],
  }),
  useOpsGarageTrips: () => ({ data: [] }),
  useOpsMaintenance: () => ({
    data: [
      {
        case_id: 'c1',
        vehicle_name: 'كابسة',
        db_number: 'DB-1',
        fault_type: 'محرك',
        status: 'in_repair',
        progress: 50,
      },
    ],
  }),
  useMaintenanceEvents: () => ({
    data: [
      {
        event_key: 'case:reported',
        event_type: 'case',
        title: 'تسجيل العطل وإرسال الآلية',
        details: 'محرك',
        happened_at: '2026-09-09T08:00:00Z',
        progress: 0,
      },
    ],
    isLoading: false,
  }),
  useOpsAttendance: () => ({ data: [] }),
}))
import OperationsDataPage from '@portals/ops-room/pages/OperationsData/OperationsDataPage'
describe('تقارير غرفة العمليات المركبة', () => {
  beforeEach(() => h.excel.mockReset())
  it('يعرض توزيع الوقت وعدد زيارات المحطة', () => {
    render(<OperationsDataPage />)
    expect(screen.getAllByText('5 س 0 د').length).toBeGreaterThan(0)
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'وقت العمل المنتج محسوب من فترات وجود الآلية في موقع العمل بعد طرح الأعطال القصيرة، مع فصل الحركة والمحطة والصيانة.',
      ),
    ).toBeInTheDocument()
  })
  it('يخصص أعمدة ملف Excel ويصدر البيانات المفلترة', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-columns-toggle'))
    const panel = screen.getByTestId('ops-columns-toggle').parentElement as HTMLElement
    fireEvent.click(within(panel).getByRole('button', { name: /وقت الحركة/ }))
    fireEvent.click(screen.getByTestId('ops-export-excel'))
    expect(h.excel).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'الملخص المركب',
        rows: [expect.objectContaining({ shift: 'صباحي', total_minutes: '8 س 0 د' })],
      }),
    )
    const call = h.excel.mock.calls[0]![0] as { columns: { key: string }[] }
    expect(call.columns.some((column: { key: string }) => column.key === 'movement_minutes')).toBe(
      false,
    )
    expect(
      call.columns.some((column: { key: string }) => column.key === 'productive_minutes'),
    ).toBe(true)
  })
  it('يوفر تقريراً مستقلاً لزيارات المحطة', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-station'))
    expect(screen.getByRole('columnheader', { name: 'مدة البقاء' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '45 د' })).toBeInTheDocument()
  })
  it('يفتح تسلسل الصيانة من غرفة العمليات', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-maintenance'))
    fireEvent.click(screen.getByRole('button', { name: 'فتح التسلسل' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('تسجيل العطل وإرسال الآلية')).toBeInTheDocument()
  })
  it('يعرض التنبيهات الحية ودرجة الخطورة ورابط المعالجة', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-alerts'))
    expect(screen.getByTestId('ops-alert-a1')).toHaveTextContent('تجاوز موعد إنجاز الصيانة')
    expect(screen.getByTestId('ops-alert-a1')).toHaveTextContent('حرج')
    expect(screen.getByRole('link', { name: 'فتح جهة المعالجة' })).toHaveAttribute(
      'href',
      '/maintenance/vehicle-cases',
    )
    fireEvent.click(screen.getByTestId('ops-export-excel'))
    const exported = h.excel.mock.calls[0]![0] as { rows: Record<string, string>[] }
    expect(exported.rows[0]).toEqual(
      expect.objectContaining({
        severity: 'حرج',
        shift: 'صباحي',
        action_link: 'الصيانة — حالات الآليات',
      }),
    )
  })
})

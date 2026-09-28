import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({
  setDriver: vi.fn(),
  resolveBreakdown: vi.fn(),
  correctCase: vi.fn(),
  saveKind: vi.fn(),
  correct: vi.fn(),
  workflowRange: vi.fn(),
  excel: vi.fn(),
  cancelSupport: vi.fn(),
  support: [
    {
      id: 'r1', status: 'accepted', requester_user_id: 'mB', requester_name: 'مسؤول أرخيته', requester_sector_id: 1, requester_area_name: 'أرخيته', requester_parent_sector: 'karrada',
      target_user_id: 'mA', target_name: 'مسؤول الجادرية', needed_count: 1, reason: 'تراكم نفايات', decision_note: null, cancel_reason: null,
      created_at: '2026-09-28T06:00:00Z', decided_at: '2026-09-28T06:10:00Z', completed_at: null,
      assignments: [{ id: 'a1', departure_id: 'd1', vehicle_id: 'v1', vehicle_name: 'كابسة 1', db_number: 'DB-1', driver_name: 'علي', from_sector_id: 4, to_sector_id: 1, started_at: '2026-09-28T06:10:00Z', ended_at: null, end_kind: null, end_note: null, trip_status: 'at_site' }],
    },
    {
      id: 'r2', status: 'rejected', requester_user_id: 'mB', requester_name: 'مسؤول أرخيته', requester_sector_id: 1, requester_area_name: 'أرخيته', requester_parent_sector: 'karrada',
      target_user_id: 'mA', target_name: 'مسؤول الجادرية', needed_count: 2, reason: 'سوق', decision_note: 'لا تتوفر آليات', cancel_reason: null,
      created_at: '2026-09-28T05:00:00Z', decided_at: '2026-09-28T05:05:00Z', completed_at: null, assignments: [],
    },
  ] as Record<string, unknown>[],
  gbs: [
    {
      id: 'g1',
      code: 'GBS-0001',
      label: 'حاوية الكرادة',
      latitude: 33.3,
      longitude: 44.4,
      status: 'ok',
      imagePath: 'gbs/g1.jpg',
      notes: 'بجانب المدرسة',
      updatedAt: '2026-09-21T08:00:00Z',
      pendingCount: 2,
      sectorId: 4,
      areaName: 'الجادرية',
      parentSector: 'karrada',
    },
    {
      id: 'g2',
      code: 'GBS-0002',
      label: 'حاوية الزعفرانية',
      latitude: 33.2,
      longitude: 44.5,
      status: 'missing',
      imagePath: null,
      notes: null,
      updatedAt: '2026-09-20T08:00:00Z',
      pendingCount: 0,
      sectorId: 6,
      areaName: 'الزعفرانية',
      parentSector: 'zaafaraniya',
    },
  ] as unknown[],
  weighings: [
    {
      visit_id: 'v1',
      departure_id: 'd9',
      trip_day: '2026-09-19',
      db_number: 'DB-9',
      vehicle_name: 'كابسة تسع',
      driver_name: 'سائق تسع',
      shift: 'morning',
      sector_id: 4,
      parent_sector: 'karrada',
      area_name: 'الجادرية',
      manager_name: 'مسؤول',
      inbound_departed_at: '2026-09-19T06:30:00Z',
      arrived_at: '2026-09-19T06:50:00Z',
      weighed_at: '2026-09-19T07:00:00Z',
      completed_at: '2026-09-19T07:10:00Z',
      dispatched_at: '2026-09-19T07:15:00Z',
      weight_tons: 5,
      destination_label: 'المكبس',
      destination: 'press',
      vehicle_kind: 'compactor_medium',
      kind_label: 'كابسة وسط',
      min_tons: 4,
      violation: false,
      deficit_tons: null,
      transit_minutes: 20,
      weigh_wait_minutes: 10,
      process_minutes: 25,
      stay_minutes: 45,
    },
    {
      visit_id: 'v2',
      departure_id: 'd9',
      trip_day: '2026-09-19',
      db_number: 'DB-9',
      vehicle_name: 'كابسة تسع',
      driver_name: 'سائق تسع',
      shift: 'morning',
      sector_id: 4,
      parent_sector: 'karrada',
      area_name: 'الجادرية',
      manager_name: 'مسؤول',
      inbound_departed_at: '2026-09-19T08:30:00Z',
      arrived_at: '2026-09-19T08:50:00Z',
      weighed_at: '2026-09-19T09:00:00Z',
      completed_at: '2026-09-19T09:10:00Z',
      dispatched_at: '2026-09-19T09:15:00Z',
      weight_tons: 6,
      destination_label: 'المكبس',
      kind_label: 'كابسة وسط',
      min_tons: 4,
      violation: false,
      deficit_tons: null,
      transit_minutes: 20,
      weigh_wait_minutes: 10,
      process_minutes: 25,
      stay_minutes: 45,
    },
    {
      visit_id: 'v3',
      departure_id: 'd10',
      trip_day: '2026-09-19',
      db_number: 'DB-10',
      vehicle_name: 'كابسة عشر',
      driver_name: 'سائق عشر',
      shift: 'morning',
      sector_id: 6,
      parent_sector: 'zaafaraniya',
      area_name: 'الزعفرانية',
      manager_name: 'مسؤول',
      inbound_departed_at: '2026-09-19T06:40:00Z',
      arrived_at: '2026-09-19T07:00:00Z',
      weighed_at: '2026-09-19T07:20:00Z',
      completed_at: '2026-09-19T07:30:00Z',
      dispatched_at: '2026-09-19T07:35:00Z',
      weight_tons: 7,
      destination_label: 'المحطة التحويلية',
      kind_label: 'كيا',
      min_tons: 2,
      violation: false,
      deficit_tons: null,
      transit_minutes: 20,
      weigh_wait_minutes: 10,
      process_minutes: 30,
      stay_minutes: 55,
    },
  ],
}))
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: h.excel }))
vi.mock('@features/central-garage/hooks', () => ({
  useFleetDriverOptions: (search: string) => ({
    data:
      search.trim().length >= 2
        ? [
            {
              employeeId: 'e0000000-0000-0000-0000-000000000002',
              fullName: 'كريم سعد',
              employeeNumber: 'EMP-2',
              jobTitle: 'سائق',
              departmentName: 'الآليات',
              hasBiometric: true,
              employmentStatus: 'active',
              assignedVehicles: [],
            },
          ]
        : [],
    isLoading: false,
  }),
  useSetDepartureDriver: () => ({ mutate: h.setDriver, isPending: false }),
}))
vi.mock('@features/gbs/hooks', () => ({
  useGbsContainers: () => ({ data: h.gbs, isLoading: false }),
}))
vi.mock('@features/sector', () => ({
  useOpsSupportRequests: () => ({ data: h.support, isLoading: false }),
  useCancelSupportRequest: () => ({ mutate: h.cancelSupport, isPending: false }),
}))
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
  work_started_at: '2026-09-09T06:20:00Z',
  site_departed_at: '2026-09-09T13:40:00Z',
  completed_at: '2026-09-09T14:00:00Z',
  trip_status: 'returned',
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
vi.mock('@features/transfer-station', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    useOpsWorkflowRange: (from: string, to: string) => { h.workflowRange(from, to); return { data: h.weighings, isLoading: false } },
    useSectorTonnage: () => ({ data: [{ parent_sector: 'karrada', inbound_count: 4, inbound_tons: 31.5, press_tons: 20, station_tons: 11.5, violation_count: 1 }], isLoading: false }),
    useVehicleKinds: () => ({
      kinds: (original.VEHICLE_KINDS as unknown[]),
      rows: [
        { kind: 'compactor_large', label: 'كابسة كبيرة', min_tons: '6', max_tons: '8', destination: 'both', sort: 3, active: true },
        { kind: 'kia', label: 'كيا', min_tons: '2', max_tons: null, destination: 'transfer_station', sort: 4, active: false },
      ],
      isLoading: false,
    }),
    useSaveVehicleKind: () => ({ mutate: h.saveKind, isPending: false }),
    useCorrectWeighing: () => ({ mutate: h.correct, isPending: false, error: null }),
  }
})
vi.mock('@features/vehicle-operations/hooks', () => ({
  useCorrectMaintenanceCase: () => ({ mutate: h.correctCase, isPending: false }),
  useOpsResolveBreakdown: () => ({ mutate: h.resolveBreakdown, isPending: false }),
  useOpsAlerts: () => ({
    data: [
      {
        alert_id: 'a1',
        alert_type: 'maintenance_overdue',
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
      {
        alert_id: 'a2',
        alert_type: 'breakdown_stale',
        severity: 'warning',
        title: 'عطل مفتوح دون حسم',
        details: 'العطل المفتوح للآلية DB-2: انثقاب إطار',
        db_number: 'DB-2',
        area_name: 'أرخيته',
        elapsed_minutes: 250,
        threshold_minutes: 240,
        departure_id: 'd2',
        action_link: '/manager/breakdown',
        shift: 'morning',
        sector_id: 1,
      },
    ],
  }),
  useOpsVehicleKpis: () => ({ data: [summary] }),
  useOpsMovements: () => ({
    data: [
      {
        leg_id: 'l1',
        departure_id: 'd1',
        vehicle_name: 'كابسة',
        db_number: 'DB-1',
        driver_name: 'علي',
        shift: 'morning',
        sector_id: 1,
        area_name: 'أرخيته',
        manager_name: 'مسؤول',
        origin_type: 'work_site',
        destination_type: 'transfer_station',
        origin_label: 'موقع العمل',
        destination_label: 'المحطة التحويلية',
        departed_at: '2026-09-09T08:00:00Z',
        arrived_at: null,
        duration_minutes: null,
      },
    ],
  }),
  useOpsDepartureTimeline: (id: string | null) => ({
    data: id
      ? [
          { event_key: 'departure:garage', event_type: 'departure', title: 'انطلقت من الكراج المركزي', details: 'السائق علي · صباحي · أرخيته', happened_at: '2026-09-09T06:00:00Z', minutes_since_prev: 0, sequence_no: 1 },
          { event_key: 'departure:site-arrived', event_type: 'work_start', title: 'وصلت موقع العمل — بدء العمل الفعلي', details: null, happened_at: '2026-09-09T06:20:00Z', minutes_since_prev: 20, sequence_no: 2 },
          { event_key: 'weighing:w1', event_type: 'weighing', title: 'وزن في المحطة — نقص عن الحد الأدنى', details: '3.50 طن · المكبس · النقص 1.50 طن عن الحد 5', happened_at: '2026-09-09T09:00:00Z', minutes_since_prev: 160, sequence_no: 3 },
          { event_key: 'departure:returned', event_type: 'departure', title: 'عادت إلى الكراج المركزي — انتهاء الانطلاقية', details: null, happened_at: '2026-09-09T14:00:00Z', minutes_since_prev: 300, sequence_no: 4 },
        ]
      : [],
    isLoading: false,
    isError: false,
  }),
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
      {
        id: 'c2',
        case_id: 'c2',
        vehicle_name: 'كابسة',
        db_number: 'DB-2',
        fault_type: 'فرامل',
        priority: 'urgent',
        status: 'returned_to_work',
        progress: 100,
        completed_at: '2026-09-09T12:00:00Z',
        diagnosis: 'تلف أسطوانة',
        work_notes: null,
        parts_notes: null,
        assigned_technician: 'الفني علي',
        estimated_cost: 100,
        service_cost: 80,
        parts_actual_cost: 20,
        actual_cost: 100,
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
    expect(screen.getByText('بصمة النشاط ضمن الفترة المحددة')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'آخر 7 أيام' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /تصفير الفلاتر/ })).toBeInTheDocument()
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
    fireEvent.click(screen.getAllByRole('button', { name: 'فتح التسلسل' })[0] as HTMLElement)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('تسجيل العطل وإرسال الآلية')).toBeInTheDocument()
  })
  it('يعرض التنبيهات الحية ودرجة الخطورة ورابط المعالجة', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-alerts'))
    expect(screen.getByTestId('ops-alert-a1')).toHaveTextContent('تجاوز موعد إنجاز الصيانة')
    expect(screen.getByTestId('ops-alert-a1')).toHaveTextContent('حرج')
    expect(screen.getAllByRole('link', { name: 'فتح جهة المعالجة' })[0] as HTMLElement).toHaveAttribute(
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

  it('يعرض تقرير أطنان القواطع مترجماً', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByText('أطنان القواطع'))
    expect(screen.getAllByText('الكرادة').length).toBeGreaterThan(0)
    expect(screen.getByText('31.5')).toBeInTheDocument()
  })

  it('يفصل زيارات الانطلاقة الواحدة بصفوف مستقلة ومفاتيح فريدة', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-weighings'))
    expect(screen.getAllByText('DB-9')).toHaveLength(2)
    expect(screen.getByText('DB-10')).toBeInTheDocument()
    const dupKey = err.mock.calls.find((call) => String(call[0]).includes('same key'))
    expect(dupKey).toBeUndefined()
    err.mockRestore()
  })

  it('يفلتر الأوزان حسب القاطع ثم المنطقة', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-weighings'))
    expect(screen.getByRole('columnheader', { name: 'القاطع' })).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('ops-parent-sector-filter'), {
      target: { value: 'zaafaraniya' },
    })
    expect(screen.queryByText('DB-9')).not.toBeInTheDocument()
    expect(screen.getByText('DB-10')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('ops-parent-sector-filter'), {
      target: { value: 'karrada' },
    })
    expect(screen.getAllByText('DB-9')).toHaveLength(2)
    expect(screen.queryByText('DB-10')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('المنطقة'), { target: { value: '4' } })
    expect(screen.getAllByText('DB-9')).toHaveLength(2)
    fireEvent.change(screen.getByTestId('ops-parent-sector-filter'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('المنطقة'), { target: { value: '6' } })
    expect(screen.queryByText('DB-9')).not.toBeInTheDocument()
    expect(screen.getByText('DB-10')).toBeInTheDocument()
  })

  it('يعرض تبويب حاويات GBS مترجماً مع إحصاءات الحالات', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-gbs'))
    expect(screen.getByRole('columnheader', { name: 'رمز الحاوية' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'طلبات تحديث معلّقة' })).toBeInTheDocument()
    expect(screen.getByText('GBS-0001')).toBeInTheDocument()
    expect(screen.getByText('GBS-0002')).toBeInTheDocument()
    expect(screen.getAllByText('سليمة').length).toBeGreaterThan(0)
    expect(screen.getAllByText('الكرادة').length).toBeGreaterThan(0)
    expect(screen.getAllByText('الجادرية').length).toBeGreaterThan(0)
    expect(screen.getByText('33.300000')).toBeInTheDocument()
    expect(screen.getByTestId('gbs-stat-ok')).toHaveTextContent('1')
    expect(screen.getByTestId('gbs-stat-missing')).toHaveTextContent('1')
    expect(screen.getByTestId('gbs-stat-replace')).toHaveTextContent('0')
    // لا مفاتيح مكررة أو مفقودة في React (عقد معتمد)
    const keyWarn = err.mock.calls.find((call) => String(call[0]).includes('key'))
    expect(keyWarn).toBeUndefined()
    err.mockRestore()
  })

  it('يصدر كل بيانات الحاويات بملف Excel الاحترافي مع رسم الحالات', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-gbs'))
    fireEvent.click(screen.getByTestId('ops-export-excel'))
    expect(h.excel).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'حاويات GBS',
        fileName: expect.stringContaining('حاويات-GBS-'),
        rows: [
          expect.objectContaining({
            code: 'GBS-0001',
            label: 'حاوية الكرادة',
            status: 'سليمة',
            parent_sector: 'الكرادة',
            area_name: 'الجادرية',
            latitude: '33.300000',
            longitude: '44.400000',
            pending_updates: '2',
            has_image: 'نعم',
            notes: 'بجانب المدرسة',
          }),
          expect.objectContaining({
            code: 'GBS-0002',
            status: 'مفقودة',
            parent_sector: 'الزعفرانية',
            has_image: 'لا',
            notes: '—',
          }),
        ],
      }),
    )
    const call = h.excel.mock.calls[0]![0] as {
      columns: { header: string }[]
      charts?: { kind: string; data: { label: string; value: number }[] }[]
    }
    expect(call.columns.map((column) => column.header)).toContain('رمز الحاوية')
    expect(call.columns.map((column) => column.header)).toContain('خط العرض')
    expect(call.charts).toHaveLength(1)
    expect(call.charts![0]!.kind).toBe('donut')
    expect(call.charts![0]!.data).toEqual([
      { label: 'سليمة', value: 1, color: '#16a34a' },
      { label: 'متضررة', value: 0, color: '#eab308' },
      { label: 'يجب استبدالها', value: 0, color: '#dc2626' },
      { label: 'مفقودة', value: 1, color: '#64748b' },
    ])
  })

  it('يفلتر الحاويات حسب القاطع ثم المنطقة', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-gbs'))
    fireEvent.change(screen.getByTestId('ops-parent-sector-filter'), {
      target: { value: 'zaafaraniya' },
    })
    expect(screen.queryByText('GBS-0001')).not.toBeInTheDocument()
    expect(screen.getByText('GBS-0002')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('ops-parent-sector-filter'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('المنطقة'), { target: { value: '4' } })
    expect(screen.getByText('GBS-0001')).toBeInTheDocument()
    expect(screen.queryByText('GBS-0002')).not.toBeInTheDocument()
  })
  it('تغيير سائق انطلاقية من الملخص: يتطلب موظفاً من HR وسبباً ثم يستدعي ops_set_departure_driver', async () => {
    h.setDriver.mockReset()
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('change-departure-driver-d1'))
    expect(screen.getByTestId('departure-driver-current')).toHaveTextContent('علي')
    fireEvent.click(screen.getByTestId('departure-driver-submit'))
    expect(screen.getByText('اختر السائق من قائمة الموظفين')).toBeInTheDocument()
    expect(screen.getByText(/سبب التغيير مطلوب/)).toBeInTheDocument()
    expect(h.setDriver).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('departure-driver-search'), { target: { value: 'كريم' } })
    fireEvent.click(await screen.findByTestId('departure-driver-option-EMP-2'))
    fireEvent.change(screen.getByTestId('departure-driver-reason'), { target: { value: 'السائق الفعلي حسب البصمة' } })
    fireEvent.click(screen.getByTestId('departure-driver-submit'))
    expect(h.setDriver).toHaveBeenCalledWith(
      { departureId: 'd1', driverEmployeeId: 'e0000000-0000-0000-0000-000000000002', reason: 'السائق الفعلي حسب البصمة' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })
  it('الملخص يعرض حالة الرحلة وبدء العمل الفعلي (وصول الموقع) ومغادرة الموقع بمسمّيات عربية', () => {
    render(<OperationsDataPage />)
    expect(screen.getByRole('columnheader', { name: 'بدء العمل الفعلي (وصول الموقع)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'مغادرة الموقع' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'عادت إلى الكراج' })).toBeInTheDocument()
  })
  it('تسلسل الرحلة الكامل يُفتح من الملخص ويعرض الأحداث بترتيبها مع الفروق الزمنية', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('trip-timeline-d1'))
    const dialog = screen.getByTestId('trip-timeline-dialog')
    expect(within(dialog).getByText(/كابسة · DB DB-1 · علي/)).toBeInTheDocument()
    expect(within(dialog).getByTestId('trip-timeline-span')).toHaveTextContent('4 حدثاً · 8 س 0 د')
    const items = within(dialog).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('انطلقت من الكراج المركزي')
    expect(items[1]).toHaveTextContent('بدء العمل الفعلي')
    expect(items[1]).toHaveTextContent('+20 د')
    expect(items[2]).toHaveTextContent('نقص عن الحد الأدنى')
    expect(items[2]).toHaveTextContent('+2 س 40 د')
    expect(items[3]).toHaveTextContent('انتهاء الانطلاقية')
    fireEvent.click(within(dialog).getByLabelText('إغلاق'))
    expect(screen.queryByTestId('trip-timeline-dialog')).not.toBeInTheDocument()
  })
  it('تبويب الحركة يعرض المسمّيات العربية للمصدر والوجهة وحالة الانتقال المشتقة', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-movements'))
    expect(screen.getByRole('cell', { name: 'موقع العمل' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'المحطة التحويلية' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'في الطريق' })).toBeInTheDocument()
    expect(screen.queryByText('work_site')).not.toBeInTheDocument()
  })
  it('أوزان المحطة تتبع نطاق التاريخ المختار في الصفحة لا يوم اليوم فقط', () => {
    h.workflowRange.mockClear()
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByRole('button', { name: 'آخر 7 أيام' }))
    const [from, to] = h.workflowRange.mock.calls.at(-1) as [string, string]
    expect(from < to).toBe(true)
    expect(Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)).toBe(6)
  })
  it('البحث لا يطابق المعرّفات الداخلية (UUID) بل البيانات المقروءة فقط', () => {
    render(<OperationsDataPage />)
    fireEvent.change(screen.getByPlaceholderText('آلية، سائق، منطقة…'), { target: { value: 'd1' } })
    expect(screen.getByText('لا توجد سجلات في هذا التقرير')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('آلية، سائق، منطقة…'), { target: { value: 'DB-1' } })
    expect(screen.queryByText('لا توجد سجلات في هذا التقرير')).not.toBeInTheDocument()
  })
  it('تصحيح الوزن من غرفة العمليات فقط: يتطلب تغييراً وسبباً، يعرض أثر المخالفة، ويستدعي ops_correct_weighing', () => {
    h.correct.mockReset()
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-weighings'))
    fireEvent.click(screen.getByTestId('correct-weighing-v1'))
    const dialog = screen.getByTestId('weighing-correction-dialog')
    expect(within(dialog).getByTestId('weighing-correction-current')).toHaveTextContent('5 طن')
    // بلا تغيير ⇒ زر الحفظ معطّل
    expect(within(dialog).getByTestId('weighing-correction-submit')).toBeDisabled()
    fireEvent.change(within(dialog).getByTestId('weighing-correction-weight'), { target: { value: '4.5' } })
    fireEvent.change(within(dialog).getByTestId('weighing-correction-kind'), { target: { value: 'compactor_large' } })
    expect(within(dialog).getByTestId('weighing-correction-violation')).toHaveTextContent('فرق 1.5 طن')
    fireEvent.click(within(dialog).getByTestId('weighing-correction-submit'))
    expect(within(dialog).getByText(/سبب التصحيح إلزامي/)).toBeInTheDocument()
    expect(h.correct).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByTestId('weighing-correction-weight'), { target: { value: '6.5' } })
    expect(within(dialog).getByTestId('weighing-correction-ok')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByTestId('weighing-correction-reason'), { target: { value: 'خطأ إدخال من المحطة' } })
    fireEvent.click(within(dialog).getByTestId('weighing-correction-submit'))
    expect(h.correct).toHaveBeenCalledWith(
      { visitLegId: 'v1', weightTons: 6.5, destination: 'press', vehicleKind: 'compactor_large', reason: 'خطأ إدخال من المحطة' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })
  it('حدود الأوزان حسب النوع تُدار من غرفة العمليات: تعديل حد قائم وإضافة نوع مع تحقق محلي', () => {
    h.saveKind.mockReset()
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-weighings'))
    fireEvent.click(screen.getByTestId('toggle-vehicle-kinds'))
    const panel = screen.getByTestId('vehicle-kinds-panel')
    expect(within(panel).getByTestId('vehicle-kind-kia')).toHaveTextContent('معطّل')
    fireEvent.click(within(panel).getByTestId('vehicle-kind-edit-compactor_large'))
    expect(within(panel).getByTestId('vehicle-kind-code')).toBeDisabled()
    fireEvent.change(within(panel).getByTestId('vehicle-kind-min'), { target: { value: '9' } })
    fireEvent.click(within(panel).getByTestId('vehicle-kind-save'))
    expect(within(panel).getByTestId('vehicle-kind-error')).toHaveTextContent('الحد الأعلى يجب أن يكون ≥ الحد الأدنى')
    expect(h.saveKind).not.toHaveBeenCalled()
    fireEvent.change(within(panel).getByTestId('vehicle-kind-min'), { target: { value: '7' } })
    fireEvent.click(within(panel).getByTestId('vehicle-kind-save'))
    expect(h.saveKind).toHaveBeenCalledWith(
      { kind: 'compactor_large', label: 'كابسة كبيرة', minTons: 7, maxTons: 8, destination: 'both', sort: 3, active: true },
      expect.any(Object),
    )
    fireEvent.click(within(panel).getByTestId('vehicle-kind-add'))
    fireEvent.change(within(panel).getByTestId('vehicle-kind-code'), { target: { value: 'Trailer 20' } })
    fireEvent.change(within(panel).getByTestId('vehicle-kind-label'), { target: { value: 'مقطورة 20' } })
    fireEvent.change(within(panel).getByTestId('vehicle-kind-min'), { target: { value: '12' } })
    fireEvent.click(within(panel).getByTestId('vehicle-kind-save'))
    expect(within(panel).getByTestId('vehicle-kind-error')).toHaveTextContent('رمز النوع')
    fireEvent.change(within(panel).getByTestId('vehicle-kind-code'), { target: { value: 'trailer_20' } })
    fireEvent.click(within(panel).getByTestId('vehicle-kind-save'))
    expect(h.saveKind).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'trailer_20', label: 'مقطورة 20', minTons: 12, maxTons: null, destination: 'transfer_station', active: true }),
      expect.any(Object),
    )
  })
  it('تصحيح حالة صيانة مكتملة من غرفة العمليات فقط: الحالات المفتوحة بلا زر، سبب إلزامي، وتُرسل الحقول المتغيرة فقط', () => {
    h.correctCase.mockReset()
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-maintenance'))
    expect(screen.queryByTestId('correct-maintenance-c1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('correct-maintenance-c2'))
    const dialog = screen.getByTestId('maintenance-correction-dialog')
    fireEvent.click(within(dialog).getByTestId('mc-submit'))
    expect(within(dialog).getByTestId('mc-error')).toHaveTextContent('لا يوجد تغيير')
    fireEvent.change(within(dialog).getByTestId('mc-service'), { target: { value: '150' } })
    expect(within(dialog).getByTestId('mc-projected')).toHaveTextContent('خدمة + قطع')
    fireEvent.change(within(dialog).getByTestId('mc-technician'), { target: { value: 'الفني حيدر' } })
    fireEvent.click(within(dialog).getByTestId('mc-submit'))
    expect(within(dialog).getByTestId('mc-error')).toHaveTextContent('سبب التصحيح إلزامي')
    expect(h.correctCase).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByTestId('mc-reason'), { target: { value: 'فاتورة الورشة النهائية' } })
    fireEvent.click(within(dialog).getByTestId('mc-submit'))
    expect(h.correctCase).toHaveBeenCalledWith(
      {
        caseId: 'c2',
        reason: 'فاتورة الورشة النهائية',
        faultType: null,
        priority: null,
        diagnosis: null,
        workNotes: null,
        partsNotes: null,
        assignedTechnician: 'الفني حيدر',
        estimatedCost: null,
        serviceCost: 150,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })
  it('تنبيه «عطل مفتوح دون حسم» يتيح لغرفة العمليات تسجيل الحلّ بملاحظة إلزامية، وبقية التنبيهات بلا زر', () => {
    h.resolveBreakdown.mockReset()
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-alerts'))
    expect(screen.queryByTestId('resolve-breakdown-d1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('resolve-breakdown-d2'))
    const dialog = screen.getByTestId('resolve-breakdown-dialog')
    expect(within(dialog).getByTestId('resolve-breakdown-submit')).toBeDisabled()
    fireEvent.change(within(dialog).getByTestId('resolve-breakdown-notes'), { target: { value: 'بدّل السائق الإطار' } })
    fireEvent.click(within(dialog).getByTestId('resolve-breakdown-submit'))
    expect(h.resolveBreakdown).toHaveBeenCalledWith({ departureId: 'd2', notes: 'بدّل السائق الإطار' }, expect.objectContaining({ onSuccess: expect.any(Function) }))
  })
})

describe('00154: طلبات الدعم في غرفة العمليات', () => {
  it('يعرض التبويب مترجماً مع الآليات المرسلة ويلغي المفتوح بسبب إلزامي', () => {
    render(<OperationsDataPage />)
    fireEvent.click(screen.getByTestId('ops-tab-support'))
    expect(screen.getByTestId('ops-support-panel')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'المسؤول الطالب' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الآليات المرسلة' })).toBeInTheDocument()
    expect(screen.getAllByText('دعم جارٍ').length).toBeGreaterThan(0)
    expect(screen.getByText('كابسة 1 · DB DB-1')).toBeInTheDocument()
    expect(screen.getByText('لا تتوفر آليات')).toBeInTheDocument()
    expect(screen.queryByTestId('ops-support-r2')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ops-support-cancel-r1'))
    fireEvent.change(screen.getByTestId('ops-support-cancel-reason'), { target: { value: 'قرار تشغيلي' } })
    fireEvent.click(screen.getByTestId('ops-support-cancel-submit'))
    expect(h.cancelSupport).toHaveBeenCalledWith({ requestId: 'r1', reason: 'قرار تشغيلي' }, expect.any(Object))
  })
})

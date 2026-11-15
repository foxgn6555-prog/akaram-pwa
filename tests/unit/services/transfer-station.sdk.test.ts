/** عقود SDK المحطة التحويلية: حساب الصافي، فلاتر الشهر، وتحويل صفوف الخادم إلى شكل الواجهة. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { result: { data: [] as unknown, error: null as null | { message: string } } }
  const queries: Array<{ table: string; calls: Array<[string, unknown[]]> }> = []
  const chain = (table: string) => {
    const calls: Array<[string, unknown[]]> = []
    queries.push({ table, calls })
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'not', 'eq', 'gte', 'lt', 'order', 'insert', 'update', 'single', 'returns']) {
      c[m] = vi.fn((...args: unknown[]) => { calls.push([m, args]); return c })
    }
    c.then = (resolve: (v: typeof state.result) => unknown) => Promise.resolve(state.result).then(resolve)
    return c
  }
  return { state, queries, rpc: vi.fn(async (..._args: unknown[]) => state.result), from: vi.fn(chain) }
})
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc, from: h.from },
  sdkGuard: async (value: PromiseLike<{ data: unknown; error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message); return r.data },
  sdkVoid: async (value: PromiseLike<{ error: null | { message: string } }>) => { const r = await value; if (r.error) throw new Error(r.error.message) },
}))
import { transferStation } from '@sdk/transfer-station.sdk'

const calls = () => h.queries.at(-1)!.calls
const arg = (method: string) => calls().find(([m]) => m === method)?.[1]
beforeEach(() => { h.state.result = { data: [], error: null }; h.rpc.mockClear(); h.from.mockClear(); h.queries.length = 0 })

describe('transferStation — الأوزان والسجلات', () => {
  it('list يطبّع الصفوف الناقصة والمكتملة ويفلتر بالتاريخ والشفت', async () => {
    h.state.result = { data: [{ id: 1 }, { id: 'w2', seq: 9, db_number: 'DB-2', driver_name: 'علي', vehicle_type: 'كابسة', gross_weight: 12.5, tare_weight: 4.25, net_weight: 8.25, entry_time: 't', log_date: '2026-11-01', shift: 'night', status: 'submitted_to_ops', submitted_to_ops_at: 's', archived_at: 'a', archived_by: 'u', archive_reason: 'r', created_by: 'c', created_at: 'n' }], error: null }
    const rows = await transferStation.list({ date: '2026-11-01', shift: 'night' })
    expect(h.from).toHaveBeenCalledWith('ts_weight_records')
    expect(arg('is')).toEqual(['archived_at', null])
    expect(calls().filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([['log_date', '2026-11-01'], ['shift', 'night']])
    expect(rows[0]).toMatchObject({ id: '1', db_number: '', driver_name: '', seq: null, gross_weight: null, net_weight: null, shift: 'morning', status: 'draft', archive_reason: null })
    expect(rows[1]).toMatchObject({ id: 'w2', seq: 9, net_weight: 8.25, shift: 'night', status: 'submitted_to_ops', archived_by: 'u' })
    h.state.result = { data: null, error: null }
    expect(await transferStation.list()).toEqual([])
    expect(calls().some(([m]) => m === 'eq')).toBe(false)
    await transferStation.listArchived()
    expect(arg('not')).toEqual(['archived_at', 'is', null])
  })

  it('create/update يحسبان الصافي بخانتين ولا يخترعان وزناً عند نقص أحد الطرفين', async () => {
    h.state.result = { data: { id: 'w1', gross_weight: 10.335, tare_weight: 2.1, net_weight: 8.24 }, error: null }
    const input = { db_number: 'DB-1', driver_name: 'علي', gross_weight: 10.335, tare_weight: 2.1, log_date: '2026-11-01', shift: 'morning' as const }
    expect(await transferStation.create(input)).toMatchObject({ id: 'w1', net_weight: 8.24 })
    expect(arg('insert')?.[0]).toEqual({ ...input, net_weight: 8.24 })
    await transferStation.update('w1', { gross_weight: 9 })
    expect(arg('update')?.[0]).toEqual({ gross_weight: 9, net_weight: null })
    expect(arg('eq')).toEqual(['id', 'w1'])
    await transferStation.update('w1', { tare_weight: 3 })
    expect(arg('update')?.[0]).toEqual({ tare_weight: 3, net_weight: null })
  })

  it('الأرشفة والاستعادة والإرسال والملخص تمر عبر RPC بأسمائها الصحيحة', async () => {
    await transferStation.archive('w1', ' سبب ')
    expect(h.rpc).toHaveBeenLastCalledWith('ts_weight_archive', { p_id: 'w1', p_reason: ' سبب ' })
    await transferStation.restore('w1')
    expect(h.rpc).toHaveBeenLastCalledWith('ts_weight_restore', { p_id: 'w1' })
    h.state.result = { data: 3, error: null }
    expect(await transferStation.sendToOps('2026-11-01', 'night')).toBe(3)
    expect(h.rpc).toHaveBeenLastCalledWith('ts_weight_send_to_ops', { p_date: '2026-11-01', p_shift: 'night' })
    h.state.result = { data: null, error: null }
    expect(await transferStation.sendToOps('2026-11-01', 'morning')).toBe(0)
    expect(await transferStation.summary()).toEqual({})
    expect(h.rpc).toHaveBeenLastCalledWith('ts_weight_summary', { p_days: 7 })
    h.state.result = { data: { total_records: 4 }, error: null }
    expect(await transferStation.summary()).toEqual({ total_records: 4 })
    h.state.result = { data: null, error: { message: 'STATION_DENIED' } }
    await expect(transferStation.summary()).rejects.toThrow('STATION_DENIED')
    await expect(transferStation.sendToOps('d', 'morning')).rejects.toThrow('STATION_DENIED')
  })

  it('السكسات والناقلات تستخدم أعمدة الربط، والرحلات القديمة لا؛ وحدود الشهر نصف مفتوحة بما فيها ديسمبر', async () => {
    h.state.result = { data: [{ id: 's1', destination: { name: 'المحطة' }, vehicle: { db_number: 'DB-9' } }, { id: 's2', destination: null, vehicle: null, tracking: 'gps', arrived_at: 'a', shift_name: 'ليلي', driver_kind: 'employee', weight_tons: 4, exit_time: 'e', log_date: 'd', status: 'completed', submitted_at: 's', archived_at: null, archive_reason: null, created_at: 'c', driver_name: 'علي', vehicle_type: 'ناقلة' }], error: null }
    const rows = await transferStation.listSaksat('2026-12')
    expect(h.from).toHaveBeenCalledWith('ts_saksat_records')
    expect(String(arg('select')?.[0])).toContain('destination:station_destinations(name)')
    expect(arg('gte')).toEqual(['log_date', '2026-12-01'])
    expect(arg('lt')).toEqual(['log_date', '2027-01-01'])
    expect(rows[0]).toMatchObject({ id: 's1', destination_name: 'المحطة', db_number: 'DB-9', tracking: 'none', driver_kind: 'legacy', status: 'draft', weight_tons: null })
    expect(rows[1]).toMatchObject({ destination_name: null, db_number: null, tracking: 'gps', driver_kind: 'employee', status: 'completed' })
    await transferStation.listCarrier('2026-02')
    expect(h.from).toHaveBeenCalledWith('ts_carrier_records')
    expect(arg('lt')).toEqual(['log_date', '2026-03-01'])
    await transferStation.listTrips('2026-11')
    expect(h.from).toHaveBeenCalledWith('ts_trips_records')
    expect(String(arg('select')?.[0])).not.toContain('station_destinations')
    h.state.result = { data: null, error: null }
    expect(await transferStation.listTrips()).toEqual([])
    expect(calls().some(([m]) => m === 'gte')).toBe(false)
  })
})

describe('transferStation — الوزن بالخطوات وتقارير العمليات', () => {
  it('أنواع الآليات والوزن والتصحيح والإكمال تمرر المعاملات كاملة', async () => {
    h.state.result = { data: [{ kind: 'press' }], error: null }
    expect(await transferStation.vehicleKinds()).toEqual([{ kind: 'press' }])
    expect(h.rpc).toHaveBeenLastCalledWith('ts_vehicle_kinds_list', { p_include_inactive: false })
    await transferStation.vehicleKinds(true)
    expect(h.rpc).toHaveBeenLastCalledWith('ts_vehicle_kinds_list', { p_include_inactive: true })
    const kind = { kind: 'press', label: 'كابسة', minTons: 2, maxTons: null, destination: 'both' as const, sort: 3, active: true }
    await transferStation.saveVehicleKind(kind)
    expect(h.rpc).toHaveBeenLastCalledWith('ops_ts_vehicle_kind_save', { p_kind: 'press', p_label: 'كابسة', p_min_tons: 2, p_max_tons: null, p_destination: 'both', p_sort: 3, p_active: true })
    await transferStation.recordWeighing('l1', 5.5)
    expect(h.rpc).toHaveBeenLastCalledWith('ts_record_weighing', { p_visit_leg_id: 'l1', p_weight_tons: 5.5 })
    await transferStation.completeWeighing('l1', 'press', 'press')
    expect(h.rpc).toHaveBeenLastCalledWith('ts_complete_weighing', { p_visit_leg_id: 'l1', p_destination: 'press', p_vehicle_kind: 'press' })
    await transferStation.correctWeighing({ visitLegId: 'l1', weightTons: 6, destination: 'transfer_station', vehicleKind: 'press', reason: 'تصحيح' })
    expect(h.rpc).toHaveBeenLastCalledWith('ops_correct_weighing', { p_visit_leg_id: 'l1', p_weight_tons: 6, p_destination: 'transfer_station', p_vehicle_kind: 'press', p_reason: 'تصحيح' })
    for (const call of [() => transferStation.vehicleKinds(), () => transferStation.saveVehicleKind(kind), () => transferStation.recordWeighing('l', 1), () => transferStation.completeWeighing('l', 'press', 'press'), () => transferStation.correctWeighing({ visitLegId: 'l', weightTons: 1, destination: 'press', vehicleKind: 'press', reason: 'r' })]) {
      h.state.result = { data: null, error: { message: 'WEIGHT_DENIED' } }
      await expect(call()).rejects.toThrow('WEIGHT_DENIED')
    }
  })

  it('المخالفات وأطنان القواطع والتقارير المرسلة تحافظ على القيم وتطبع الغياب', async () => {
    h.state.result = { data: [{ id: 'v1', weight_tons: '1.5', min_tons: '2', deficit_tons: '0.5' }, {}], error: null }
    expect((await transferStation.listViolations('2026-11-01'))[0]).toMatchObject({ id: 'v1', weight_tons: 1.5, min_tons: 2, deficit_tons: 0.5, kind_label: null })
    expect(h.rpc).toHaveBeenLastCalledWith('ts_violations_list', { p_day: '2026-11-01' })
    expect((await transferStation.listViolations())[1]).toMatchObject({ id: '', weight_tons: 0, min_tons: 0, deficit_tons: 0, violated_at: null })
    expect(h.rpc).toHaveBeenLastCalledWith('ts_violations_list', { p_day: null })
    h.state.result = { data: [{ parent_sector: 'karrada', inbound_count: '2', inbound_tons: '7', press_tons: '3', station_tons: '4', violation_count: '1' }, {}], error: null }
    const tons = await transferStation.opsSectorTonnage('a', 'b')
    expect(h.rpc).toHaveBeenLastCalledWith('ops_sector_tonnage', { p_from: 'a', p_to: 'b' })
    expect(tons[0]).toEqual({ parent_sector: 'karrada', inbound_count: 2, inbound_tons: 7, press_tons: 3, station_tons: 4, violation_count: 1 })
    expect(tons[1]).toMatchObject({ parent_sector: '', inbound_count: 0, station_tons: 0 })
    h.state.result = { data: [{ report_day: '2026-11-01', payload: { total: 2 } }, {}], error: null }
    const reports = await transferStation.deputyDailyReports(10)
    expect(h.rpc).toHaveBeenLastCalledWith('deputy_daily_reports_list', { p_limit: 10 })
    expect(reports[0]).toMatchObject({ report_day: '2026-11-01', sent_at: null, sender_name: null, note: null, payload: { total: 2 } })
    expect(reports[1]).toMatchObject({ report_day: '', payload: {} })
    await transferStation.deputyDailyReports()
    expect(h.rpc).toHaveBeenLastCalledWith('deputy_daily_reports_list', { p_limit: 60 })
    h.state.result = { data: null, error: null }
    expect(await transferStation.opsDailyReport('d')).toEqual({})
    expect(await transferStation.opsSectorTonnage('a', 'b')).toEqual([])
    expect(await transferStation.deputyDailyReports()).toEqual([])
    expect(await transferStation.listViolations()).toEqual([])
    h.state.result = { data: { ok: true }, error: null }
    await transferStation.opsSendDailyToDeputy('d', ' ملاحظة ')
    expect(h.rpc).toHaveBeenLastCalledWith('ops_send_daily_to_deputy', { p_day: 'd', p_note: 'ملاحظة' })
    await transferStation.opsSendDailyToDeputy('d', '  ')
    expect(h.rpc).toHaveBeenLastCalledWith('ops_send_daily_to_deputy', { p_day: 'd', p_note: null })
    h.state.result = { data: null, error: { message: 'REPORT_DENIED' } }
    for (const call of [() => transferStation.listViolations(), () => transferStation.opsDailyReport('d'), () => transferStation.opsSectorTonnage('a', 'b'), () => transferStation.opsSendDailyToDeputy('d'), () => transferStation.deputyDailyReports()]) await expect(call()).rejects.toThrow('REPORT_DENIED')
  })

  it('سير العمل يطبّع الأزمنة والأرقام ولا يحوّل المخالفة إلى نص، ونطاق التاريخ يشذب البحث', async () => {
    h.state.result = { data: [{ visit_id: 'v', departure_id: 'd', trip_day: '2026-11-01', db_number: 'DB', vehicle_name: 'كابسة', driver_name: 'علي', shift: 'night', sector_id: 3, parent_sector: 'karrada', area_name: 'الوليد', manager_name: 'مدير', inbound_departed_at: 'i', arrived_at: 'a', weighed_at: 'w', completed_at: 'c', dispatched_at: 'x', weight_tons: 5, destination: 'press', destination_label: 'كبس', vehicle_kind: 'press', kind_label: 'كابسة', min_tons: 2, violation: true, deficit_tons: 0, transit_minutes: 10, weigh_wait_minutes: 2, process_minutes: 3, stay_minutes: 15 }, {}], error: null }
    const rows = await transferStation.opsWorkflow('2026-11-01', ' علي ')
    expect(h.rpc).toHaveBeenLastCalledWith('ops_station_workflow', { p_day: '2026-11-01', p_search: 'علي' })
    expect(rows[0]).toMatchObject({ visit_id: 'v', sector_id: 3, violation: true, weight_tons: 5, transit_minutes: 10, stay_minutes: 15 })
    expect(rows[1]).toMatchObject({ visit_id: '', sector_id: null, violation: false, weight_tons: null, transit_minutes: null, stay_minutes: null })
    await transferStation.opsWorkflow()
    expect(h.rpc).toHaveBeenLastCalledWith('ops_station_workflow', { p_day: null, p_search: null })
    await transferStation.opsWorkflowRange('a', 'b', '  ')
    expect(h.rpc).toHaveBeenLastCalledWith('ops_station_workflow_range', { p_from: 'a', p_to: 'b', p_search: null })
    h.state.result = { data: [{ visit_id: 'raw' }], error: null }
    expect(await transferStation.opsWorkflowRange('a', 'b', ' DB ')).toEqual([{ visit_id: 'raw' }])
    expect(h.rpc).toHaveBeenLastCalledWith('ops_station_workflow_range', { p_from: 'a', p_to: 'b', p_search: 'DB' })
    h.state.result = { data: null, error: null }
    expect(await transferStation.opsWorkflow()).toEqual([])
    expect(await transferStation.opsWorkflowRange('a', 'b')).toEqual([])
    h.state.result = { data: null, error: { message: 'WORKFLOW_DENIED' } }
    await expect(transferStation.opsWorkflow()).rejects.toThrow('WORKFLOW_DENIED')
    await expect(transferStation.opsWorkflowRange('a', 'b')).rejects.toThrow('WORKFLOW_DENIED')
  })
})

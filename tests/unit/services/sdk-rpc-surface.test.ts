/** عقود سطح SDK: كل دالة تمرّر اسم RPC/الجدول الصحيح والمعاملات الأساسية (بلا شبكة). */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const state = { result: { data: [] as unknown, error: null as null | { message: string } } }
  const chain = () => {
    const c: Record<string, unknown> = {}
    const self = () => c
    for (const m of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'not', 'in', 'order', 'limit', 'range', 'insert', 'update', 'delete', 'upsert', 'returns', 'single', 'maybeSingle']) c[m] = vi.fn(self)
    c.then = (resolve: (v: typeof state.result) => unknown) => Promise.resolve(state.result).then(resolve)
    return c
  }
  const bucket = { upload: vi.fn(async () => ({ data: { path: 'p' }, error: null })), remove: vi.fn(async () => ({ data: [], error: null })), createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed' }, error: null })) }
  return {
    state, chain, bucket,
    rpc: vi.fn(async (..._args: unknown[]) => state.result),
    from: vi.fn(() => chain()),
    storageFrom: vi.fn(() => bucket),
    invoke: vi.fn(async () => ({ data: { ok: true }, error: null })),
  }
})
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc, from: h.from, storage: { from: h.storageFrom }, functions: { invoke: h.invoke } },
  sdkGuard: async (p: Promise<{ data: unknown; error: null | { message: string } }>) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data },
  sdkVoid: async (p: Promise<{ error: null | { message: string } }>) => { const r = await p; if (r.error) throw new Error(r.error.message) },
  sdkMaybe: async (p: Promise<{ data: unknown; error: null | { message: string } }>) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data },
}))

import { executive, execErrorMessage } from '@sdk/executive.sdk'
import { treasury, treasuryErrorMessage } from '@sdk/treasury.sdk'
import { advances, advanceErrorMessage } from '@sdk/advances.sdk'
import { dataRetention, retentionErrorMessage } from '@sdk/data-retention.sdk'
import { coldArchive, coldErrorMessage } from '@sdk/cold-archive.sdk'
import { maintenanceWorkshops } from '@sdk/maintenance-workshops.sdk'
import { space } from '@sdk/space.sdk'
import { followUp } from '@sdk/follow-up.sdk'
import { metrics } from '@sdk/metrics.sdk'
import { opsStore } from '@sdk/ops-store.sdk'
import { archive } from '@sdk/archive.sdk'
import { audit, buildAuditQuery } from '@sdk/audit.sdk'
import { employees } from '@sdk/employees.sdk'
import { notifications } from '@sdk/notifications.sdk'
import { permissions } from '@sdk/permissions.sdk'
import { portals } from '@sdk/portals.sdk'
import { sectorsSdk, PARENT_SECTOR_LABELS_LIVE } from '@sdk/sectors.sdk'
import { stationFleet } from '@sdk/station-fleet.sdk'
import { system } from '@sdk/system.sdk'
import { users } from '@sdk/users.sdk'
import { gpsWarehouse } from '@sdk/gps-warehouse.sdk'
import { opsContractorHeadcounts } from '@sdk/ops-contractor-headcounts.sdk'
import { branches } from '@sdk/branches.sdk'
import { departments } from '@sdk/departments.sdk'
import { devops } from '@sdk/devops.sdk'
import { liveTracking } from '@sdk/live-tracking.sdk'
import { hrShifts, SHIFT_LABELS_LIVE } from '@sdk/hr-shifts.sdk'
import { gbs } from '@sdk/gbs.sdk'
import { integrations } from '@sdk/integrations.sdk'
import { sectorManager, approvals, procedures } from '@sdk/sector-manager.sdk'
import { vehicleOperations } from '@sdk/vehicle-operations.sdk'

beforeEach(() => { h.state.result = { data: [], error: null }; h.rpc.mockClear(); h.from.mockClear(); h.invoke.mockClear() })
const rpc = (fn: string, args?: Record<string, unknown>) => {
  const call = h.rpc.mock.calls.find((c) => c[0] === fn)
  expect(call, `RPC ${fn}`).toBeTruthy()
  if (args !== undefined) expect(call?.[1]).toEqual(args)
}
const lastRpc = (fn: string, args?: Record<string, unknown>) => {
  const call = h.rpc.mock.lastCall
  expect(call?.[0], `last RPC ${fn}`).toBe(fn)
  if (args !== undefined) expect(call?.[1]).toEqual(args)
}

describe('SDK الإدارة/المالية/الاحتفاظ', () => {
  it('executive', async () => {
    await executive.overview('2026-01-01', '2026-01-31', 1, 'morning'); rpc('exec_overview', { p_from: '2026-01-01', p_to: '2026-01-31', p_sector: 1, p_shift: 'morning' })
    await executive.people('2026-01-01', '2026-01-31'); lastRpc('exec_people', { p_from: '2026-01-01', p_to: '2026-01-31', p_limit: 10 })
    await executive.filterOptions(); lastRpc('exec_filter_options', {})
    await executive.publish({ title: 't', body: 'b', priority: 'normal', audience_kind: 'roles', roles: ['hr'], departments: [], users: [], requires_ack: true, pinned: false, expires_at: null } as never); lastRpc('announcement_publish', expect.objectContaining({ p_title: 't' }))
    await executive.feed('inbox'); lastRpc('announcement_feed', { p_scope: 'inbox', p_limit: 100, p_include_archived: false })
    await executive.get('a'); lastRpc('announcement_get', { p_id: 'a' })
    await executive.ack('a'); lastRpc('announcement_ack', { p_id: 'a' })
    await executive.archive('a'); lastRpc('announcement_archive', { p_id: 'a', p_reason: null })
    await executive.recipients('a'); lastRpc('announcement_recipients', { p_id: 'a' })
    await executive.unreadCount(); lastRpc('announcement_unread_count', {})
    await executive.targets(); lastRpc('announcement_targets', {})
    expect(execErrorMessage(new Error('EXEC_FORBIDDEN'))).not.toBe('EXEC_FORBIDDEN')
  })
  it('treasury', async () => {
    await treasury.types(); rpc('treasury_receivable_types_list', {})
    await treasury.saveType({ name: 'x' }); lastRpc('exec_receivable_type_save', { p_id: null, p_name: 'x', p_is_active: true, p_sort_order: 100 })
    await treasury.record({ kind: 'receipt', amount: 5 }); lastRpc('exec_treasury_record', expect.objectContaining({ p_kind: 'receipt', p_amount: 5 }))
    await treasury.confirm('t'); lastRpc('finance_treasury_confirm', { p_id: 't', p_note: null })
    await treasury.cancel('t', 'r'); lastRpc('treasury_cancel', { p_id: 't', p_reason: 'r' })
    await treasury.list(); lastRpc('treasury_list', expect.objectContaining({ p_limit: 500 }))
    await treasury.expenseTypes(); lastRpc('finance_expense_types_list', {})
    await treasury.saveExpenseType({ name: 'x' }); lastRpc('finance_expense_type_save', expect.objectContaining({ p_name: 'x' }))
    await treasury.recordExpense({ typeId: 'e', amount: 2 }); lastRpc('finance_expense_record', { p_type_id: 'e', p_amount: 2, p_details: null })
    await treasury.cancelExpense('e', 'r'); lastRpc('finance_expense_cancel', { p_id: 'e', p_reason: 'r' })
    await treasury.summary(); lastRpc('treasury_summary', { p_from: null, p_to: null })
    await treasury.employeeLookup('q'); lastRpc('exec_employee_lookup', { p_q: 'q' })
    await treasury.completedDesigns(); lastRpc('exec_completed_designs', { p_from: null, p_to: null, p_sector: null, p_period_type: null })
    expect(treasuryErrorMessage(new Error('TREASURY_AMOUNT_INVALID'))).not.toBe('TREASURY_AMOUNT_INVALID')
  })
  it('advances', async () => {
    await advances.types(); rpc('advance_types_list', { p_all: false })
    await advances.saveType({ name: 'x', maxInstallments: 3 }); lastRpc('advance_type_save', expect.objectContaining({ p_name: 'x', p_max_installments: 3 }))
    await advances.policy(); lastRpc('advance_policy', {})
    await advances.employeeLookup('q'); lastRpc('advance_employee_lookup', { p_q: 'q' })
    await advances.create({ employeeId: 'e', typeId: 't', amount: 10, method: 'equal' } as never); lastRpc('advance_request_create', expect.objectContaining({ p_employee: 'e' }))
    await advances.decide({ id: 'a', approve: true }); lastRpc('advance_decide', expect.objectContaining({ p_id: 'a', p_approve: true }))
    await advances.deliver('a'); lastRpc('advance_deliver', { p_id: 'a', p_note: null })
    await advances.settleCash('a', 5); lastRpc('advance_settle_cash', { p_id: 'a', p_amount: 5, p_note: null })
    await advances.cancel('a', 'r'); lastRpc('advance_cancel', { p_id: 'a', p_reason: 'r' })
    await advances.list(); lastRpc('advances_list', expect.objectContaining({ p_limit: 300 }))
    await advances.get('a'); lastRpc('advance_get', { p_id: 'a' })
    await advances.summary(); lastRpc('advances_summary', {})
    expect(advanceErrorMessage(new Error('ADVANCE_NOT_DELIVERED'))).not.toBe('ADVANCE_NOT_DELIVERED')
  })
  it('dataRetention + coldArchive', async () => {
    await dataRetention.gpsPurgeGet(); rpc('gps_history_purge_get', {})
    await dataRetention.gpsPurgeSet({ enabled: true, keepHours: 48 }); lastRpc('gps_history_purge_set', { p_enabled: true, p_keep_hours: 48 })
    await dataRetention.gpsPurgeRunNow(); lastRpc('gps_history_purge_run_now', {})
    await dataRetention.settings(); lastRpc('data_retention_settings_get', {})
    await dataRetention.setPolicy({ data_key: 'k', enabled: true, retention_months: 2, export_required: false, requires_confirm: true, grace_days: 1 }); lastRpc('data_retention_policy_set', expect.objectContaining({ p_key: 'k' }))
    await dataRetention.postpone('r'); lastRpc('data_retention_postpone', { p_request: 'r', p_days: 7 })
    await dataRetention.scanNow(); lastRpc('data_retention_scan_now', {})
    await dataRetention.requests(); lastRpc('data_retention_requests_list', { p_limit: 50 })
    await dataRetention.confirm('r'); lastRpc('data_retention_confirm', { p_request: 'r' })
    await dataRetention.cancel('r'); lastRpc('data_retention_cancel', { p_request: 'r' })
    expect(retentionErrorMessage(new Error('RETENTION_BAD_STATE'))).not.toBe('RETENTION_BAD_STATE')
    await coldArchive.settings(); lastRpc('cold_archive_settings_get', {})
    await coldArchive.saveSettings({ required_copies: 2, grace_days: 3, sources: {}, protections: {}, purge_approval: true }); lastRpc('cold_archive_settings_set', expect.objectContaining({ p_required_copies: 2 }))
    await coldArchive.preview('a', 'b'); lastRpc('cold_archive_preview', { p_from: 'a', p_to: 'b' })
    await coldArchive.createPackage('a', 'b'); lastRpc('cold_archive_package_create', { p_from: 'a', p_to: 'b', p_note: null })
    await coldArchive.packages(); lastRpc('cold_archive_packages_list', {})
    await coldArchive.package('p'); lastRpc('cold_archive_package_get', { p_id: 'p' })
    await coldArchive.cancel('p', 'r'); lastRpc('cold_archive_package_cancel', { p_id: 'p', p_reason: 'r' })
    await coldArchive.purgeRequest('p'); lastRpc('cold_archive_purge_request', { p_package: 'p' })
    await coldArchive.purgeApprove('p'); lastRpc('cold_archive_purge_approve', { p_package: 'p' })
    expect(coldErrorMessage(new Error('COLD_ARCHIVE_GRACE_ACTIVE'))).not.toBe('COLD_ARCHIVE_GRACE_ACTIVE')
  })
})

describe('SDK تشغيل/متابعة/مخزن/أرشيف', () => {
  it('maintenanceWorkshops + space + followUp + metrics + opsStore', async () => {
    await maintenanceWorkshops.list(); rpc('maintenance_workshops_list')
    await maintenanceWorkshops.accountFor('u'); lastRpc('maintenance_workshop_account_get', { p_user_id: 'u' })
    await maintenanceWorkshops.assign({ userId: 'u', workshopKey: 'central' }); lastRpc('maintenance_workshop_assign', { p_user_id: 'u', p_workshop_key: 'central', p_notes: null })
    await maintenanceWorkshops.accounts(); lastRpc('maintenance_workshop_accounts_list')
    await maintenanceWorkshops.setActive('central', false); lastRpc('maintenance_workshop_set_active', { p_key: 'central', p_is_active: false })
    await maintenanceWorkshops.mine(); lastRpc('maintenance_my_workshop')
    await space.overview(); lastRpc('space_overview', {})
    await space.setPlan('pro'); lastRpc('space_settings_set', { p_plan: 'pro', p_db_limit_bytes: null, p_storage_limit_bytes: null, p_bloat_threshold_pct: null })
    await space.reclaimNow(); lastRpc('space_reclaim_now', { p_tables: null })
    await space.sync(); lastRpc('space_reclaim_sync', {})
    await followUp.scopeOptions(); lastRpc('follow_up_scope_options')
    await followUp.profileForUser('u'); lastRpc('follow_up_profile_for_user', { p_user_id: 'u' })
    await followUp.assign({ userId: 'u', parentSectors: ['karrada'], sectorIds: [1] }); lastRpc('follow_up_assign', { p_user_id: 'u', p_parent_sectors: ['karrada'], p_sector_ids: [1], p_notes: null })
    await followUp.unassign('u'); lastRpc('follow_up_unassign', { p_user_id: 'u', p_reason: null })
    await followUp.me(); lastRpc('follow_up_me')
    await followUp.contractors(); lastRpc('follow_up_contractors', { p_date: null })
    await followUp.setHeadcount('c', 3); lastRpc('follow_up_set_headcount', { p_contractor: 'c', p_headcount: 3 })
    await metrics.sampleLatency(12.6); lastRpc('connection_sample', { p_latency_ms: 13 })
    await metrics.connectionHistory(); lastRpc('connection_history')
    await metrics.measureLatency(); expect(h.from).toHaveBeenCalledWith('branches')
    await opsStore.items(); lastRpc('ops_store_items_list', { p_include_inactive: false })
    await opsStore.movements(); lastRpc('ops_store_movements_list', { p_item: null, p_limit: 100 })
    await opsStore.saveItem({ name: 'x', unit: 'قطعة', minQty: 1 }); lastRpc('ops_store_item_save', { p_id: null, p_name: 'x', p_unit: 'قطعة', p_min_qty: 1, p_active: true })
    await opsStore.receive('i', 2); lastRpc('ops_store_receive', { p_item: 'i', p_qty: 2, p_note: null })
    await opsStore.adjust('i', 3, 'r'); lastRpc('ops_store_adjust', { p_item: 'i', p_new_qty: 3, p_reason: 'r' })
    await opsStore.requests(); lastRpc('supply_requests_list', { p_scope: 'open' })
    await opsStore.createRequest([]); lastRpc('supply_request_create', { p_items: [], p_notes: null })
    await opsStore.deliver('r', 'مستلم'); lastRpc('supply_request_deliver', { p_id: 'r', p_receiver_name: 'مستلم', p_items: null, p_note: null })
    await opsStore.markReady('r'); lastRpc('supply_request_mark_ready', { p_id: 'r', p_note: null })
    await opsStore.cancel('r', 'سبب'); lastRpc('supply_request_cancel', { p_id: 'r', p_reason: 'سبب' })
  })
  it('archive + audit + employees + notifications + permissions + portals', async () => {
    await archive.counts(); rpc('archive_counts')
    await archive.listTable('employees'); expect(h.from).toHaveBeenCalledWith('employees')
    await archive.restore('employees', 'e'); lastRpc('archive_restore', { p_table: 'employees', p_id: 'e' })
    await archive.archive('employees', 'e', 'r'); lastRpc('archive_record', { p_table: 'employees', p_id: 'e', p_reason: 'r' })
    expect(buildAuditQuery({ pageSize: 999, page: 0 })).toEqual({ pageSize: 200, page: 1 })
    h.state.result = { data: [{ table_name: 'employees' }], error: null }
    await audit.list({ tableName: 'employees', operation: 'UPDATE', from: '2026-01-01', to: '2026-01-02' }); expect(h.from).toHaveBeenCalledWith('audit_logs')
    expect(await audit.topTables(1)).toEqual([{ table_name: 'employees', count: 1 }])
    h.state.result = { data: [{ id: 'e' }], error: null }
    await employees.list({ departmentId: 'd', status: 'active', search: 'x', limit: 5 }); expect(h.from).toHaveBeenCalledWith('employees')
    expect(await employees.getById('e')).toEqual({ id: 'e' })
    await employees.create({ full_name: 'x' } as never); await employees.update('e', { full_name: 'y' } as never)
    h.state.result = { data: [], error: null }
    await notifications.unreadCount(); lastRpc('notification_unread_count')
    await notifications.markAllRead(); lastRpc('notification_mark_all_read')
    await notifications.preferences(); lastRpc('notification_get_preferences')
    await notifications.updatePreferences({ in_app_enabled: true, sound_enabled: false, push_enabled: true, critical_only: false, quiet_from: null, quiet_to: null }); lastRpc('notification_update_preferences', expect.objectContaining({ p_in_app: true }))
    await notifications.workflowPolicies(); lastRpc('notification_workflow_policies_list')
    await notifications.deleteWorkflowPolicy('p'); lastRpc('notification_workflow_policy_delete', { p_id: 'p' })
    await notifications.unregisterPush('e'); lastRpc('notification_unregister_push', { p_endpoint: 'e' })
    await permissions.templateRules('t'); expect(h.from).toHaveBeenCalledWith('permission_template_rules')
    await permissions.templateRulesSet('t', []); lastRpc('it_permission_template_rules_set', { p_template: 't', p_rules: [] })
    await permissions.userOverrides('u'); expect(h.from).toHaveBeenCalledWith('user_permission_overrides')
    await permissions.userEffective('u'); lastRpc('it_user_permissions_effective', { p_user: 'u' })
    await permissions.audit(); lastRpc('it_permission_audit_list', { p_user: null, p_template: null, p_limit: 100 })
    await portals.list(); expect(h.from).toHaveBeenCalledWith('dynamic_portals')
    await portals.listUnits('p'); expect(h.from).toHaveBeenCalledWith('portal_units')
    await portals.setActive('p', true); await portals.removeUnit('u')
  })
  it('sectors + stationFleet + system + users + gpsWarehouse + opsContractorHeadcounts', async () => {
    await sectorsSdk.tree(); rpc('sectors_tree', { p_include_inactive: false })
    await sectorsSdk.saveParent({ code: 'karrada', name: 'الكرادة' }); lastRpc('it_parent_sector_save', { p_code: 'karrada', p_name: 'الكرادة', p_sort: null, p_is_active: true })
    await sectorsSdk.setParentActive('karrada', false); lastRpc('it_parent_sector_set_active', { p_code: 'karrada', p_is_active: false })
    await sectorsSdk.saveArea({ parent_sector: 'karrada', name: 'أرخيته' }); lastRpc('it_area_save', { p_id: null, p_parent_sector: 'karrada', p_name: 'أرخيته', p_sort: null, p_is_active: true })
    expect('karrada' in PARENT_SECTOR_LABELS_LIVE).toBe(true)
    expect(Object.keys(PARENT_SECTOR_LABELS_LIVE)).toContain('karrada')
    expect(Object.getOwnPropertyDescriptor(PARENT_SECTOR_LABELS_LIVE, 'karrada')?.enumerable).toBe(true)
    await stationFleet.categories(); lastRpc('vehicle_categories_list', { p_include_inactive: true })
    await stationFleet.fleet(); lastRpc('station_fleet_list')
    await stationFleet.destinations(); lastRpc('station_destinations_list', { p_include_inactive: false })
    await stationFleet.externalDrivers(); lastRpc('station_external_drivers_list', { p_include_inactive: true })
    await stationFleet.contractorOptions(); lastRpc('contractor_options', { p_include_inactive: false })
    await stationFleet.saveExternalDriver({ id: null, fullName: 'x', contractorUserId: 'c', phone: null, licenseNo: null, licenseImagePath: null, notes: null, active: true }); lastRpc('station_external_driver_save_v2', expect.objectContaining({ p_full_name: 'x' }))
    await stationFleet.drivers(); lastRpc('station_drivers_list')
    await stationFleet.outbound('a', 'b'); lastRpc('station_outbound_list', { p_from: 'a', p_to: 'b', p_only_open: false })
    await system.dbTableDetails('t'); lastRpc('db_table_details', { p_table: 't' })
    await system.errorLogs(); expect(h.from).toHaveBeenCalledWith('app_errors')
    await system.resolveError(1, true); expect(h.from).toHaveBeenCalledWith('app_errors')
    await system.consoleStats(); lastRpc('console_stats', {})
    await users.roleGrantRequests('u'); lastRpc('role_grant_requests_list', { p_user_id: 'u' })
    h.state.result = { data: 'karrada', error: null }
    expect(await users.garageProfileForUser('u')).toBe('karrada'); lastRpc('garage_profile_for_user', { p_user_id: 'u' })
    h.state.result = { data: [], error: null }
    await users.saveGarageProfile('u', 'karrada'); lastRpc('garage_profile_save', { p_user_id: 'u', p_parent_sector: 'karrada' })
    await gpsWarehouse.link(); lastRpc('gps_warehouse_link_get')
    await gpsWarehouse.run('ping'); expect(h.invoke).toHaveBeenCalledWith('gps-warehouse', { body: { action: 'ping' } })
    await opsContractorHeadcounts.status('2026-11'); lastRpc('ops_contractor_month_status', { p_month: '2026-11-01' })
    await opsContractorHeadcounts.correct({ contractorUserId: 'c', date: '2026-11-01', source: 'contractor', headcount: 2, reason: 'r' }); lastRpc('ops_contractor_count_correct', { p_contractor: 'c', p_date: '2026-11-01', p_source: 'contractor', p_headcount: 2, p_reason: 'r' })
    await opsContractorHeadcounts.coverageGaps('2026-11', 'contractor'); lastRpc('ops_contractor_coverage_gaps', { p_month: '2026-11-01', p_source: 'contractor' })
    await opsContractorHeadcounts.approve('2026-11', 'contractor'); lastRpc('ops_contractor_month_approve', { p_month: '2026-11-01', p_source: 'contractor', p_force: false })
    await opsContractorHeadcounts.reopen('2026-11', 'r'); lastRpc('ops_contractor_month_reopen', { p_month: '2026-11-01', p_reason: 'r' })
  })
  it('branches + departments + devops + liveTracking + hrShifts + gbs + integrations', async () => {
    await branches.update('b', { name: 'x' } as never); expect(h.from).toHaveBeenCalledWith('branches')
    await branches.setActive('b', false)
    await departments.list(); expect(h.from).toHaveBeenCalledWith('departments')
    await devops.status(); lastRpc('devops_status')
    await liveTracking.zones(); lastRpc('live_zones_list')
    await hrShifts.options(); lastRpc('shift_options', { p_include_inactive: false })
    expect('morning' in SHIFT_LABELS_LIVE).toBe(true)
    expect(Object.keys(SHIFT_LABELS_LIVE)).toContain('morning')
    expect(Object.getOwnPropertyDescriptor(SHIFT_LABELS_LIVE, 'morning')?.value).toBe('صباحي')
    await gbs.exportAll(); lastRpc('gbs_containers_export')
    await gbs.importRows([], true, false); lastRpc('gbs_containers_import', { p_rows: [], p_dry_run: true, p_update_existing: false })
    await gbs.requestLocation({ containerId: 'c', latitude: 1, longitude: 2 }); lastRpc('gbs_container_request_location', expect.objectContaining({ p_container_id: 'c' }))
    await gbs.followUpSummary(); lastRpc('follow_up_containers_summary')
    await integrations.listDevices(); expect(h.from).toHaveBeenCalledWith('biometric_devices')
    await integrations.createDevice({ name: 'x' } as never); await integrations.setDeviceActive('d', true)
    await integrations.listProviders(); expect(h.from).toHaveBeenCalledWith('gps_providers')
    await integrations.createProvider('x', 'vendor_api'); await integrations.listVehicles(); expect(h.from).toHaveBeenCalledWith('vehicles')
    await integrations.createVehicle({ plate: 'x' } as never); await integrations.latestPositions(); expect(h.from).toHaveBeenCalledWith('vehicle_positions')
  })
})

describe('SDK مسؤول القاطع/الموافقات/الآليات', () => {
  it('sectorManager + approvals + procedures', async () => {
    await sectorManager.contractors(); rpc('sector_manager_contractors', { p_date: null, p_contractor: null, p_parent: null })
    await sectorManager.setContractorHeadcount('c', 2); lastRpc('sector_manager_set_headcount', { p_contractor: 'c', p_headcount: 2 })
    await sectorManager.contractorMonth('c'); lastRpc('sector_manager_contractor_month', { p_contractor: 'c', p_month: null })
    await sectorManager.contractorsSummary(); lastRpc('sector_manager_contractors_summary')
    await sectorManager.options(); lastRpc('sector_manager_options')
    await sectorManager.profileForUser('u'); lastRpc('sector_manager_profile_for_user', { p_user_id: 'u' })
    await sectorManager.saveProfile('u', ['karrada']); lastRpc('sector_manager_profile_save', { p_user_id: 'u', p_parent_sectors: ['karrada'], p_notes: null })
    await sectorManager.me(); lastRpc('sector_manager_me')
    await sectorManager.team(); lastRpc('sector_manager_team')
    await sectorManager.dashboard(); lastRpc('sector_manager_dashboard')
    await sectorManager.reports(); lastRpc('sector_manager_reports', { p_from: null, p_to: null })
    await sectorManager.notifyTargets(); lastRpc('sector_manager_notify_targets')
    await sectorManager.notify('t', 'b'); lastRpc('sector_manager_notify', { p_title: 't', p_body: 'b', p_targets: null })
    await sectorManager.notices(); lastRpc('sector_manager_notices')
    await sectorManager.fieldOpsSectorManagers(); lastRpc('field_ops_sector_managers')
    await approvals.chains(); lastRpc('approval_chains_list')
    await approvals.saveChain('employee', 'leave', []); lastRpc('approval_chain_save', expect.objectContaining({ p_requester_role: 'employee', p_steps: [] }))
    await approvals.employeeLookup(' q '); lastRpc('approval_employee_lookup', { p_q: 'q' })
    await approvals.diagnose('e', 'leave'); lastRpc('approval_diagnose', { p_employee: 'e', p_type: 'leave', p_subtype: null, p_context: {} })
    await approvals.deleteChain('c'); lastRpc('approval_chain_delete', { p_id: 'c' })
    await approvals.chainVersions('c'); lastRpc('approval_chain_versions_list', { p_chain: 'c' })
    await approvals.simulate('u', 'leave', null, {}); lastRpc('approval_simulate', { p_user: 'u', p_type: 'leave', p_subtype: null, p_context: {} })
    await approvals.delegationCandidates(' q '); lastRpc('approval_delegate_candidates', { p_query: 'q' })
    await approvals.delegations(); lastRpc('approval_delegations_list', { p_all: false })
    await approvals.delegationSet({ toUser: 'u', startsOn: 'a', endsOn: 'b' }); lastRpc('approval_delegation_set', { p_to_user: 'u', p_starts_on: 'a', p_ends_on: 'b', p_note: null, p_from_user: null })
    await approvals.delegationCancel('d'); lastRpc('approval_delegation_cancel', { p_id: 'd' })
    await approvals.performance('a', 'b'); lastRpc('approval_performance_report', { p_from: 'a', p_to: 'b' })
    await approvals.myTasks(); lastRpc('approval_my_tasks')
    await approvals.timeline('leave', 'r'); lastRpc('approval_timeline', { p_kind: 'leave', p_request: 'r' })
    await approvals.decide('leave', 'r', true); lastRpc('approval_decide_request', { p_kind: 'leave', p_request: 'r', p_approve: true, p_note: null })
    await procedures.targets(); lastRpc('termination_targets')
    await procedures.create({ targetKind: 'employee', targetId: 'e', type: 'resignation', lastDay: '2026-01-01', reason: 'r' }); lastRpc('termination_request_create', expect.objectContaining({ p_target_id: 'e' }))
    await procedures.mine(); lastRpc('termination_requests_mine')
    await procedures.cancel('r'); lastRpc('termination_request_cancel', { p_id: 'r' })
  })
  it('vehicleOperations', async () => {
    h.state.result = { data: [{ id: 'l', departure_id: 'd', sequence_no: 1, origin_type: 'garage', destination_type: 'work_site', departed_at: 'a', departed_by: 'u' }], error: null }
    await vehicleOperations.legs('d'); rpc('trip_legs_for_departure', { p_departure_id: 'd' })
    await vehicleOperations.sendToStation('d'); lastRpc('sector_send_vehicle_to_station', { p_departure_id: 'd', p_notes: null })
    await vehicleOperations.confirmSiteReturn('l'); lastRpc('sector_confirm_vehicle_site_return', { p_leg_id: 'l', p_notes: null })
    h.state.result = { data: [], error: null }
    await vehicleOperations.sendToMaintenance('d', 'عطل', 'normal'); lastRpc('sector_send_vehicle_to_maintenance', { p_departure_id: 'd', p_fault_type: 'عطل', p_priority: 'normal', p_notes: null })
    await vehicleOperations.maintenanceDispatchState('d'); lastRpc('sector_trip_maintenance_state', { p_departure_id: 'd' })
    await vehicleOperations.garageMaintenanceCoordination(); lastRpc('garage_maintenance_coordination')
    await vehicleOperations.garageMaintenanceDecision('c', 'approve'); lastRpc('garage_decide_maintenance_dispatch', { p_case_id: 'c', p_decision: 'approve', p_notes: null })
    await vehicleOperations.stationList(); lastRpc('station_vehicle_movements')
    await vehicleOperations.stationConfirm('l'); lastRpc('station_confirm_vehicle_arrival', { p_leg_id: 'l', p_notes: null })
    await vehicleOperations.stationDispatch('d', 'garage'); lastRpc('station_dispatch_vehicle', { p_departure_id: 'd', p_destination: 'garage', p_notes: null })
    await vehicleOperations.maintenanceList(); lastRpc('maintenance_vehicle_cases')
    await vehicleOperations.maintenanceConfirm('c'); lastRpc('maintenance_confirm_arrival', { p_case_id: 'c', p_notes: null })
    await vehicleOperations.maintenanceTechnicianOptions(); lastRpc('maintenance_technician_options', { p_search: null })
    await vehicleOperations.maintenanceCaseTechnicians('c'); lastRpc('maintenance_case_technicians', { p_case_id: 'c' })
    await vehicleOperations.maintenanceAssignTechnician('c', 'e'); lastRpc('maintenance_assign_technician', { p_case_id: 'c', p_employee_id: 'e', p_notes: null })
    await vehicleOperations.maintenanceReleaseTechnician('c', 'e'); lastRpc('maintenance_release_technician', { p_case_id: 'c', p_employee_id: 'e', p_notes: null })
    await vehicleOperations.maintenanceCompleteCase({ caseId: 'c', diagnosis: 'd', workNotes: 'w', technicianIds: [], parts: [] }); lastRpc('maintenance_complete_case', expect.objectContaining({ p_case_id: 'c' }))
    await vehicleOperations.maintenanceIssueAndInstall('c', 'i', 1, true); lastRpc('maintenance_issue_and_install', { p_case_id: 'c', p_item_id: 'i', p_quantity: 1, p_notes: null, p_install_now: true })
    await vehicleOperations.maintenanceInventory(); lastRpc('maintenance_inventory_list', { p_search: null, p_category: null })
    await vehicleOperations.maintenanceCreateInventory('s', 'n', 'قطعة', 1); lastRpc('maintenance_inventory_create', expect.objectContaining({ p_sku: 's' }))
    await vehicleOperations.maintenanceReceiveInventory('i', 1, 2); lastRpc('maintenance_inventory_receive', { p_item_id: 'i', p_quantity: 1, p_unit_cost: 2, p_notes: null })
    await vehicleOperations.maintenanceReturnPart('p'); lastRpc('maintenance_return_issued_part', { p_part_id: 'p', p_notes: null })
    await vehicleOperations.maintenanceForDay('2026-01-01'); lastRpc('maintenance_cases_for_day', { p_day: '2026-01-01' })
    await vehicleOperations.maintenanceForwardToCentral('c', 'r'); lastRpc('maintenance_forward_to_central', { p_case_id: 'c', p_reason: 'r' })
    await vehicleOperations.maintenanceDispatch('c', 'garage'); lastRpc('maintenance_dispatch_vehicle', { p_case_id: 'c', p_destination: 'garage', p_notes: null })
    await vehicleOperations.opsMovements('a', 'b'); lastRpc('operational_vehicle_movements', { p_from: 'a', p_to: 'b' })
    await vehicleOperations.opsResolveBreakdown({ departureId: 'd', notes: 'n' }); lastRpc('ops_resolve_breakdown', { p_departure_id: 'd', p_resolution_notes: 'n' })
    await vehicleOperations.opsCorrectMaintenanceCase({ caseId: 'c', reason: 'r' }); lastRpc('ops_correct_maintenance_case', expect.objectContaining({ p_case_id: 'c', p_reason: 'r' }))
    await vehicleOperations.opsDepartureTimeline('d'); lastRpc('operational_departure_timeline', { p_departure_id: 'd' })
    await vehicleOperations.opsAttendance('a', 'b'); lastRpc('operational_attendance', { p_from: 'a', p_to: 'b' })
    await vehicleOperations.opsGarageTrips('a', 'b'); lastRpc('operational_garage_trips', { p_from: 'a', p_to: 'b' })
    await vehicleOperations.opsMaintenance('a', 'b'); lastRpc('operational_maintenance_report', { p_from: 'a', p_to: 'b', p_workshop: null })
    await vehicleOperations.maintenancePurchases(); lastRpc('maintenance_purchases_list', { p_limit: 50, p_offset: 0 })
    await vehicleOperations.maintenancePurchaseDetail('o'); lastRpc('maintenance_purchase_detail', { p_order_id: 'o' })
    await vehicleOperations.maintenancePurchasesFinance(); lastRpc('maintenance_purchases_finance', { p_from: null, p_to: null, p_search: null })
    await vehicleOperations.maintenanceCaseStages('c'); lastRpc('maintenance_case_stages', { p_case_id: 'c' })
    await vehicleOperations.maintenanceAdvanceStage('c'); lastRpc('maintenance_advance_stage', { p_case_id: 'c', p_diagnosis: null, p_notes: null })
    await vehicleOperations.maintenanceArchive(); lastRpc('maintenance_archive_list', { p_search: null, p_from: null, p_to: null, p_workshop: null })
  })
})

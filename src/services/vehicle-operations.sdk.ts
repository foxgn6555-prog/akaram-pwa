import { sdkGuard, supabase } from './client'
export type LocationType = 'work_site' | 'transfer_station' | 'maintenance' | 'garage'
export interface TripLeg {
  id: string
  departureId: string
  sequenceNo: number
  originType: LocationType
  destinationType: LocationType
  departedAt: string
  departedBy: string
  departureNotes: string | null
  arrivedAt: string | null
  arrivedBy: string | null
  arrivalNotes: string | null
}
export interface StationMovement {
  leg_id: string
  departure_id: string
  sequence_no: number
  origin_type: LocationType
  destination_type: LocationType
  departed_at: string
  arrived_at: string | null
  departure_notes: string | null
  arrival_notes: string | null
  vehicle_id: string
  vehicle_name: string
  db_number: string
  driver_name: string
  shift: string
  area_name: string
  manager_name: string
}
export interface StationDay {
  visit_day: string
  visit_count: number
  vehicle_count: number
  open_count: number
  first_arrival_at: string | null
  last_activity_at: string
  total_stay_minutes: number
}
export interface StationVisit {
  visit_id: string
  departure_id: string
  visit_number: number
  inbound_sequence: number
  vehicle_id: string
  vehicle_name: string
  db_number: string
  driver_name: string
  shift: string
  sector_id: number
  area_name: string
  manager_name: string
  inbound_departed_at: string
  arrived_at: string | null
  dispatched_at: string | null
  outbound_destination: 'work_site' | 'garage' | null
  status: 'in_transit' | 'at_station' | 'dispatched'
  transit_minutes: number | null
  stay_minutes: number | null
  inbound_notes: string | null
  arrival_notes: string | null
  dispatch_notes: string | null
}
export interface MaintenanceDispatchState {
  case_id?: string
  dispatch_policy?: 'notify_only' | 'ack_required' | 'approval_required'
  decision_status?:
    'not_required' | 'awaiting_ack' | 'acknowledged' | 'awaiting_approval' | 'approved' | 'rejected'
  garage_decision_notes?: string | null
  reported_at?: string
}
export interface GarageMaintenanceCoordination {
  case_id: string
  departure_id: string
  vehicle_name: string
  db_number: string
  vehicle_category: string
  driver_name: string
  sector_name: string
  manager_name: string
  fault_type: string
  priority: 'normal' | 'urgent' | 'critical'
  dispatch_policy: 'ack_required' | 'approval_required'
  decision_status: 'awaiting_ack' | 'acknowledged' | 'awaiting_approval' | 'approved' | 'rejected'
  reported_at: string
  decision_notes: string | null
}
export interface MaintenanceCase {
  case_id: string
  departure_id: string
  breakdown_id: string
  vehicle_id: string
  vehicle_name: string
  db_number: string
  driver_name: string
  shift: string
  area_name: string
  manager_name: string
  status: string
  fault_type: string
  priority: string
  reported_at: string
  arrived_at: string | null
  diagnosis: string | null
  work_notes: string | null
  parts_notes: string | null
  progress: number
  expected_completion_at: string | null
  ready_at: string | null
  departed_maintenance_at: string | null
  completed_at: string | null
  assigned_technician: string | null
  estimated_cost: number | null
  actual_cost: number | null
  service_cost: number
  parts_actual_cost: number
  delay_reason: string | null
  assigned_technician_id: string | null
  ready_declared_by: string | null
  readiness_approved_at: string | null
  readiness_approved_by: string | null
  readiness_approval_notes: string | null
}
export interface MaintenanceUpdate {
  id: string
  case_id: string
  status: string
  progress: number
  diagnosis: string | null
  work_notes: string | null
  parts_notes: string | null
  assigned_technician: string | null
  assigned_technician_id: string | null
  estimated_cost: number | null
  actual_cost: number | null
  delay_reason: string | null
  expected_completion_at: string | null
  created_at: string
  created_by: string
}
export interface MaintenancePart {
  id: string
  case_id: string
  part_name: string
  quantity: number
  unit: string
  unit_cost: number | null
  notes: string | null
  created_at: string
  inventory_item_id: string | null
  issue_movement_id: string | null
  part_status: 'issued' | 'installed' | 'returned'
  installed_at: string | null
  returned_at: string | null
}
export interface MaintenanceInventoryItem {
  id: string
  sku: string
  item_name: string
  unit: string
  current_quantity: number
  average_unit_cost: number
  low_stock_threshold: number
  is_active: boolean
  updated_at: string
}
export interface MaintenanceAttachment {
  id: string
  case_id: string
  storage_path: string
  original_name: string
  mime_type: string
  size_bytes: number
  sha256: string
  caption: string | null
  created_at: string
  created_by: string
  signedUrl?: string
}
export interface MaintenanceTechnician {
  user_id: string
  display_name: string
  email: string
}
export interface MaintenanceEvent {
  event_key: string
  event_type:
    'case' | 'decision' | 'movement' | 'maintenance_update' | 'part' | 'readiness' | 'completion'
  title: string
  details: string | null
  happened_at: string
  actor_id: string | null
  status: string | null
  progress: number | null
  sequence_no: number
}
export interface MaintenanceTimeline {
  case: Record<string, unknown>
  updates: MaintenanceUpdate[]
  parts: MaintenancePart[]
  attachments: MaintenanceAttachment[]
  legs: Record<string, unknown>[]
}
export interface MaintenanceDay {
  case_day: string
  total_count: number
  open_count: number
}
export interface OpsMovement {
  leg_id: string
  departure_id: string
  vehicle_id: string
  db_number: string
  vehicle_name: string
  driver_name: string
  shift: string
  sector_id: number
  manager_name: string
  origin_type: LocationType
  destination_type: LocationType
  departed_at: string
  arrived_at: string | null
  duration_minutes: number | null
  departure_notes: string | null
  arrival_notes: string | null
}
export interface OperationsAlert {
  alert_id: string
  alert_type: string
  severity: 'warning' | 'critical'
  departure_id: string | null
  case_id: string | null
  vehicle_id: string
  vehicle_name: string
  db_number: string
  driver_name: string
  shift: string
  sector_id: number
  area_name: string
  manager_name: string
  title: string
  details: string
  started_at: string
  threshold_minutes: number
  elapsed_minutes: number
  action_link: string
}
const leg = (r: Record<string, unknown>): TripLeg => ({
  id: String(r.id),
  departureId: String(r.departure_id),
  sequenceNo: Number(r.sequence_no),
  originType: r.origin_type as LocationType,
  destinationType: r.destination_type as LocationType,
  departedAt: String(r.departed_at),
  departedBy: String(r.departed_by),
  departureNotes: r.departure_notes as string | null,
  arrivedAt: r.arrived_at as string | null,
  arrivedBy: r.arrived_by as string | null,
  arrivalNotes: r.arrival_notes as string | null,
})
export const vehicleOperations = {
  async legs(departureId: string) {
    const d = await sdkGuard(
      supabase.rpc('trip_legs_for_departure', { p_departure_id: departureId }),
    )
    return ((d ?? []) as unknown as Record<string, unknown>[]).map(leg)
  },
  async sendToStation(departureId: string, notes?: string) {
    return leg(
      (await sdkGuard(
        supabase.rpc('sector_send_vehicle_to_station', {
          p_departure_id: departureId,
          p_notes: notes?.trim() || null,
        }),
      )) as unknown as Record<string, unknown>,
    )
  },
  async confirmSiteReturn(legId: string, notes?: string) {
    return leg(
      (await sdkGuard(
        supabase.rpc('sector_confirm_vehicle_site_return', {
          p_leg_id: legId,
          p_notes: notes?.trim() || null,
        }),
      )) as unknown as Record<string, unknown>,
    )
  },
  async sendToMaintenance(
    departureId: string,
    faultType: string,
    priority: string,
    notes?: string,
  ) {
    return await sdkGuard(
      supabase.rpc('sector_send_vehicle_to_maintenance', {
        p_departure_id: departureId,
        p_fault_type: faultType.trim(),
        p_priority: priority,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async maintenanceDispatchState(departureId: string) {
    return (await sdkGuard(
      supabase.rpc('sector_trip_maintenance_state', { p_departure_id: departureId }),
    )) as unknown as MaintenanceDispatchState
  },
  async garageMaintenanceCoordination() {
    return ((await sdkGuard(supabase.rpc('garage_maintenance_coordination'))) ??
      []) as unknown as GarageMaintenanceCoordination[]
  },
  async garageMaintenanceDecision(
    caseId: string,
    decision: 'acknowledge' | 'approve' | 'reject',
    notes?: string,
  ) {
    return await sdkGuard(
      supabase.rpc('garage_decide_maintenance_dispatch', {
        p_case_id: caseId,
        p_decision: decision,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async stationList() {
    return ((await sdkGuard(supabase.rpc('station_vehicle_movements'))) ??
      []) as unknown as StationMovement[]
  },
  async stationDays(): Promise<StationDay[]> {
    return ((await sdkGuard(
      supabase.rpc('station_movement_days', { p_limit: 120, p_offset: 0 }),
    )) ?? []) as unknown as StationDay[]
  },
  async stationVisitsForDay(
    day: string,
    filters: { search?: string; status?: StationVisit['status']; sectorId?: number } = {},
  ): Promise<StationVisit[]> {
    return ((await sdkGuard(
      supabase.rpc('station_visits_for_day', {
        p_day: day,
        p_search: filters.search?.trim() || null,
        p_status: filters.status || null,
        p_sector_id: filters.sectorId ?? null,
      }),
    )) ?? []) as unknown as StationVisit[]
  },
  async stationConfirm(legId: string, notes?: string) {
    return await sdkGuard(
      supabase.rpc('station_confirm_vehicle_arrival', {
        p_leg_id: legId,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async stationDispatch(departureId: string, destination: 'work_site' | 'garage', notes?: string) {
    return await sdkGuard(
      supabase.rpc('station_dispatch_vehicle', {
        p_departure_id: departureId,
        p_destination: destination,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async maintenanceList() {
    return ((await sdkGuard(supabase.rpc('maintenance_vehicle_cases'))) ??
      []) as unknown as MaintenanceCase[]
  },
  async maintenanceConfirm(caseId: string, notes?: string) {
    return await sdkGuard(
      supabase.rpc('maintenance_confirm_arrival', {
        p_case_id: caseId,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async maintenanceUpdate(
    caseId: string,
    status: string,
    progress: number,
    data: {
      diagnosis?: string
      workNotes?: string
      partsNotes?: string
      expectedAt?: string
      technician?: string
      technicianId?: string
      estimatedCost?: number
      actualCost?: number
      delayReason?: string
    },
  ) {
    return await sdkGuard(
      supabase.rpc('maintenance_update_case', {
        p_case_id: caseId,
        p_status: status,
        p_progress: progress,
        p_diagnosis: data.diagnosis?.trim() || null,
        p_work_notes: data.workNotes?.trim() || null,
        p_parts_notes: data.partsNotes?.trim() || null,
        p_expected_completion_at: data.expectedAt || null,
        p_assigned_technician: data.technician?.trim() || null,
        p_estimated_cost: data.estimatedCost ?? null,
        p_actual_cost: data.actualCost ?? null,
        p_delay_reason: data.delayReason?.trim() || null,
        p_assigned_technician_id: data.technicianId || null,
      }),
    )
  },
  async maintenanceTechnicians(): Promise<MaintenanceTechnician[]> {
    return ((await sdkGuard(supabase.rpc('maintenance_technicians'))) ??
      []) as unknown as MaintenanceTechnician[]
  },
  async maintenanceApproveReadiness(caseId: string, notes?: string) {
    return await sdkGuard(
      supabase.rpc('maintenance_approve_readiness', {
        p_case_id: caseId,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async maintenanceEvents(caseId: string): Promise<MaintenanceEvent[]> {
    return ((await sdkGuard(supabase.rpc('maintenance_case_events', { p_case_id: caseId }))) ??
      []) as unknown as MaintenanceEvent[]
  },
  async maintenanceTimeline(caseId: string): Promise<MaintenanceTimeline> {
    const timeline = (await sdkGuard(
      supabase.rpc('maintenance_case_timeline', { p_case_id: caseId }),
    )) as unknown as MaintenanceTimeline
    timeline.attachments ??= []
    if (timeline.attachments.length) {
      const signed = await sdkGuard(
        supabase.storage.from('maintenance-attachments').createSignedUrls(
          timeline.attachments.map((item) => item.storage_path),
          900,
        ),
      )
      timeline.attachments.forEach((item, index) => {
        item.signedUrl = signed[index]?.signedUrl ?? undefined
      })
    }
    return timeline
  },
  async maintenanceUploadAttachment(caseId: string, file: File, caption?: string) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    if (!allowed.has(file.type) || file.size < 1 || file.size > 25 * 1024 * 1024)
      throw new Error('MAINTENANCE_ATTACHMENT_INVALID')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const sha256 = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    const ext =
      file.type === 'application/pdf'
        ? 'pdf'
        : file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : 'jpg'
    const path = `${caseId}/${crypto.randomUUID()}.${ext}`
    await sdkGuard(
      supabase.storage
        .from('maintenance-attachments')
        .upload(path, file, { contentType: file.type }),
    )
    return await sdkGuard(
      supabase.rpc('maintenance_register_attachment', {
        p_case_id: caseId,
        p_storage_path: path,
        p_original_name: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        p_sha256: sha256,
        p_caption: caption?.trim() || null,
      }),
    )
  },
  async maintenanceInventory(search?: string): Promise<MaintenanceInventoryItem[]> {
    return ((await sdkGuard(
      supabase.rpc('maintenance_inventory_list', { p_search: search?.trim() || null }),
    )) ?? []) as unknown as MaintenanceInventoryItem[]
  },
  async maintenanceCreateInventory(sku: string, name: string, unit: string, threshold: number) {
    return await sdkGuard(
      supabase.rpc('maintenance_inventory_create', {
        p_sku: sku.trim(),
        p_item_name: name.trim(),
        p_unit: unit.trim() || 'قطعة',
        p_low_stock_threshold: threshold,
      }),
    )
  },
  async maintenanceReceiveInventory(
    itemId: string,
    quantity: number,
    unitCost: number,
    notes?: string,
  ) {
    return await sdkGuard(
      supabase.rpc('maintenance_inventory_receive', {
        p_item_id: itemId,
        p_quantity: quantity,
        p_unit_cost: unitCost,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async maintenanceIssueInventory(
    caseId: string,
    itemId: string,
    quantity: number,
    notes?: string,
  ) {
    return await sdkGuard(
      supabase.rpc('maintenance_issue_inventory', {
        p_case_id: caseId,
        p_item_id: itemId,
        p_quantity: quantity,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async maintenanceInstallPart(partId: string) {
    return await sdkGuard(supabase.rpc('maintenance_install_issued_part', { p_part_id: partId }))
  },
  async maintenanceReturnPart(partId: string, notes?: string) {
    return await sdkGuard(
      supabase.rpc('maintenance_return_issued_part', {
        p_part_id: partId,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async maintenanceDays(): Promise<MaintenanceDay[]> {
    return ((await sdkGuard(supabase.rpc('maintenance_case_days', { p_limit: 120 }))) ??
      []) as unknown as MaintenanceDay[]
  },
  async maintenanceForDay(day: string) {
    return ((await sdkGuard(supabase.rpc('maintenance_cases_for_day', { p_day: day }))) ??
      []) as unknown as MaintenanceCase[]
  },
  async maintenanceDispatch(caseId: string, destination: 'work_site' | 'garage', notes?: string) {
    return await sdkGuard(
      supabase.rpc('maintenance_dispatch_vehicle', {
        p_case_id: caseId,
        p_destination: destination,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  async opsMovements(from: string, to: string) {
    return ((await sdkGuard(
      supabase.rpc('operational_vehicle_movements', { p_from: from, p_to: to }),
    )) ?? []) as unknown as OpsMovement[]
  },
  async opsAttendance(from: string, to: string) {
    return ((await sdkGuard(supabase.rpc('operational_attendance', { p_from: from, p_to: to }))) ??
      []) as unknown as Record<string, unknown>[]
  },
  async opsGarageTrips(from: string, to: string) {
    return ((await sdkGuard(
      supabase.rpc('operational_garage_trips', { p_from: from, p_to: to }),
    )) ?? []) as unknown as Record<string, unknown>[]
  },
  async opsMaintenance(from: string, to: string) {
    return ((await sdkGuard(
      supabase.rpc('operational_maintenance_cases', { p_from: from, p_to: to }),
    )) ?? []) as unknown as Record<string, unknown>[]
  },
  async opsStationVisits(from: string, to: string) {
    return ((await sdkGuard(
      supabase.rpc('operational_station_visits', { p_from: from, p_to: to }),
    )) ?? []) as unknown as Record<string, unknown>[]
  },
  async opsVehicleKpis(
    from: string,
    to: string,
    filters: { search?: string; sectorId?: number; shift?: string } = {},
  ) {
    return ((await sdkGuard(
      supabase.rpc('operational_vehicle_kpis', {
        p_from: from,
        p_to: to,
        p_search: filters.search?.trim() || null,
        p_sector_id: filters.sectorId ?? null,
        p_shift: filters.shift || null,
      }),
    )) ?? []) as unknown as Record<string, unknown>[]
  },
  async opsAlerts(
    filters: { sectorId?: number; shift?: string; severity?: OperationsAlert['severity'] } = {},
  ): Promise<OperationsAlert[]> {
    return ((await sdkGuard(
      supabase.rpc('operational_live_alerts', {
        p_sector_id: filters.sectorId ?? null,
        p_shift: filters.shift || null,
        p_severity: filters.severity || null,
      }),
    )) ?? []) as unknown as OperationsAlert[]
  },
}

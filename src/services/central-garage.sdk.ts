/** SDK بوابة الكراج المركزي — لا وصول إلى Supabase من صفحات البوابة. */
import { SDKError } from '@lib/errors/SDKError'
import { sdkGuard, sdkVoid, supabase } from './client'
import type { GarageReportFilter, GarageReportResult } from '@features/central-garage/reports'
import type {
  CreateGarageVehicleInput,
  GarageArea,
  GarageDashboardFilter,
  GarageDashboardSummary,
  GarageDeparture,
  GarageDriverAssignment,
  GarageFuelType,
  GarageInventoryMovement,
  GarageShift,
  GarageTank,
  GarageTankZeroRequest,
  GarageVehicle,
  GarageVehicleFilter,
  GarageVehiclePage,
} from '@features/central-garage/types'

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function validImageSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (mime === 'image/webp') return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function vehicleRow(row: Record<string, unknown>): GarageVehicle {
  return {
    id: String(row.id), vehicleName: String(row.vehicle_name), dbNumber: String(row.db_number),
    plateNumber: String(row.plate_number), chassisNumber: String(row.chassis_number),
    imagePath: String(row.image_path), shift: row.shift as GarageShift,
    driverName: String(row.driver_name), sectorId: Number(row.sector_id),
    areaName: String(row.area_name ?? ''), parentSector: row.parent_sector as GarageVehicle['parentSector'],
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    archivedAt: (row.archived_at as string | null) ?? null,
    archivedBy: (row.archived_by as string | null) ?? null,
    archiveReason: (row.archive_reason as string | null) ?? null,
  }
}

function assignmentRow(row: Record<string, unknown>): GarageDriverAssignment {
  return {
    id: String(row.id), vehicleId: String(row.vehicle_id), driverName: String(row.driver_name),
    shift: row.shift as GarageShift, sectorId: Number(row.sector_id), startsAt: String(row.starts_at),
    endsAt: (row.ends_at as string | null) ?? null,
    changeReason: (row.change_reason as string | null) ?? null,
  }
}

function tankRow(row: Record<string, unknown>): GarageTank {
  return {
    id: String(row.id), fuelType: row.fuel_type as GarageFuelType, tankName: String(row.tank_name),
    unit: (row.unit as string) ?? 'لتر', capacity: Number(row.capacity), currentQuantity: Number(row.current_quantity),
    lowStockThreshold: Number(row.low_stock_threshold), createdAt: String(row.created_at),
    updatedAt: String(row.updated_at), archivedAt: (row.archived_at as string | null) ?? null,
  }
}

function movementRow(row: Record<string, unknown>): GarageInventoryMovement {
  return {
    id: String(row.id), tankId: String(row.tank_id), vehicleId: (row.vehicle_id as string | null) ?? null,
    movementType: row.movement_type as GarageInventoryMovement['movementType'], quantity: Number(row.quantity),
    quantityBefore: Number(row.quantity_before), quantityAfter: Number(row.quantity_after),
    nextRefillDate: (row.next_refill_date as string | null) ?? null,
    notes: (row.notes as string | null) ?? null, actorId: String(row.actor_id), createdAt: String(row.created_at),
  }
}

function zeroRequestRow(row: Record<string, unknown>): GarageTankZeroRequest {
  return {
    id: String(row.id), tankId: String(row.tank_id), requestedQuantity: Number(row.requested_quantity),
    reason: String(row.reason), status: row.status as GarageTankZeroRequest['status'],
    requestedBy: String(row.requested_by), requestedAt: String(row.requested_at),
    decidedBy: (row.decided_by as string | null) ?? null, decidedAt: (row.decided_at as string | null) ?? null,
    decisionNote: (row.decision_note as string | null) ?? null,
  }
}

function departureRow(row: Record<string, unknown>): GarageDeparture {
  return {
    id: String(row.id), vehicleId: String(row.vehicle_id), driverName: String(row.driver_name),
    shift: row.shift as GarageShift, sectorId: Number(row.sector_id),
    departedAt: String(row.departed_at), returnedAt: (row.returned_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null, vehicleName: String(row.vehicle_name),
    dbNumber: String(row.db_number), imagePath: String(row.image_path),
    areaName: String(row.area_name ?? ''), parentSector: row.parent_sector as GarageDeparture['parentSector'],
  }
}

async function uploadVehicleImage(file: File): Promise<string> {
  if (!imageTypes.has(file.type) || file.size < 1 || file.size > 15 * 1024 * 1024) {
    throw new SDKError('صورة الآلية يجب أن تكون JPG أو PNG أو WebP وبحجم لا يتجاوز 15MB', 'GARAGE_IMAGE_INVALID')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!validImageSignature(bytes, file.type)) {
    throw new SDKError('محتوى صورة الآلية لا يطابق نوع الملف', 'GARAGE_IMAGE_SIGNATURE_INVALID')
  }
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new SDKError('جلسة المستخدم غير متاحة', 'GARAGE_UNAUTHENTICATED', authError)
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`
  await sdkGuard(supabase.storage.from('garage-vehicles').upload(path, file, { contentType: file.type }))
  return path
}

export const centralGarage = {
  async areas(): Promise<GarageArea[]> {
    const rows = await sdkGuard(supabase.from('sectors').select('id,name,parent_sector,sort').order('sort').returns<Record<string, unknown>[]>() )
    return (rows ?? []).map((row) => ({ id: Number(row.id), name: String(row.name), parentSector: row.parent_sector as GarageArea['parentSector'], sort: Number(row.sort) }))
  },

  async vehicles(filter: GarageVehicleFilter = {}): Promise<GarageVehiclePage> {
    const pageSize = Math.min(100, Math.max(12, Math.trunc(filter.pageSize ?? 48)))
    const page = Math.max(1, Math.trunc(filter.page ?? 1))
    const data = await sdkGuard(supabase.rpc('garage_search_vehicles', {
      p_search: filter.search?.trim() || null, p_sector_id: filter.sectorId ?? null,
      p_shift: filter.shift ?? null, p_limit: pageSize, p_offset: (page - 1) * pageSize,
      p_archived: filter.archived ?? false,
    }))
    const source = (data ?? []) as unknown as Record<string, unknown>[]
    const rows = source.map(vehicleRow)
    const signed = rows.length
      ? await sdkGuard(supabase.storage.from('garage-vehicles').createSignedUrls(rows.map((row) => row.imagePath), 600))
      : []
    rows.forEach((row, index) => {
      const url = signed[index]?.signedUrl
      if (url) row.imageUrl = url
    })
    return { rows, totalCount: Number(source[0]?.total_count ?? 0) }
  },

  async vehicle(vehicleId: string): Promise<GarageVehicle> {
    const row = await sdkGuard(supabase.from('garage_vehicles')
      .select('id,vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,sector_id,created_at,updated_at,archived_at,archived_by,archive_reason,sectors(name,parent_sector)')
      .eq('id', vehicleId).single().returns<Record<string, unknown>>())
    const source = row as Record<string, unknown>
    const sector = (source.sectors ?? {}) as Record<string, unknown>
    const vehicle = vehicleRow({ ...source, area_name: sector.name, parent_sector: sector.parent_sector })
    const signed = await sdkGuard(supabase.storage.from('garage-vehicles').createSignedUrl(vehicle.imagePath, 600))
    vehicle.imageUrl = signed.signedUrl
    return vehicle
  },

  async createVehicle(input: CreateGarageVehicleInput): Promise<GarageVehicle> {
    const imagePath = await uploadVehicleImage(input.image)
    try {
      const data = await sdkGuard(supabase.rpc('garage_add_vehicle', {
        p_vehicle_name: input.vehicleName, p_db_number: input.dbNumber,
        p_plate_number: input.plateNumber, p_chassis_number: input.chassisNumber,
        p_image_path: imagePath, p_shift: input.shift, p_driver_name: input.driverName,
        p_sector_id: input.sectorId,
      }))
      return vehicleRow(data as unknown as Record<string, unknown>)
    } catch (error) {
      await supabase.storage.from('garage-vehicles').remove([imagePath])
      throw error
    }
  },

  async updateVehicle(id: string, input: Omit<CreateGarageVehicleInput, 'shift' | 'driverName' | 'sectorId' | 'image'> & { image?: File }): Promise<GarageVehicle> {
    let imagePath: string | null = null
    if (input.image) imagePath = await uploadVehicleImage(input.image)
    try {
      const data = await sdkGuard(supabase.rpc('garage_update_vehicle', {
        p_vehicle_id: id, p_vehicle_name: input.vehicleName, p_db_number: input.dbNumber,
        p_plate_number: input.plateNumber, p_chassis_number: input.chassisNumber, p_image_path: imagePath,
      }))
      return vehicleRow(data as unknown as Record<string, unknown>)
    } catch (error) {
      if (imagePath) await supabase.storage.from('garage-vehicles').remove([imagePath])
      throw error
    }
  },

  async assignDriver(vehicleId: string, driverName: string, shift: GarageShift, sectorId: number, reason?: string): Promise<GarageDriverAssignment> {
    const data = await sdkGuard(supabase.rpc('garage_assign_driver', {
      p_vehicle_id: vehicleId, p_driver_name: driverName, p_shift: shift,
      p_sector_id: sectorId, p_reason: reason?.trim() || null,
    }))
    return assignmentRow(data as unknown as Record<string, unknown>)
  },

  async assignmentHistory(vehicleId: string): Promise<GarageDriverAssignment[]> {
    const rows = await sdkGuard(supabase.from('garage_driver_assignments').select('*').eq('vehicle_id', vehicleId).order('starts_at', { ascending: false }).returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(assignmentRow)
  },

  async archiveVehicle(vehicleId: string, reason: string): Promise<void> {
    await sdkVoid(supabase.rpc('garage_archive_vehicle', { p_vehicle_id: vehicleId, p_reason: reason.trim() }))
  },

  async restoreVehicle(vehicleId: string, reason: string): Promise<GarageVehicle> {
    const data = await sdkGuard(supabase.rpc('garage_restore_vehicle', { p_vehicle_id: vehicleId, p_reason: reason.trim() }))
    return vehicleRow(data as unknown as Record<string, unknown>)
  },

  async tanks(fuelType?: GarageFuelType): Promise<GarageTank[]> {
    let query = supabase.from('garage_tanks').select('*').is('archived_at', null).order('tank_name')
    if (fuelType) query = query.eq('fuel_type', fuelType)
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(tankRow)
  },

  async addTank(fuelType: GarageFuelType, tankName: string, unit: string, capacity: number, initialQuantity = 0, lowStockThreshold = 20): Promise<GarageTank> {
    const data = await sdkGuard(supabase.rpc('garage_add_tank', {
      p_fuel_type: fuelType, p_tank_name: tankName, p_unit: unit, p_capacity: capacity,
      p_initial_quantity: initialQuantity, p_low_stock_threshold: lowStockThreshold,
    }))
    return tankRow(data as unknown as Record<string, unknown>)
  },

  async addTankStock(tankId: string, quantity: number, notes?: string): Promise<GarageInventoryMovement> {
    const data = await sdkGuard(supabase.rpc('garage_add_tank_stock', { p_tank_id: tankId, p_quantity: quantity, p_notes: notes?.trim() || null }))
    return movementRow(data as unknown as Record<string, unknown>)
  },

  async fillVehicle(tankId: string, vehicleId: string, quantity: number, nextRefillDate?: string, notes?: string): Promise<GarageInventoryMovement> {
    const data = await sdkGuard(supabase.rpc('garage_fill_vehicle', {
      p_tank_id: tankId, p_vehicle_id: vehicleId, p_quantity: quantity,
      p_next_refill_date: nextRefillDate ?? null, p_notes: notes?.trim() || null,
    }))
    return movementRow(data as unknown as Record<string, unknown>)
  },

  async movements(filter: { tankId?: string; vehicleId?: string } = {}): Promise<GarageInventoryMovement[]> {
    let query = supabase.from('garage_inventory_movements').select('*').order('created_at', { ascending: false }).limit(200)
    if (filter.tankId) query = query.eq('tank_id', filter.tankId)
    if (filter.vehicleId) query = query.eq('vehicle_id', filter.vehicleId)
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(movementRow)
  },

  async requestTankZero(tankId: string, reason: string): Promise<GarageTankZeroRequest> {
    const data = await sdkGuard(supabase.rpc('garage_request_tank_zero', { p_tank_id: tankId, p_reason: reason.trim() }))
    return zeroRequestRow(data as unknown as Record<string, unknown>)
  },

  async zeroRequests(status?: GarageTankZeroRequest['status']): Promise<GarageTankZeroRequest[]> {
    let query = supabase.from('garage_tank_zero_requests').select('*').order('requested_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const rows = await sdkGuard(query.returns<Record<string, unknown>[]>() )
    return (rows ?? []).map(zeroRequestRow)
  },

  async decideTankZero(requestId: string, approved: boolean, note?: string): Promise<GarageTankZeroRequest> {
    const data = await sdkGuard(supabase.rpc('garage_decide_tank_zero', { p_request_id: requestId, p_approved: approved, p_note: note?.trim() || null }))
    return zeroRequestRow(data as unknown as Record<string, unknown>)
  },

  async todayDepartures(): Promise<GarageDeparture[]> {
    const data = await sdkGuard(supabase.rpc('garage_today_departures'))
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const departures = rows.map(departureRow)
    const signed = departures.length
      ? await sdkGuard(supabase.storage.from('garage-vehicles').createSignedUrls(departures.map((row) => row.imagePath), 600))
      : []
    departures.forEach((row, index) => {
      const url = signed[index]?.signedUrl
      if (url) row.imageUrl = url
    })
    return departures
  },

  async recordDeparture(vehicleId: string, notes?: string): Promise<GarageDeparture> {
    const data = await sdkGuard(supabase.rpc('garage_record_departure', { p_vehicle_id: vehicleId, p_notes: notes?.trim() || null }))
    return departureRow(data as unknown as Record<string, unknown>)
  },

  async recordReturn(departureId: string): Promise<GarageDeparture> {
    const data = await sdkGuard(supabase.rpc('garage_record_return', { p_departure_id: departureId }))
    return departureRow(data as unknown as Record<string, unknown>)
  },

  async dashboard(filter: GarageDashboardFilter = {}): Promise<GarageDashboardSummary> {
    const data = await sdkGuard(supabase.rpc('garage_dashboard_summary', {
      p_from: filter.from ?? null, p_to: filter.to ?? null,
      p_sector_id: filter.sectorId ?? null, p_fuel_type: filter.fuelType ?? null,
    }))
    return data as unknown as GarageDashboardSummary
  },

  async report(filter: GarageReportFilter = {}): Promise<GarageReportResult> {
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filter.pageSize ?? 50)))
    const page = Math.max(1, Math.trunc(filter.page ?? 1))
    const data = await sdkGuard(supabase.rpc('garage_consumption_report', {
      p_from: filter.from ?? null, p_to: filter.to ?? null, p_sector_id: filter.sectorId ?? null,
      p_fuel_type: filter.fuelType ?? null, p_tank_id: filter.tankId ?? null,
      p_vehicle_id: filter.vehicleId ?? null, p_movement_type: filter.movementType ?? null,
      p_limit: pageSize, p_offset: (page - 1) * pageSize,
    }))
    return data as unknown as GarageReportResult
  },

  async reportAll(filter: Omit<GarageReportFilter,'page'|'pageSize'> = {}): Promise<GarageReportResult> {
    const first = await centralGarage.report({ ...filter, page:1, pageSize:100 })
    if (first.rows.length >= first.totalCount) return first
    const rows=[...first.rows]; const pages=Math.ceil(first.totalCount/100)
    for(let page=2;page<=pages;page+=1){const next=await centralGarage.report({...filter,page,pageSize:100});rows.push(...next.rows)}
    return { ...first, rows }
  },
}

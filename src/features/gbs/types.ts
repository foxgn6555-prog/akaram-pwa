/** أنواع وحدة GBS الحاويات (00136) */

export type GbsContainerStatus = 'ok' | 'damaged' | 'replace' | 'missing'
export type GbsUpdateState = 'pending' | 'approved' | 'rejected'

export interface GbsContainer {
  id: string
  code: string
  label: string
  latitude: number
  longitude: number
  status: GbsContainerStatus
  imagePath: string | null
  notes: string | null
  updatedAt: string
  pendingCount: number
  sectorId: number
  areaName: string
  parentSector: 'karrada' | 'zaafaraniya'
}

export interface GbsZone {
  id: string
  name: string
  source: string
  color: string | null
  polygon: ([number, number] | { lat: number; lng: number })[]
}

export interface GbsUpdateRequest {
  id: string
  containerId: string
  code: string
  label: string
  proposedStatus: GbsContainerStatus
  photoPath: string | null
  note: string | null
  state: GbsUpdateState
  requestedBy?: string
  requesterName?: string
  createdAt: string
  reviewedAt: string | null
  reviewNote: string | null
}

export interface GbsContainerSaveInput {
  id?: string | null
  label: string
  latitude: number
  longitude: number
  status: GbsContainerStatus
  sectorId: number
  imagePath?: string | null
  notes?: string | null
}

export interface GbsUpdateRequestInput {
  containerId: string
  proposedStatus: GbsContainerStatus
  photoPath?: string | null
  note?: string | null
}

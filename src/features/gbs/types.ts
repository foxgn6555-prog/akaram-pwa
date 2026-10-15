/** أنواع وحدة GBS الحاويات (00136) */

export type GbsContainerStatus = 'ok' | 'damaged' | 'replace' | 'missing'
export type GbsUpdateState = 'pending' | 'approved' | 'rejected'
/** 00260: نوع الطلب — حالة (مسؤول القسم) أو موقع (المتابعة) */
/** 00234: 'both' = موقع + حالة في طلب واحد (المتابعة) */
export type GbsUpdateKind = 'status' | 'location' | 'both'

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
  /** 00260 */
  kind: GbsUpdateKind
  proposedLatitude: number | null
  proposedLongitude: number | null
  accuracyM: number | null
  currentLatitude?: number | null
  currentLongitude?: number | null
  areaName?: string | null
}

/** 00260: طلب تحديث موقع حاوية إلى GPS الحالي (معلّق حتى اعتماد غرفة العمليات) */
export interface GbsLocationRequestInput {
  containerId: string
  /** 00234: الإحداثيات اختيارية — طلب حالة فقط عند غيابها */
  latitude?: number | null
  longitude?: number | null
  accuracy?: number | null
  note?: string | null
  /** 00234: الحالة المقترحة (اختيارية؛ تُتجاهل إن ساوت الحالية) */
  status?: GbsContainerStatus | null
}

/** 00260: ملخص الحاويات لرئيسية المتابعة */
export interface FollowUpContainersSummary { containers: number; damaged: number; missing: number; my_pending: number; my_approved: number; my_rejected: number }

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

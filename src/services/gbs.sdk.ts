/**
 * SDK وحدة GBS الحاويات (00136) — كل لمسات Supabase حصراً هنا (قانون SDK).
 * غرفة العمليات: إدارة كاملة + اعتماد الطلبات. مسؤول القسم: طلبات تحديث فقط.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'
import type {
  GbsContainer,
  GbsZone,
  GbsContainerSaveInput,
  GbsContainerStatus,
  GbsUpdateRequest,
  GbsUpdateRequestInput,
  GbsUpdateState,
} from '@features/gbs/types'

const GBS_BUCKET = 'gbs-containers'

function normContainer(r: Record<string, unknown>): GbsContainer {
  return {
    id: String(r.id),
    code: String(r.code),
    label: String(r.label),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    status: r.status as GbsContainerStatus,
    imagePath: (r.image_path as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    updatedAt: String(r.updated_at),
    pendingCount: Number(r.pending_count ?? 0),
    sectorId: Number(r.sector_id ?? 1),
    areaName: String(r.area_name ?? ''),
    parentSector: (r.parent_sector as 'karrada' | 'zaafaraniya') ?? 'karrada',
  }
}

function normUpdate(r: Record<string, unknown>): GbsUpdateRequest {
  return {
    id: String(r.id),
    containerId: String(r.container_id),
    code: String(r.code),
    label: String(r.label),
    proposedStatus: r.proposed_status as GbsContainerStatus,
    photoPath: (r.photo_path as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    state: r.state as GbsUpdateState,
    requestedBy: r.requested_by != null ? String(r.requested_by) : undefined,
    requesterName: r.requester_name != null ? String(r.requester_name) : undefined,
    createdAt: String(r.created_at),
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    reviewNote: (r.review_note as string | null) ?? null,
  }
}

export const gbs = {
  /** قائمة الحاويات للخريطة مع بحث وفلترة حالة */
  async containers(
    search?: string | null,
    status?: GbsContainerStatus | null,
    parent?: 'karrada' | 'zaafaraniya' | null,
    sectorId?: number | null,
  ): Promise<GbsContainer[]> {
    const data = await sdkGuard(
      supabase.rpc('gbs_containers_list', {
        p_search: search?.trim() || null,
        p_status: status ?? null,
        p_parent: parent ?? null,
        p_sector_id: sectorId ?? null,
      }),
    )
    return ((data ?? []) as Record<string, unknown>[]).map(normContainer)
  },

  /** إضافة/تعديل حاوية — غرفة العمليات فقط */
  async save(input: GbsContainerSaveInput): Promise<{ id: string; code: string }> {
    const data = await sdkGuard(
      supabase.rpc('gbs_container_save', {
        p_id: input.id ?? null,
        p_label: input.label.trim(),
        p_latitude: input.latitude,
        p_longitude: input.longitude,
        p_status: input.status,
        p_sector_id: input.sectorId,
        p_image_path: input.imagePath?.trim() || null,
        p_notes: input.notes?.trim() || null,
      }),
    )
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown>) : (data as Record<string, unknown>)
    return { id: String(row.id), code: String(row.code) }
  },

  /** حذف حاوية — غرفة العمليات فقط */
  async remove(id: string): Promise<void> {
    await sdkVoid(supabase.rpc('gbs_container_delete', { p_id: id }))
  },

  /** طلب تحديث حالة من مسؤول القسم (معلق حتى الاعتماد) */
  async requestUpdate(input: GbsUpdateRequestInput): Promise<string> {
    const data = await sdkGuard(
      supabase.rpc('gbs_container_request_update', {
        p_container_id: input.containerId,
        p_proposed_status: input.proposedStatus,
        p_photo_path: input.photoPath?.trim() || null,
        p_note: input.note?.trim() || null,
      }),
    )
    return String(data)
  },

  /** طلبات التحديث — غرفة العمليات (افتراضياً المعلقة) */
  async updates(state: GbsUpdateState = 'pending'): Promise<GbsUpdateRequest[]> {
    const data = await sdkGuard(supabase.rpc('gbs_updates_list', { p_state: state }))
    return ((data ?? []) as Record<string, unknown>[]).map(normUpdate)
  },

  /** سجل طلبات مسؤول القسم نفسه */
  async myUpdates(): Promise<GbsUpdateRequest[]> {
    const data = await sdkGuard(supabase.rpc('gbs_my_update_requests'))
    return ((data ?? []) as Record<string, unknown>[]).map(normUpdate)
  },

  /** اعتماد/رفض طلب تحديث — غرفة العمليات فقط */
  async review(
    updateId: string,
    approve: boolean,
    reviewNote?: string | null,
  ): Promise<{ containerId: string; code: string; newStatus: GbsContainerStatus }> {
    const data = await sdkGuard(
      supabase.rpc('gbs_update_review', {
        p_update_id: updateId,
        p_approve: approve,
        p_review_note: reviewNote?.trim() || null,
      }),
    )
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown>) : (data as Record<string, unknown>)
    return {
      containerId: String(row.container_id),
      code: String(row.code),
      newStatus: row.new_status as GbsContainerStatus,
    }
  },

  /** مناطق اختصاص مسؤول القسم (manager_profiles.sectors) — فارغة لبلا إسناد */
  async jurisdiction(): Promise<number[]> {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id
    if (!uid) return []
    const res = await supabase
      .from('manager_profiles')
      .select('sectors')
      .eq('user_id', uid)
      .maybeSingle()
    if (res.error) throw new SDKError(res.error.message, 'GBS_JURISDICTION_FAILED')
    return ((res.data?.sectors ?? []) as number[]).map(Number)
  },

  /** زونات GPS التشغيلية لعرضها على خريطة الحاويات */
  async zones(): Promise<GbsZone[]> {
    const data = await sdkGuard(supabase.rpc('gbs_zones_list'))
    return ((data ?? []) as Record<string, unknown>[]).map((z) => ({
      id: String(z.id),
      name: String(z.name),
      source: String(z.source),
      color: (z.color as string | null) ?? null,
      polygon: (z.polygon as [number, number][]) ?? [],
    }))
  },

  /** رفع صورة حاوية (اختياري) إلى مخزن خاص بمجلد المستخدم */
  async uploadImage(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new SDKError('ملف الصورة غير صالح — اختر صورة فقط', 'GBS_IMAGE_INVALID')
    }
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id ?? 'anon'
    const safe = file.name.replace(/[^\w.-]+/g, '_')
    const path = `${uid}/gbs-${Date.now()}-${safe}`
    const up = await supabase.storage.from(GBS_BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (up.error) throw new SDKError(up.error.message, 'GBS_UPLOAD_FAILED')
    return path
  },

  /** رابط مؤقت لعرض صورة حاوية */
  async imageUrl(path: string): Promise<string> {
    const res = await supabase.storage.from(GBS_BUCKET).createSignedUrl(path, 60 * 30)
    if (res.error) throw new SDKError(res.error.message, 'GBS_IMAGE_URL_FAILED')
    return res.data.signedUrl
  },
}

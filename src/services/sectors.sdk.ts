/** SDK القطاعات والمناطق الديناميكية (00393) — المصدر الوحيد لشجرة القطاعات/المناطق؛ الكتابة للتطوير المركزية فقط */
import { sdkGuard, supabase } from './client'

export interface SectorArea { id: number; code: string; name: string; sort: number; is_active: boolean }
export interface ParentSectorNode { code: string; name: string; sort: number; is_active: boolean; areas: SectorArea[] }

export const sectorsSdk = {
  /** شجرة القطاعات بمناطقها (الفعّالة فقط افتراضياً؛ includeInactive للتطوير المركزية) */
  async tree(includeInactive = false): Promise<ParentSectorNode[]> {
    return ((await sdkGuard(supabase.rpc('sectors_tree', { p_include_inactive: includeInactive }))) as ParentSectorNode[] | null) ?? []
  },
  async saveParent(input: { code: string; name: string; sort?: number | null; is_active?: boolean | null }): Promise<ParentSectorNode[]> {
    return ((await sdkGuard(supabase.rpc('it_parent_sector_save', { p_code: input.code, p_name: input.name, p_sort: input.sort ?? null, p_is_active: input.is_active ?? true }))) as ParentSectorNode[] | null) ?? []
  },
  async setParentActive(code: string, active: boolean): Promise<ParentSectorNode[]> {
    return ((await sdkGuard(supabase.rpc('it_parent_sector_set_active', { p_code: code, p_is_active: active }))) as ParentSectorNode[] | null) ?? []
  },
  async saveArea(input: { id?: number | null; parent_sector: string; name: string; sort?: number | null; is_active?: boolean | null }): Promise<ParentSectorNode[]> {
    return ((await sdkGuard(supabase.rpc('it_area_save', { p_id: input.id ?? null, p_parent_sector: input.parent_sector, p_name: input.name, p_sort: input.sort ?? null, p_is_active: input.is_active ?? true }))) as ParentSectorNode[] | null) ?? []
  },
}

/** SDK ورش الصيانة (00271): المركزية + ورشة قاطع الزعفرانية — إسناد حساب الصيانة من التطوير المركزية، وورشة الحساب الحالي في البوابة. */
import { sdkGuard, supabase } from './client'

export type WorkshopKey = 'central' | 'zaafaraniya' | (string & {})
export interface MaintenanceWorkshop { key: WorkshopKey; name: string; parent_sector: string | null; is_active: boolean; accounts: number; open_cases: number }
export interface MaintenanceWorkshopAccount {
  is_maintenance: boolean; workshop_key?: WorkshopKey; workshop_name?: string; explicit?: boolean
  assigned_at?: string | null; assigned_by_name?: string | null; notes?: string | null
}
export interface MyWorkshop { key: WorkshopKey | null; name: string | null; scoped: boolean }

export const maintenanceWorkshops = {
  async list(): Promise<MaintenanceWorkshop[]> {
    return ((await sdkGuard(supabase.rpc('maintenance_workshops_list'))) as MaintenanceWorkshop[] | null) ?? []
  },
  async accountFor(userId: string): Promise<MaintenanceWorkshopAccount> {
    return ((await sdkGuard(supabase.rpc('maintenance_workshop_account_get', { p_user_id: userId }))) as MaintenanceWorkshopAccount | null) ?? { is_maintenance: false }
  },
  async assign(x: { userId: string; workshopKey: WorkshopKey; notes?: string | null }): Promise<MaintenanceWorkshopAccount> {
    return (await sdkGuard(supabase.rpc('maintenance_workshop_assign', { p_user_id: x.userId, p_workshop_key: x.workshopKey, p_notes: x.notes ?? null }))) as MaintenanceWorkshopAccount
  },
  async mine(): Promise<MyWorkshop> {
    return ((await sdkGuard(supabase.rpc('maintenance_my_workshop'))) as MyWorkshop | null) ?? { key: null, name: null, scoped: false }
  },
}

/** SDK ورش الصيانة (00271): المركزية + ورشة قاطع الزعفرانية — إسناد حساب الصيانة من التطوير المركزية، وورشة الحساب الحالي في البوابة. */
import { sdkGuard, supabase } from './client'

export type WorkshopKey = 'central' | 'zaafaraniya' | (string & {})
export interface MaintenanceWorkshop { key: WorkshopKey; name: string; parent_sector: string | null; is_active: boolean; accounts: number; open_cases: number }
export interface MaintenanceWorkshopAccount {
  is_maintenance: boolean; workshop_key?: WorkshopKey; workshop_name?: string; explicit?: boolean
  assigned_at?: string | null; assigned_by_name?: string | null; notes?: string | null
}
export interface MaintenanceWorkshopAccountRow { user_id: string; display_name: string; email: string; workshop_key: WorkshopKey; workshop_name: string; explicit: boolean; assigned_at: string | null; department_name: string | null }
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
  async accounts(): Promise<MaintenanceWorkshopAccountRow[]> {
    return ((await sdkGuard(supabase.rpc('maintenance_workshop_accounts_list'))) as MaintenanceWorkshopAccountRow[] | null) ?? []
  },
  async setActive(key: WorkshopKey, isActive: boolean): Promise<MaintenanceWorkshop[]> {
    return ((await sdkGuard(supabase.rpc('maintenance_workshop_set_active', { p_key: key, p_is_active: isActive }))) as MaintenanceWorkshop[] | null) ?? []
  },
  async mine(): Promise<MyWorkshop> {
    return ((await sdkGuard(supabase.rpc('maintenance_my_workshop'))) as MyWorkshop | null) ?? { key: null, name: null, scoped: false }
  },
}

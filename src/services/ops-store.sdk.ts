/** 00162 · مخزن غرفة العمليات + طلبات مستلزمات القواطع (بلا أي بيانات مالية) */
import { sdkGuard, supabase } from './client'
import type { SupplyItem } from '@sdk/sector-manager.sdk'

export interface StoreItem { id: string; name: string; unit: string; qty_on_hand: number; min_qty: number; is_active: boolean; low_stock: boolean; reserved: number; updated_at: string }
export interface StoreMovement { id: string; item_id: string; item_name: string; unit: string; kind: 'in' | 'out' | 'adjust'; qty: number; balance_after: number; request_id: string | null; request_ref: string | null; note: string | null; by_name: string | null; created_at: string }
export type SupplyStatus = 'pending' | 'approved' | 'ready' | 'rejected' | 'delivered' | 'cancelled'
export interface SupplyRequestRow {
  id: string; ref_no: string | null; manager_id: string; manager_name: string; shift: string; areas: string | null; parent_sector: string | null; items: SupplyItem[]; notes: string | null
  approval_status: SupplyStatus; current_step: string | null; created_at: string; decided_at: string | null; delivered_at: string | null; receiver_name: string | null; delivery_note: string | null; cancel_reason: string | null; delivered_by_name: string | null
  ready_at: string | null; ready_by_name: string | null; ready_note: string | null; pending_steps: number
}
export type SupplyScope = 'open' | 'ready' | 'done' | 'all'

export const opsStore = {
  items: async (includeInactive = false) => (await sdkGuard(supabase.rpc('ops_store_items_list', { p_include_inactive: includeInactive }))) as StoreItem[],
  movements: async (itemId?: string | null, limit = 100) => (await sdkGuard(supabase.rpc('ops_store_movements_list', { p_item: itemId ?? null, p_limit: limit }))) as StoreMovement[],
  saveItem: async (x: { id?: string | null; name: string; unit: string; minQty: number; active?: boolean }) =>
    (await sdkGuard(supabase.rpc('ops_store_item_save', { p_id: x.id ?? null, p_name: x.name, p_unit: x.unit, p_min_qty: x.minQty, p_active: x.active ?? true }))) as string,
  receive: async (itemId: string, qty: number, note?: string | null) => (await sdkGuard(supabase.rpc('ops_store_receive', { p_item: itemId, p_qty: qty, p_note: note ?? null }))) as number,
  adjust: async (itemId: string, newQty: number, reason: string) => (await sdkGuard(supabase.rpc('ops_store_adjust', { p_item: itemId, p_new_qty: newQty, p_reason: reason }))) as number,
  requests: async (scope: SupplyScope = 'open') => (await sdkGuard(supabase.rpc('supply_requests_list', { p_scope: scope }))) as SupplyRequestRow[],
  createRequest: async (items: { item_id: string; qty: number }[], notes?: string | null) => (await sdkGuard(supabase.rpc('supply_request_create', { p_items: items, p_notes: notes ?? null }))) as string,
  deliver: async (id: string, receiverName: string, items?: { item_id: string; delivered_qty: number }[] | null, note?: string | null) =>
    sdkGuard(supabase.rpc('supply_request_deliver', { p_id: id, p_receiver_name: receiverName, p_items: items ?? null, p_note: note ?? null })),
  markReady: async (id: string, note?: string | null) => sdkGuard(supabase.rpc('supply_request_mark_ready', { p_id: id, p_note: note ?? null } as never)),
  cancel: async (id: string, reason: string) => sdkGuard(supabase.rpc('supply_request_cancel', { p_id: id, p_reason: reason })),
}

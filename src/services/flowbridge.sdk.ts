/**
 * SDK: FlowBridge (00037) — حالة مصمم التدفقات (portals/graph/settings)
 * القراءة/الكتابة عبر RLS مباشرة (it_admin/super_admin فقط) — لا service_role هنا.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type {
  FlowBridgeStateKey,
  FlowBridgeStateRow,
  FlowBridgeStateValueMap,
  FlowBridgeEventRow,
  FlowBridgeEventBinding,
  CreateEventBindingInput,
} from '@features/flowbridge/types'

export const flowbridge = {
  /**
   * القاعدة (Base URL) لتضمين FlowBridge الثابت مباشرة (window.FlowBridgeConfig.apiUrl):
   * الصفحة الثابتة تُلحق '/workflows/{key}' بنفسها (js/core/store.js) — لا تُلحقها هنا.
   */
  getApiUrl(): string {
    const base = import.meta.env.VITE_SUPABASE_URL as string
    return `${base}/functions/v1/flowbridge-api`
  },

  /** قراءة مفتاح واحد (portals/graph/settings) */
  async getState<K extends FlowBridgeStateKey>(key: K): Promise<FlowBridgeStateRow<K> | null> {
    const { data, error } = await supabase
      .from('flowbridge_state')
      .select('key, value, updated_by, version, updated_at')
      .eq('key', key)
      .maybeSingle()
    if (error) throw error
    return (data as FlowBridgeStateRow<K> | null) ?? null
  },

  /** كل المفاتيح الثلاثة دفعة واحدة (لإقلاع الصفحة) */
  async getAllState(): Promise<FlowBridgeStateRow[]> {
    return sdkGuard(
      supabase
        .from('flowbridge_state')
        .select('key, value, updated_by, version, updated_at'),
    ) as Promise<FlowBridgeStateRow[]>
  },

  /** حفظ مفتاح (upsert بالقيمة الكاملة — يطابق عقد REST PUT /workflows/{key}) */
  async setState<K extends FlowBridgeStateKey>(
    key: K,
    value: FlowBridgeStateValueMap[K],
  ): Promise<void> {
    const { data: userData } = await supabase.auth.getUser()
    await sdkVoid(
      supabase
        .from('flowbridge_state')
        .upsert(
          { key, value, updated_by: userData.user?.id ?? null } as never,
          { onConflict: 'key' },
        ),
    )
  },

  // ── الأحداث الحقيقية (00038) — بث حي بلا بيانات حساسة ──

  /** آخر الأحداث الحقيقية (للتعبئة الأولية قبل الاشتراك الحي) */
  async recentEvents(limit = 50): Promise<FlowBridgeEventRow[]> {
    return sdkGuard(
      supabase
        .from('flowbridge_events')
        .select('id, source, table_name, operation, provider, status, actor_role, occurred_at')
        .order('occurred_at', { ascending: false })
        .limit(limit),
    ) as Promise<FlowBridgeEventRow[]>
  },

  /** كل روابط التدفق ↔ الحدث الحقيقي */
  async listBindings(): Promise<FlowBridgeEventBinding[]> {
    return sdkGuard(
      supabase
        .from('flowbridge_event_bindings')
        .select('id, flow_id, source, match_table, match_operation, match_provider, match_status, created_at')
        .order('created_at', { ascending: false }),
    ) as Promise<FlowBridgeEventBinding[]>
  },

  /** إنشاء ربط جديد (يُستدعى من صفحة إعدادات FlowBridge) */
  async createBinding(input: CreateEventBindingInput): Promise<FlowBridgeEventBinding> {
    return sdkGuard(
      supabase
        .from('flowbridge_event_bindings')
        .insert(input as never)
        .select('id, flow_id, source, match_table, match_operation, match_provider, match_status, created_at')
        .single(),
    ) as Promise<FlowBridgeEventBinding>
  },

  async deleteBinding(id: string): Promise<void> {
    await sdkVoid(supabase.from('flowbridge_event_bindings').delete().eq('id', id))
  },
}

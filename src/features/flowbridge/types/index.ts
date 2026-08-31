/** mirror لـ 00037_flowbridge.sql — عقد REST موثّق في public/flowbridge/INTEGRATION.md */

/** بوابة قابلة للتخصيص في كتالوج FlowBridge */
export interface FlowBridgePortal {
  id: string
  label: string
  labelAr?: string
  icon?: string
  color?: string
  category?: string
  enabled?: boolean
  events?: string[]
  fields?: string[]
  endpoint?: string
  [key: string]: unknown
}

/** عقدة في مخطط التدفقات */
export interface FlowBridgeNode {
  id: string
  portalId: string
  x: number
  y: number
  [key: string]: unknown
}

/** تدفق (ربط) بين عقدتين */
export interface FlowBridgeFlow {
  id: string
  name?: string
  direction: 'forward' | 'reverse' | 'bidirectional'
  sourceId: string
  targetId: string
  isActive?: boolean
  color?: string
  triggerEvent?: string
  actionEvent?: string
  mappingRules?: Array<{ source: string; target: string }>
  conditions?: Array<{ field: string; op: string; value: string }>
  logic?: 'AND' | 'OR'
  logs?: Array<{ status: string; http?: number; ms?: number; at: number }>
  [key: string]: unknown
}

export interface FlowBridgeGraph {
  nodes: FlowBridgeNode[]
  flows: FlowBridgeFlow[]
}

export interface FlowBridgeSettings {
  autosave: boolean
  apiUrl: string
  apiToken: string
  categories: string[]
  [key: string]: unknown
}

export type FlowBridgeStateKey = 'portals' | 'graph' | 'settings'

export interface FlowBridgeStateValueMap {
  portals: FlowBridgePortal[]
  graph: FlowBridgeGraph
  settings: FlowBridgeSettings
}

/** صف خام كما يُخزَّن في public.flowbridge_state */
export interface FlowBridgeStateRow<K extends FlowBridgeStateKey = FlowBridgeStateKey> {
  key: K
  value: FlowBridgeStateValueMap[K]
  updated_by: string | null
  version: number
  updated_at: string
}

/** صف خام من public.flowbridge_events (00038) — حدث ضيّق بلا بيانات حساسة */
export interface FlowBridgeEventRow {
  id: number
  source: 'audit' | 'integration'
  table_name: string | null
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | null
  provider: string | null
  status: 'success' | 'error' | 'rejected' | null
  actor_role: string | null
  occurred_at: string
}

/** ربط تدفق حقيقي في المخطط بحدث حقيقي (00038) */
export interface FlowBridgeEventBinding {
  id: string
  flow_id: string
  source: 'audit' | 'integration'
  match_table: string | null
  match_operation: 'INSERT' | 'UPDATE' | 'DELETE' | null
  match_provider: string | null
  match_status: 'success' | 'error' | 'rejected' | null
  created_at: string
}

export type CreateEventBindingInput =
  | { flow_id: string; source: 'audit'; match_table: string; match_operation?: 'INSERT' | 'UPDATE' | 'DELETE' }
  | { flow_id: string; source: 'integration'; match_provider: string; match_status?: 'success' | 'error' | 'rejected' }

/** حدث حي جاهز للبث إلى engine.pulse(flowId, status, payload) — بعد المطابقة بالربط */
export interface FlowBridgeLiveEvent {
  flowId: string
  status: 'success' | 'failed' | 'skipped'
  at: string
  source: 'audit' | 'integration'
}

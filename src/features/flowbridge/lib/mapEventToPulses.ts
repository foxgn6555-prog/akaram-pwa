/**
 * يحوّل حدثاً حقيقياً واحداً (flowbridge_events) إلى قائمة نبضات (pulse)
 * تُبَث على تدفقات المخطط المطابقة عبر روابط IT (flowbridge_event_bindings).
 * دالة نقية بلا شبكة — قابلة للاختبار مباشرة.
 */
import type {
  FlowBridgeEventBinding,
  FlowBridgeEventRow,
  FlowBridgeLiveEvent,
} from '../types'

function statusFromEvent(event: FlowBridgeEventRow): FlowBridgeLiveEvent['status'] {
  if (event.source === 'integration') {
    if (event.status === 'error') return 'failed'
    if (event.status === 'rejected') return 'skipped'
    return 'success'
  }
  // audit: كل عملية DB ناجحة بحكم وصولها لـ audit_logs (INSERT/UPDATE/DELETE)
  return 'success'
}

function matches(binding: FlowBridgeEventBinding, event: FlowBridgeEventRow): boolean {
  if (binding.source !== event.source) return false
  if (event.source === 'audit') {
    if (binding.match_table !== event.table_name) return false
    if (binding.match_operation && binding.match_operation !== event.operation) return false
    return true
  }
  // integration
  if (binding.match_provider !== event.provider) return false
  if (binding.match_status && binding.match_status !== event.status) return false
  return true
}

export function mapEventToPulses(
  event: FlowBridgeEventRow,
  bindings: FlowBridgeEventBinding[],
): FlowBridgeLiveEvent[] {
  const status = statusFromEvent(event)
  return bindings
    .filter((b) => matches(b, event))
    .map((b) => ({
      flowId: b.flow_id,
      status,
      at: event.occurred_at,
      source: event.source,
    }))
}

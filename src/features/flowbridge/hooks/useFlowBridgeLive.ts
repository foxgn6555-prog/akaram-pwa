/**
 * بث حي حقيقي لمصمم التدفقات: يشترك في public.flowbridge_events (00038)
 * عبر Realtime، ثم يطابقها بروابط IT (flowbridge_event_bindings) ويحوّلها
 * إلى نبضات (pulse) تُرسَل لمُستدعي الـ hook (عادة: engine.pulse عبر الجسر).
 * لا بيانات وهمية — كل نبضة أصلها عملية حقيقية في قاعدة البيانات.
 */
import { useEffect, useRef } from 'react'
import { subscriptionManager } from '@lib/realtime/subscription-manager'
import { CHANNELS } from '@lib/realtime/channels.constants'
import { mapEventToPulses } from '../lib/mapEventToPulses'
import { logger } from '@lib/monitoring/logger'
import { useFlowBridgeBindings } from './useFlowBridgeBindings'
import type { FlowBridgeEventRow, FlowBridgeLiveEvent } from '../types'

/**
 * يشترك في الأحداث الحقيقية الحية ويستدعي onPulse لكل نبضة مطابقة.
 * onPulse يُفترض أن يستدعي engine.pulse(flowId, status) في FlowBridge.
 */
export function useFlowBridgeLive(onPulse: (event: FlowBridgeLiveEvent) => void): void {
  const { data: bindings } = useFlowBridgeBindings()
  const bindingsRef = useRef(bindings)
  const onPulseRef = useRef(onPulse)
  bindingsRef.current = bindings
  onPulseRef.current = onPulse

  useEffect(() => {
    const unsubscribe = subscriptionManager.subscribe(CHANNELS.flowbridgeLive(), (channel) =>
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'flowbridge_events' },
        (payload) => {
          const row = payload.new as unknown as FlowBridgeEventRow
          const currentBindings = bindingsRef.current ?? []
          const pulses = mapEventToPulses(row, currentBindings)
          for (const pulse of pulses) onPulseRef.current(pulse)
        },
      ),
    )

    return () => {
      try {
        unsubscribe()
      } catch (error) {
        logger.warn('flowbridge live unsubscribe failed', { error })
      }
    }
  }, [])
}

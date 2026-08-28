/** SDK القياسات الحية (00030) — latency + history */
import { sdkGuard, sdkVoid, supabase } from './client'

export const metrics = {
  /** تسجيل قياس latency جديد */
  async sampleLatency(ms: number): Promise<void> {
    await sdkVoid(supabase.rpc('connection_sample', { p_latency_ms: Math.round(ms) }))
  },

  /** تاريخ القياسات لآخر ساعتين */
  async connectionHistory(): Promise<Array<{ at: string; ms: number }>> {
    return sdkGuard(supabase.rpc('connection_history')) as Promise<Array<{ at: string; ms: number }>>
  },

  /** قياس فعلي فوري: زمن استجابة REST */
  async measureLatency(): Promise<number> {
    const start = performance.now()
    await supabase.from('branches').select('id').limit(1)
    return Math.round(performance.now() - start)
  },
}

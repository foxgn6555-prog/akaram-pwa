/** هوك مشاركة الموقع المباشر (00286) — يُستخدم في بوابتي مسؤول القسم والمتعهد */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { liveTracking, type LivePingResult } from '@sdk/live-tracking.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
import { denyReasonOf, getFix, nextPingDelayMs, readFlag, shouldPingNow, writeFlag } from './live-share.logic'
import { DevicePermissionError } from '@lib/device-permissions'

export const LIVE_STATUS_KEY = ['live-tracking', 'status']
const storage = () => (typeof localStorage === 'undefined' ? null : localStorage)

export function useLiveShare() {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.addToast)
  const status = useQuery({ queryKey: LIVE_STATUS_KEY, queryFn: () => liveTracking.status(), refetchInterval: 60_000 })
  const [enabled, setEnabled] = useState<boolean>(() => readFlag(storage()))
  const [busy, setBusy] = useState(false)
  const [lastPing, setLastPing] = useState<LivePingResult | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  /** خطأ إذن الجهاز (موقع مرفوض/اتصال غير آمن…) — تعرضه لوحة الأذونات بخطوات الحل */
  const [permError, setPermError] = useState<DevicePermissionError | null>(null)
  const lastAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const s = status.data

  const stopLocal = useCallback((reason?: string) => {
    setEnabled(false); writeFlag(storage(), false)
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (reason) setLastError(reason)
  }, [])

  /** نبضة واحدة: موقع ⇒ خادم. الرفض من الخادم يوقف المشاركة. */
  const pingOnce = useCallback(async (): Promise<boolean> => {
    setBusy(true)
    try {
      const fix = await getFix()
      const r = await liveTracking.ping(fix)
      lastAtRef.current = Date.now(); setLastPing(r); setLastError(null); setPermError(null)
      void qc.invalidateQueries({ queryKey: LIVE_STATUS_KEY })
      return true
    } catch (e) {
      const deny = denyReasonOf(e)
      if (deny) { stopLocal(handleAppError(e, { scope: 'live-share' }).message); void qc.invalidateQueries({ queryKey: LIVE_STATUS_KEY }); return false }
      if (e instanceof DevicePermissionError) { setPermError(e); if (e.code === 'DENIED' || e.code === 'INSECURE' || e.code === 'UNSUPPORTED') stopLocal() }
      setLastError(e instanceof Error ? e.message : 'تعذّر إرسال الموقع')
      return false
    } finally { setBusy(false) }
  }, [qc, stopLocal])

  /** زر «مشاركة موقعي المباشر» — ضغطة واحدة يومياً تكفي؛ الضغط مجدداً يعيد الإرسال فقط */
  const start = useCallback(async () => {
    const ok = await pingOnce()
    if (ok) { setEnabled(true); writeFlag(storage(), true); toast({ type: 'success', message: 'تم مشاركة موقعك بنجاح — يتحدث تلقائياً أثناء شفتك ويتوقف بنهايته' }) }
  }, [pingOnce, toast])

  const stop = useCallback(async () => {
    stopLocal()
    try { await liveTracking.stop() } catch { /* الجلسة قد تكون منتهية أصلاً */ }
    void qc.invalidateQueries({ queryKey: LIVE_STATUS_KEY })
    toast({ type: 'info', message: 'أوقفت مشاركة الموقع' })
  }, [qc, stopLocal, toast])

  // جدولة النبضة التالية (والتطبيق مفتوح)
  useEffect(() => {
    if (!enabled || !s) return
    if (!s.allowed) { if (s.reason === 'LIVE_OUTSIDE_SHIFT') stopLocal(); return }
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      const delay = nextPingDelayMs(lastAtRef.current, s.interval_minutes, s.shift_end, Date.now())
      timerRef.current = setTimeout(() => { void pingOnce().then(() => schedule()) }, Math.max(1000, delay))
    }
    schedule()
    const onVisible = () => { if (document.visibilityState === 'visible' && shouldPingNow(lastAtRef.current, s.interval_minutes, Date.now())) void pingOnce().then(() => schedule()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { if (timerRef.current) clearTimeout(timerRef.current); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, s, pingOnce, stopLocal])

  return { status, enabled, busy, lastPing, lastError, permError, start, stop, pingNow: pingOnce }
}

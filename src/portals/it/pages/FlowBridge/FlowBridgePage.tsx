/**
 * بوابة التطوير المركزية — وحدة «مصمم التدفقات» (FlowBridge):
 * منصة الربط البصرية مضمّنة داخل الصفحة عبر iframe (عزل كامل — لا تعارض CSS/JS).
 * التطبيق الثابت يُخدَّم من /flowbridge/ (public) ويُحمَّل مع بناء PWA.
 * رابط الوثيقة: public/flowbridge/INTEGRATION.md
 *
 * ربط حقيقي (لا بيانات وهمية):
 *  · التخزين: Edge Function flowbridge-api ← RLS ← public.flowbridge_state (00037)
 *    يُمرَّر عبر ?api=/functions/v1/flowbridge-api&token=<JWT الحالي>
 *  · الرمز يتحدّث حياً عبر postMessage (fb:auth) عند كل تجديد جلسة — بلا إعادة تحميل iframe
 *  · الأحداث الحية: بث حقيقي (audit_logs/integration_logs → flowbridge_events → روابط IT)
 *    يصل كنبضة postMessage (fb:pulse) تُحرَّك على المخطط عبر engine.pulse()
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@components/ui/Icon/Icon'
import { useUiStore } from '@stores/ui.store'
import { flowbridge } from '@sdk/flowbridge.sdk'
import { useSyncFlowbridgeSystem } from '@features/flowbridge'
import { useFlowBridgeAccessToken } from '@features/flowbridge/hooks/useFlowBridgeAccessToken'
import { useFlowBridgeLive } from '@features/flowbridge/hooks/useFlowBridgeLive'
import type { FlowBridgeLiveEvent } from '@features/flowbridge/types'
import { FlowBridgeBindingsPanel } from './FlowBridgeBindingsPanel'

/** تقرير حالة يرسله الـ iframe بعد الإقلاع (fb:state) — اتصال + أعداد حقيقية */
interface FlowBridgeFrameStatus {
  api: boolean
  apiOk: boolean
  portals: number
  nodes: number
  flows: number
}

export default function FlowBridgePage() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const setContentFullBleed = useUiStore((s) => s.setContentFullBleed)
  const token = useFlowBridgeAccessToken()
  const sync = useSyncFlowbridgeSystem()
  const [frameReady, setFrameReady] = useState(false)
  const [status, setStatus] = useState<FlowBridgeFrameStatus | null>(null)
  const [bindingsOpen, setBindingsOpen] = useState(false)

  // ملء الشاشة الكامل طوال بقاء الصفحة — إلغاء عند مغادرتها (لا يؤثر على بقية البوابة)
  useEffect(() => {
    setContentFullBleed(true)
    return () => setContentFullBleed(false)
  }, [setContentFullBleed])

  const embedUrl = useMemo(() => {
    const url = new URL('/flowbridge/page.html', window.location.origin)
    url.searchParams.set('api', flowbridge.getApiUrl())
    if (token) url.searchParams.set('token', token)
    return url.pathname + url.search
  }, [token])

  const reload = useCallback(() => {
    setFrameReady(false)
    if (frameRef.current) frameRef.current.src = embedUrl
  }, [embedUrl])

  // مزامنة بوابات المنظومة الحقيقية ثم إعادة تحميل المصمم ليرى الكتالوج والمخطط فوراً
  const handleSync = useCallback(async () => {
    await sync.mutateAsync()
    reload()
  }, [sync, reload])

  // استقبال جاهزية الإطار + تقرير الحالة + إرسال تحديثات التوكن الحية (بلا إعادة تحميل)
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== frameRef.current?.contentWindow) return
      if (ev.data?.type === 'fb:ready') setFrameReady(true)
      if (ev.data?.type === 'fb:state') setStatus(ev.data as FlowBridgeFrameStatus)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!frameReady || !token || !frameRef.current?.contentWindow) return
    frameRef.current.contentWindow.postMessage({ type: 'fb:auth', token }, window.location.origin)
  }, [frameReady, token])

  // بث الأحداث الحقيقية الحية إلى المخطط (RLS + روابط IT فقط — لا محاكاة)
  const handlePulse = useCallback((event: FlowBridgeLiveEvent) => {
    frameRef.current?.contentWindow?.postMessage(
      { type: 'fb:pulse', flowId: event.flowId, status: event.status },
      window.location.origin,
    )
  }, [])
  useFlowBridgeLive(handlePulse)

  return (
    <section aria-labelledby="flowbridge-title" className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="flowbridge-title" className="flex items-center gap-2 text-lg font-bold">
            <Icon name="flow" size={20} className="text-brand-600" />
            مصمم التدفقات — FlowBridge
          </h1>
          <p className="text-sm text-slate-500">
            محرك التدفقات البصرية: بوابات · عقد · ربط · سجل حي · تصدير/استيراد — متصل بقاعدة بياناتك الحقيقية
          </p>
          {status && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" data-testid="fb-status">
              {status.api && status.apiOk ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  متصل بالخادم · {status.portals} بوابة · {status.nodes} عقدة · {status.flows} تدفق
                </span>
              ) : status.api ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 font-bold text-red-700">
                  <span className="size-1.5 rounded-full bg-red-500" />
                  تعذّر الوصول لخادم الحالة (flowbridge-api) — تحقق من نشر الدالة
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 font-bold text-amber-700">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  المصمم يعمل محلياً — بلا اتصال بالخادم
                </span>
              )}
              {status.api && status.apiOk && status.portals === 0 && (
                <span className="text-slate-500">
                  — اضغط «مزامنة بوابات المنظومة» لجلب بوابات المشروع الحقيقية
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSync()}
            disabled={sync.isPending}
            data-testid="fb-sync-system"
            className="flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          >
            <Icon name="database" size={14} className={sync.isPending ? 'animate-pulse' : ''} />
            {sync.isPending ? 'جارٍ المزامنة…' : 'مزامنة بوابات المنظومة'}
          </button>
          <button
            onClick={() => setBindingsOpen((v) => !v)}
            data-testid="fb-toggle-bindings"
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Icon name="activity" size={14} />
            ربط الأحداث الحقيقية
          </button>
          <button
            onClick={reload}
            data-testid="fb-reload"
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Icon name="refresh" size={14} />
            إعادة تحميل
          </button>
        </div>
      </div>

      {bindingsOpen && <FlowBridgeBindingsPanel />}

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          ref={frameRef}
          src={embedUrl}
          title="FlowBridge — مصمم التدفقات"
          data-testid="fb-embed"
          className="h-full w-full"
          frameBorder={0}
        />
      </div>
    </section>
  )
}

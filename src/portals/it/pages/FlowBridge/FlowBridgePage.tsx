/**
 * بوابة التطوير المركزية — وحدة «مصمم التدفقات» (FlowBridge):
 * منصة الربط البصرية مضمّنة داخل الصفحة عبر iframe (عزل كامل — لا تعارض CSS/JS).
 * التطبيق الثابت يُخدَّم من /flowbridge/ (public) ويُحمَّل مع بناء PWA.
 * رابط الوثيقة: public/flowbridge/INTEGRATION.md
 */
import { useCallback, useRef } from 'react'
import { Icon } from '@components/ui/Icon/Icon'

const EMBED_URL = '/flowbridge/index.html'

export default function FlowBridgePage() {
  const frameRef = useRef<HTMLIFrameElement>(null)

  // إعادة التحميل — تنظيف أي حالة ضائعة في التضمين
  const reload = useCallback(() => {
    if (frameRef.current) frameRef.current.src = EMBED_URL
  }, [])

  return (
    <section aria-labelledby="flowbridge-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="flowbridge-title" className="flex items-center gap-2 text-lg font-bold">
            <Icon name="flow" size={20} className="text-brand-600" />
            مصمم التدفقات — FlowBridge
          </h1>
          <p className="text-sm text-slate-500">
            محرك التدفقات البصرية: بوابات · عقد · ربط · سجل حي · تصدير/استيراد — يُحفظ محلياً في متصفحك
          </p>
        </div>
        <button
          onClick={reload}
          data-testid="fb-reload"
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Icon name="refresh" size={14} />
          إعادة تحميل
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          ref={frameRef}
          src={EMBED_URL}
          title="FlowBridge — مصمم التدفقات"
          data-testid="fb-embed"
          className="h-[calc(100dvh-12rem)] min-h-[540px] w-full"
          frameBorder={0}
        />
      </div>
    </section>
  )
}
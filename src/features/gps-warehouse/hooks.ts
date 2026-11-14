/** 00380 — خطافات مستودع GPS */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gpsWarehouse, type GpsWarehouseAction } from '@sdk/gps-warehouse.sdk'
import { useUiStore } from '@stores/ui.store'
import { lvnErrorToast } from '@features/gps-lvn/lvn-errors'

export const gpsWarehouseKeys = { link: ['gps-warehouse', 'link'] as const }
export const useGpsWarehouseLink = () => useQuery({ queryKey: gpsWarehouseKeys.link, queryFn: gpsWarehouse.link, refetchInterval: 30_000 })
export function useGpsWarehouseAction() {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ action, month, limit, radius_m }: { action: GpsWarehouseAction; month?: string; limit?: number; radius_m?: number }) => gpsWarehouse.run(action, { month, limit, radius_m }),
    onSettled: () => void qc.invalidateQueries({ queryKey: gpsWarehouseKeys.link }),
    onSuccess: (r) => {
      const msg = r.action === 'ping' ? `المستودع متصل · إصدار ${r.ping?.schema_version ?? '?'} · ${r.ping?.vehicles ?? 0} آلية`
        : r.action === 'sync_registry' ? `أُرسل سجل الآليات: ${r.sent ?? 0} آلية (نشطة في المستودع ${String(r.result?.active ?? 0)})`
        : r.action === 'enqueue_month' ? `جُدول الشهر: ${String(r.result?.queued ?? 0)} مهمة جديدة من ${String(r.result?.total ?? 0)}`
        : r.action === 'pull' ? (r.skipped === 'paused' ? 'السحب متوقف مؤقتاً — اضغط «استئناف»' : r.skipped === 'locked' ? 'دورة سحب أخرى تعمل الآن — انتظر دقيقة' : `دفعة سحب: ${r.jobs ?? 0} مهمة · ${(r.results ?? []).filter((x) => !x.error && !x.partial).length} اكتملت · ${(r.results ?? []).filter((x) => x.error).length} فشلت`)
        : r.action === 'sync_hotspots' && (r.skipped_empty_months?.length ?? 0) > 0 ? `نُسخت البقع: ${(r.rows ?? 0).toLocaleString('en')} بقعة · تُخطّي ${r.skipped_empty_months!.join('، ')} (قيد إعادة التجميع بعد تغيير نصف القطر)`
        : r.action === 'sync_hotspots' ? `نُسخت البقع: ${(r.rows ?? 0).toLocaleString('en')} بقعة${r.pending ? ` · ${r.pending} بانتظار التجميع في الدورة التالية` : ''}`
        : r.action === 'rebuild_hotspots' ? 'أُعيد بناء بقع الشهر — ستُجمَّع من جديد مع دورة الصيانة'
        : r.action === 'hotspots_status' ? (r.result?.ready_to_copy
            ? `إعادة التجميع اكتملت (نصف القطر ${String(r.result?.radius_m ?? '?')} م) — اضغط «نسخ البقع الآن»`
            : `قيد التجميع: ${Number(r.result?.stops_pending ?? 0).toLocaleString('en')} توقف بانتظار الإسناد · ${Number(r.result?.hotspots_dirty ?? 0).toLocaleString('en')} بقعة تُعاد حسابها`)
        : r.action === 'set_hotspot_radius' ? `نصف القطر الآن ${String(r.result?.radius_m ?? '?')} م (كان ${String(r.result?.old_radius_m ?? '?')} م) — تُعاد بنية بقع ${r.months?.join('، ') ?? 'الأشهر'} وتُجمَّع تلقائياً؛ اتركه حتى ينتهي ثم «نسخ البقع الآن»`
        : r.action === 'retry_failed' ? `أُعيدت ${String(r.result?.requeued ?? 0)} مهمة فاشلة إلى الطابور — ستُسحب مع الدورات التالية`
        : r.action === 'pause' ? 'أُوقف السحب مؤقتاً' : 'استُؤنف السحب'
      toast({ type: 'success', message: msg })
    },
    onError: (e) => toast({ type: 'error', message: lvnErrorToast((e as { code?: string }).code ?? (e as Error).message) }),
  })
}

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
    mutationFn: ({ action, month }: { action: GpsWarehouseAction; month?: string }) => gpsWarehouse.run(action, { month }),
    onSettled: () => void qc.invalidateQueries({ queryKey: gpsWarehouseKeys.link }),
    onSuccess: (r) => {
      const msg = r.action === 'ping' ? `المستودع متصل · إصدار ${r.ping?.schema_version ?? '?'} · ${r.ping?.vehicles ?? 0} آلية`
        : r.action === 'sync_registry' ? `أُرسل سجل الآليات: ${r.sent ?? 0} آلية (نشطة في المستودع ${String(r.result?.active ?? 0)})`
        : `جُدول الشهر: ${String(r.result?.queued ?? 0)} مهمة جديدة من ${String(r.result?.total ?? 0)}`
      toast({ type: 'success', message: msg })
    },
    onError: (e) => toast({ type: 'error', message: lvnErrorToast((e as { code?: string }).code ?? (e as Error).message) }),
  })
}

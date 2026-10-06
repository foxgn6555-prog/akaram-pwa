/** هوكات وحدة الكشوفات (00170) — غرفة العمليات / المعاون / المدير المفوض / IT */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { disclosuresUnit, disclosureErrorMessage, type DisclosureInput, type DisclosureListFilter, type PenaltyKey } from '@sdk/disclosures-unit.sdk'
import { useUiStore } from '@stores/ui.store'

export const unitKeys = {
  all: ['disclosures-unit'] as const,
  types: () => [...unitKeys.all, 'types'] as const,
  list: (f: DisclosureListFilter) => [...unitKeys.all, 'list', f] as const,
  detail: (id: string) => [...unitKeys.all, 'detail', id] as const,
  inbox: () => [...unitKeys.all, 'inbox'] as const,
  stats: (m: string | null) => [...unitKeys.all, 'stats', m ?? ''] as const,
  vehicles: (q: string) => [...unitKeys.all, 'vehicles', q] as const,
  employees: (q: string) => [...unitKeys.all, 'employees', q] as const,
  hidden: (u: string, p: string) => ['hidden-units', u, p] as const,
  myHidden: () => ['hidden-units', 'me'] as const,
}
function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return { ok: (message: string) => addToast({ type: 'success', message }), err: (e: unknown) => addToast({ type: 'error', message: disclosureErrorMessage(e) }) }
}
function useInvalidate() { const qc = useQueryClient(); return () => { void qc.invalidateQueries({ queryKey: unitKeys.all }) } }

export function useDisclosureTypes() { return useQuery({ queryKey: unitKeys.types(), queryFn: disclosuresUnit.types, staleTime: 5 * 60_000 }) }
export function useSaveDisclosureType() {
  const inv = useInvalidate(); const t = useToast()
  return useMutation({ mutationFn: (v: { key: string; label: string; description?: string | null; allowed_penalties: PenaltyKey[]; default_amount?: number | null; is_active: boolean; sort_order: number; min_amount?: number | null; max_amount?: number | null }) => disclosuresUnit.saveType(v), onSuccess: () => { inv(); t.ok('حُفظ نوع الكشف') }, onError: t.err })
}
export function useVehicleLookup(q: string, enabled = true) { return useQuery({ queryKey: unitKeys.vehicles(q), queryFn: () => disclosuresUnit.vehicles(q), enabled, staleTime: 60_000 }) }
export function useEmployeeLookup(q: string, enabled = true) { return useQuery({ queryKey: unitKeys.employees(q), queryFn: () => disclosuresUnit.employees(q), enabled, staleTime: 60_000 }) }
export function useDisclosuresList(f: DisclosureListFilter, refetchInterval: number | false = 20_000) {
  return useQuery({ queryKey: unitKeys.list(f), queryFn: () => disclosuresUnit.list(f), refetchInterval })
}
export function useDisclosureDetail(id: string | null) { return useQuery({ queryKey: unitKeys.detail(id ?? ''), queryFn: () => disclosuresUnit.get(id as string), enabled: !!id }) }
export function useDisclosureInbox(enabled = true) { return useQuery({ queryKey: unitKeys.inbox(), queryFn: disclosuresUnit.inbox, enabled, refetchInterval: enabled ? 15_000 : false }) }
export function useDisclosureStats(month: string | null) { return useQuery({ queryKey: unitKeys.stats(month), queryFn: () => disclosuresUnit.stats(month), refetchInterval: 30_000 }) }

export function useDisclosureActions() {
  const inv = useInvalidate(); const t = useToast()
  const save = useMutation({ mutationFn: (v: { id: string | null; input: DisclosureInput }) => disclosuresUnit.save(v.id, v.input), onSuccess: (_d, v) => { inv(); t.ok(v.id ? 'حُفظت تعديلات الكشف' : 'أُنشئ الكشف كمسودة') }, onError: t.err })
  const submit = useMutation({ mutationFn: (id: string) => disclosuresUnit.submit(id), onSuccess: (d) => { inv(); t.ok(`رُفع الكشف ${d.ref_no ?? ''} إلى ${d.current_step ?? 'الموافقة'}`) }, onError: t.err })
  const decide = useMutation({ mutationFn: (v: { id: string; approve: boolean; note?: string | null; amount?: number | null }) => disclosuresUnit.decide(v.id, v.approve, v.note, v.amount),
    onSuccess: (d) => { inv(); t.ok(d.status === 'approved' ? `اعتُمد الكشف ${d.ref_no ?? ''}${d.deduction_posted ? ' وأُضيف الاستقطاع للحضورية' : ''}` : d.status === 'returned' ? 'أُعيد الكشف إلى غرفة العمليات' : 'سُجّلت موافقتك — انتقل للخطوة التالية') }, onError: t.err })
  const cancel = useMutation({ mutationFn: (v: { id: string; reason: string }) => disclosuresUnit.cancel(v.id, v.reason), onSuccess: () => { inv(); t.ok('أُلغي الكشف وبُلّغ المدير المفوض') }, onError: t.err })
  return { save, submit, decide, cancel }
}

// ─── إخفاء وحدات بوابة لحساب ───
export function useHiddenUnits(userId: string | null, portal: string) {
  return useQuery({ queryKey: unitKeys.hidden(userId ?? '', portal), queryFn: () => disclosuresUnit.hiddenUnitsGet(userId as string, portal), enabled: !!userId })
}
export function useSetHiddenUnits() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({ mutationFn: (v: { userId: string; portal: string; paths: string[] }) => disclosuresUnit.hiddenUnitsSet(v.userId, v.portal, v.paths),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hidden-units'] }); t.ok('حُفظت وحدات الحساب الظاهرة') }, onError: t.err })
}
/** وحداتي المخفية لكل بوابة — تُحمَّل مرة وتُخزَّن (تُستخدم في الشريط الجانبي والقائمة السفلية) */
export function useMyHiddenUnits(enabled = true) {
  return useQuery({ queryKey: unitKeys.myHidden(), queryFn: disclosuresUnit.myHiddenUnits, enabled, staleTime: 5 * 60_000, retry: false })
}

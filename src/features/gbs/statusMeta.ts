/** دلالات حالات حاويات GBS — الألوان والأسماء العربية (عقد 00136) */
import type { GbsContainerStatus, GbsUpdateState } from './types'

export const GBS_STATUS_META: Record<
  GbsContainerStatus,
  { label: string; color: string; chip: string }
> = {
  ok: { label: 'سليمة', color: '#16a34a', chip: 'bg-emerald-100 text-emerald-800' },
  damaged: { label: 'متضررة', color: '#eab308', chip: 'bg-yellow-100 text-yellow-800' },
  replace: { label: 'يجب استبدالها', color: '#dc2626', chip: 'bg-rose-100 text-rose-800' },
  missing: { label: 'مفقودة', color: '#64748b', chip: 'bg-slate-200 text-slate-700' },
}

export const GBS_STATUS_ORDER: GbsContainerStatus[] = ['ok', 'damaged', 'replace', 'missing']

export const GBS_UPDATE_STATE_META: Record<GbsUpdateState, { label: string; chip: string }> = {
  pending: { label: 'قيد الانتظار', chip: 'bg-amber-100 text-amber-800' },
  approved: { label: 'معتمد', chip: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'مرفوض', chip: 'bg-rose-100 text-rose-800' },
}

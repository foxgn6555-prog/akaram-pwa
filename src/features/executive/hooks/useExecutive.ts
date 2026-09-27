/** خطافات الإدارة العليا: الملخص (الحالي + السابق للمقارنة) · الفلاتر · التبليغات */
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { executiveKeys } from '@lib/query-keys/executive.keys'
import { notificationsKeys } from '@lib/query-keys/notifications.keys'
import { executive, execErrorMessage } from '@sdk/executive.sdk'
import { useUiStore } from '@stores/ui.store'
import type { AnnouncementInput, ExecFilters } from '../types'
import { previousRange } from '../lib/period'

function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return { ok: (message: string) => addToast({ type: 'success', message }), err: (e: unknown) => addToast({ type: 'error', message: execErrorMessage(e) }) }
}

/** الملخص للفترة المطلوبة + الفترة السابقة المكافئة (طلبان متوازيان) */
export function useExecOverview(f: Pick<ExecFilters, 'from' | 'to' | 'sector' | 'shift'>, withPrevious = true) {
  const prev = previousRange(f.from, f.to)
  const [cur, prv] = useQueries({
    queries: [
      { queryKey: executiveKeys.overview(f), queryFn: () => executive.overview(f.from, f.to, f.sector, f.shift), staleTime: 60_000 },
      { queryKey: executiveKeys.overview({ ...f, ...prev }), queryFn: () => executive.overview(prev.from, prev.to, f.sector, f.shift), staleTime: 60_000, enabled: withPrevious },
    ],
  })
  return { data: cur.data ?? null, previous: prv.data ?? null, isLoading: cur.isLoading, error: cur.error, refetch: () => { void cur.refetch(); void prv.refetch() }, isFetching: cur.isFetching || prv.isFetching }
}

export function useExecFilterOptions() {
  return useQuery({ queryKey: executiveKeys.filterOptions(), queryFn: executive.filterOptions, staleTime: 10 * 60_000 })
}

// ── التبليغات ──
export function useAnnouncementFeed(scope: 'inbox' | 'sent', includeArchived = false) {
  return useQuery({ queryKey: executiveKeys.feed(scope, includeArchived), queryFn: () => executive.feed(scope, includeArchived), staleTime: 30_000, refetchInterval: 60_000 })
}
export function useAnnouncement(id: string | null) {
  return useQuery({ queryKey: executiveKeys.announcement(id ?? ''), queryFn: () => executive.get(id!), enabled: !!id })
}
export function useAnnouncementRecipients(id: string | null) {
  return useQuery({ queryKey: executiveKeys.recipients(id ?? ''), queryFn: () => executive.recipients(id!), enabled: !!id })
}
export function useAnnouncementTargets(enabled = true) {
  return useQuery({ queryKey: executiveKeys.targets(), queryFn: executive.targets, staleTime: 5 * 60_000, enabled })
}
export function useAnnouncementUnread() {
  return useQuery({ queryKey: executiveKeys.unread(), queryFn: executive.unreadCount, staleTime: 30_000, refetchInterval: 60_000 })
}
export function usePublishAnnouncement() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (v: AnnouncementInput) => executive.publish(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: executiveKeys.all }); void qc.invalidateQueries({ queryKey: notificationsKeys.all }); t.ok('نُشر التبليغ ووصل الإشعار للمستهدفين') },
    onError: t.err,
  })
}
export function useAckAnnouncement() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: (id: string) => executive.ack(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: executiveKeys.all }); t.ok('تم تسجيل إقرارك بالاطلاع') },
    onError: t.err,
  })
}
export function useArchiveAnnouncement() {
  const qc = useQueryClient(); const t = useToast()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => executive.archive(id, reason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: executiveKeys.all }); t.ok('أُرشف التبليغ') },
    onError: t.err,
  })
}

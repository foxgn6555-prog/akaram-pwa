/** خطافات استقبال شكاوى المواطنين والدعم المباشر (00168) — المواطن (anon) + غرفة العمليات + مسؤول القسم + التقارير */
import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { citizen, citizenErrorMessage, CITIZEN_SESSION_KEY, type CitizenSession, type CitizenStatus } from '@sdk/citizen.sdk'
import { useUiStore } from '@stores/ui.store'

export * from '@sdk/citizen.sdk'

export const citizenKeys = {
  all: ['citizen'] as const,
  info: () => [...citizenKeys.all, 'info'] as const,
  mine: (token: string) => [...citizenKeys.all, 'mine', token] as const,
  chat: (token: string) => [...citizenKeys.all, 'chat', token] as const,
  chatDays: () => [...citizenKeys.all, 'chat-days'] as const,
  chatDay: (day: string) => [...citizenKeys.all, 'chat-day', day] as const,
  opsList: (f: unknown) => [...citizenKeys.all, 'ops-list', f] as const,
  managers: () => [...citizenKeys.all, 'managers'] as const,
  queue: () => [...citizenKeys.all, 'queue'] as const,
  session: (id: string) => [...citizenKeys.all, 'session', id] as const,
  photos: (paths: string[]) => [...citizenKeys.all, 'photos', paths] as const,
  assigned: () => [...citizenKeys.all, 'assigned'] as const,
  report: (from: string, to: string) => [...citizenKeys.all, 'report', from, to] as const,
}

function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return { ok: (message: string) => addToast({ type: 'success', message }), err: (e: unknown) => addToast({ type: 'error', message: citizenErrorMessage(e) }) }
}

// ─────────── جلسة المواطن (localStorage) ───────────
export function readCitizenSession(): CitizenSession | null {
  try { const raw = localStorage.getItem(CITIZEN_SESSION_KEY); return raw ? (JSON.parse(raw) as CitizenSession) : null } catch { return null }
}
export function useCitizenSession() {
  const [session, setSession] = useState<CitizenSession | null>(() => readCitizenSession())
  const save = useCallback((s: CitizenSession | null) => {
    setSession(s)
    try { if (s) localStorage.setItem(CITIZEN_SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(CITIZEN_SESSION_KEY) } catch { /* خاص/ممتلئ */ }
  }, [])
  return { session, save }
}

export function useCitizenInfo() { return useQuery({ queryKey: citizenKeys.info(), queryFn: citizen.info, staleTime: 60_000 }) }
export function useMyComplaints(token: string | null) {
  return useQuery({ queryKey: citizenKeys.mine(token ?? ''), queryFn: () => citizen.myComplaints(token as string), enabled: !!token, refetchInterval: 20_000 })
}
/** حالة المحادثة من جهة المواطن — استطلاع كل 3 ثوانٍ (لا realtime للمجهولين) */
export function useCitizenChat(token: string | null, active: boolean) {
  return useQuery({ queryKey: citizenKeys.chat(token ?? ''), queryFn: () => citizen.chatState(token as string, 0), enabled: !!token && active, refetchInterval: active ? 3000 : false })
}

// ─────────── غرفة العمليات ───────────
export function useOpsCitizenComplaints(f: { status?: CitizenStatus | null; search?: string | null; from?: string | null; to?: string | null }) {
  return useQuery({ queryKey: citizenKeys.opsList(f), queryFn: () => citizen.opsList(f), refetchInterval: 15_000 })
}
export function useCitizenManagers() { return useQuery({ queryKey: citizenKeys.managers(), queryFn: citizen.opsManagers, staleTime: 300_000 }) }
export function useCitizenPhotoUrls(paths: string[]) {
  return useQuery({ queryKey: citizenKeys.photos(paths), queryFn: () => citizen.photoUrls(paths), enabled: paths.length > 0, staleTime: 20 * 60_000 })
}
function useInvalidateCitizen() {
  const qc = useQueryClient()
  return () => { void qc.invalidateQueries({ queryKey: citizenKeys.all }) }
}
export function useAssignCitizenComplaint() {
  const inv = useInvalidateCitizen(); const t = useToast()
  return useMutation({
    mutationFn: (v: { id: string; userId: string; note?: string }) => citizen.opsAssign(v.id, v.userId, v.note),
    onSuccess: () => { inv(); t.ok('أُسندت الشكوى وأصبحت قيد المعالجة وأُشعر مسؤول القسم') }, onError: t.err,
  })
}
export function useSetCitizenStatus() {
  const inv = useInvalidateCitizen(); const t = useToast()
  return useMutation({
    mutationFn: (v: { id: string; status: CitizenStatus; note?: string }) => citizen.setStatus(v.id, v.status, v.note),
    onSuccess: () => { inv(); t.ok('حُدّثت حالة الشكوى') }, onError: t.err,
  })
}
export function useAddCitizenNote() {
  const inv = useInvalidateCitizen(); const t = useToast()
  return useMutation({ mutationFn: (v: { id: string; note: string }) => citizen.addNote(v.id, v.note), onSuccess: () => { inv(); t.ok('أُضيفت الملاحظة') }, onError: t.err })
}
export function useCitizenQueue(enabled = true) {
  return useQuery({ queryKey: citizenKeys.queue(), queryFn: citizen.opsQueue, enabled, refetchInterval: enabled ? 4000 : false })
}
export function useOpsChatSession(sessionId: string | null) {
  return useQuery({ queryKey: citizenKeys.session(sessionId ?? ''), queryFn: () => citizen.opsMessages(sessionId as string, 0), enabled: !!sessionId, refetchInterval: sessionId ? 2500 : false })
}
export function useOpsChatActions() {
  const inv = useInvalidateCitizen(); const t = useToast()
  const accept = useMutation({ mutationFn: (id: string) => citizen.opsAccept(id), onSuccess: inv, onError: t.err })
  const send = useMutation({ mutationFn: (v: { id: string; body: string }) => citizen.opsSend(v.id, v.body), onSuccess: inv, onError: t.err })
  const close = useMutation({ mutationFn: (id: string) => citizen.opsClose(id), onSuccess: () => { inv(); t.ok('أُغلقت المحادثة') }, onError: t.err })
  return { accept, send, close }
}
export function useOpsChatDays() { return useQuery({ queryKey: citizenKeys.chatDays(), queryFn: () => citizen.opsChatDays(), staleTime: 60_000 }) }
export function useOpsChatHistory(day: string | null) {
  return useQuery({ queryKey: citizenKeys.chatDay(day ?? ''), queryFn: () => citizen.opsChatHistory(day as string), enabled: !!day, staleTime: 60_000 })
}
export function useSaveCitizenSettings() {
  const inv = useInvalidateCitizen(); const t = useToast()
  return useMutation({ mutationFn: citizen.opsSaveSettings, onSuccess: () => { inv(); t.ok('حُفظت إعدادات صفحة المواطن') }, onError: t.err })
}

// ─────────── مسؤول القسم ───────────
export function useAssignedCitizenComplaints() { return useQuery({ queryKey: citizenKeys.assigned(), queryFn: citizen.mine, refetchInterval: 30_000 }) }

// ─────────── التقارير ───────────
export function useCitizenReport(from: string, to: string, enabled = true) {
  return useQuery({ queryKey: citizenKeys.report(from, to), queryFn: () => citizen.report(from, to), enabled: enabled && !!from && !!to, staleTime: 60_000 })
}

/** عنوان صفحة المواطن العامة (للنسخ/المشاركة من غرفة العمليات) */
export function useCitizenPublicUrl(): string {
  const [url, setUrl] = useState('/citizen')
  useEffect(() => { if (typeof window !== 'undefined') setUrl(`${window.location.origin}/citizen`) }, [])
  return url
}

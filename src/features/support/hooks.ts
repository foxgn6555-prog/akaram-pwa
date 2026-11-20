/** hooks الدعم الفني (الجولة ٥) */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  support,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
} from '@sdk/support.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export const supportKeys = {
  all: ['support'] as const,
  contact: () => [...supportKeys.all, 'contact'] as const,
  tickets: (status: SupportStatus | null) => [...supportKeys.all, 'tickets', status ?? 'all'] as const,
}

export function useSupportContact() {
  return useQuery({
    queryKey: supportKeys.contact(),
    queryFn: () => support.contact(),
    staleTime: 10 * 60_000,
  })
}

export function useSupportTickets(status: SupportStatus | null, enabled = true) {
  return useQuery({
    queryKey: supportKeys.tickets(status),
    queryFn: () => support.list(status),
    enabled,
    staleTime: 15_000,
  })
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: async (vars: {
      title: string
      description: string
      category: SupportCategory
      priority: SupportPriority
      portal?: string | null
      phone?: string | null
      files?: File[]
    }) => {
      const paths: string[] = []
      for (const file of vars.files ?? []) paths.push(await support.uploadImage(file))
      return support.create({ ...vars, attachments: paths })
    },
    onSuccess: (data) => {
      addToast({ type: 'success', message: `وصل طلبك إلى الدعم الفني — رقم التذكرة #${data.ticket_number}` })
      void queryClient.invalidateQueries({ queryKey: supportKeys.all })
    },
    onError: (error) => addToast({ type: 'error', message: handleAppError(error, { scope: 'supportTicketCreate' }).message }),
  })
}

export function useDecideTicket() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (vars: { id: string; status: SupportStatus; note?: string | null }) =>
      support.decide(vars.id, vars.status, vars.note),
    onSuccess: () => {
      addToast({ type: 'success', message: 'حُدِّثت التذكرة وأُشعر صاحبها' })
      void queryClient.invalidateQueries({ queryKey: supportKeys.all })
    },
    onError: (error) => addToast({ type: 'error', message: handleAppError(error, { scope: 'supportTicketDecide' }).message }),
  })
}

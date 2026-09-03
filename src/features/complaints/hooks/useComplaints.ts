import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { complaints } from '@sdk/complaints.sdk'
import { complaintsKeys } from '@lib/query-keys/complaints.keys'
import { rasterizePdfPages } from '../lib/pdf-pages'
import { inferLocationFromArabicText, recognizeComplaintImage } from '../lib/ocr'
import type { ComplaintItemFields, ComplaintReport, ComplaintSector, SendComplaintEmailInput } from '../types'

export function useComplaintInbox(sector?: ComplaintSector) {
  return useQuery({
    queryKey: complaintsKeys.inbox(sector),
    queryFn: () => complaints.inbox(sector),
  })
}

export function useComplaintInboxMedia(messageId: string | null) {
  return useQuery({
    queryKey: complaintsKeys.inboxMedia(messageId ?? 'none'),
    queryFn: () => complaints.inboxMedia(messageId as string),
    enabled: Boolean(messageId),
  })
}

export function useComplaintOcr() {
  return useMutation({ mutationFn: async (url: string) => {
    const result = await recognizeComplaintImage(url)
    return { ...result, ...inferLocationFromArabicText(result.text) }
  } })
}

export function useExtractComplaintPdf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, sourceId, url, name }: { messageId: string; sourceId: string; url: string; name: string }) => {
      const pages = await rasterizePdfPages(url, name)
      await complaints.addInboxPdfPages(messageId, sourceId, pages)
      return pages.length
    },
    onSuccess: (_count, input) => queryClient.invalidateQueries({ queryKey: complaintsKeys.inboxMedia(input.messageId) }),
  })
}

export function useCreateComplaintItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, mediaIds, fields }: {
      messageId: string
      mediaIds: string[]
      fields: ComplaintItemFields
    }) => complaints.createItemFromInbox(messageId, mediaIds, fields),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
  })
}

export function useComplaintItems(mine = false) {
  return useQuery({
    queryKey: complaintsKeys.items(mine ? 'manager' : 'officer'),
    queryFn: () => complaints.items(mine),
  })
}

export function useComplaintManagers() {
  return useQuery({
    queryKey: complaintsKeys.managers(),
    queryFn: () => complaints.managers(),
  })
}

export function useAssignComplaintItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, managerId }: { itemId: string; managerId: string }) =>
      complaints.assign(itemId, managerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
  })
}

export function useStartComplaintItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => complaints.start(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
  })
}


export function useComplaintItemDetail(itemId: string | null) {
  return useQuery({ queryKey: complaintsKeys.detail(itemId ?? 'none'),
    queryFn: () => complaints.itemDetail(itemId as string), enabled: Boolean(itemId) })
}

export function useComplaintItemMedia(itemId: string | null) {
  return useQuery({ queryKey: complaintsKeys.media(itemId ?? 'none'),
    queryFn: () => complaints.itemMedia(itemId as string), enabled: Boolean(itemId) })
}

export function useComplaintSummary() {
  return useQuery({ queryKey: complaintsKeys.summary(), queryFn: () => complaints.summary() })
}

export function useComplaintTemplates() {
  return useQuery({ queryKey: complaintsKeys.templates(), queryFn: () => complaints.templates() })
}

export function useComplaintContacts() {
  return useQuery({ queryKey: complaintsKeys.contacts(), queryFn: () => complaints.contacts() })
}

export function useComplaintSettings() {
  return useQuery({ queryKey: complaintsKeys.settings(), queryFn: () => complaints.settings() })
}

export function useSaveComplaintSetting() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: complaints.saveSetting,
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.settings() }) })
}

export function useSaveComplaintTemplate() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: complaints.saveTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.templates() }) })
}

export function useSaveComplaintContact() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: complaints.saveContact,
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.contacts() }) })
}

export function useComplaintReports() {
  return useQuery({ queryKey: complaintsKeys.reports(), queryFn: () => complaints.reports() })
}

export function useReviewComplaintItem() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ itemId, approved, note }: { itemId: string; approved: boolean; note?: string }) =>
    complaints.reviewItem(itemId, approved, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.all }) })
}

export function usePrepareComplaintReport() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ sector, date, templateId }: { sector: ComplaintSector; date: string; templateId?: string }) =>
    complaints.prepareReport(sector, date, templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.reports() }) })
}

export function useComplaintReport(reportId: string | null) {
  return useQuery({ queryKey: complaintsKeys.report(reportId ?? 'none'),
    queryFn: () => complaints.reportDetail(reportId as string), enabled: Boolean(reportId) })
}

export function useSaveComplaintReportDraft() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: complaints.saveReportDraft,
    onSuccess: (_data, detail) => {
      void qc.invalidateQueries({ queryKey: complaintsKeys.report(detail.id) })
      void qc.invalidateQueries({ queryKey: complaintsKeys.reports() })
    } })
}

export function useComplaintReportDownload() {
  return useMutation({ mutationFn: (path: string) => complaints.reportDownloadUrl(path) })
}

export function useSetComplaintReportStatus() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ reportId, status }: { reportId: string; status: ComplaintReport['status'] }) =>
    complaints.setReportStatus(reportId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.all }) })
}

export function useGenerateComplaintReport() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (reportId: string) => complaints.generateReport(reportId),
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.all }) })
}

export function useComplaintDeliveries(complaintId?: string) {
  return useQuery({
    queryKey: complaintsKeys.deliveries(complaintId),
    queryFn: () => complaints.deliveries(complaintId),
  })
}

export function useSendComplaintEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SendComplaintEmailInput) => complaints.sendEmail(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
  })
}

export function useCompleteComplaintItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, file, notes }: { itemId: string; file: File; notes?: string }) => {
      const location = await currentLocation()
      await complaints.uploadAfter(itemId, file, location ?? undefined)
      await complaints.complete(itemId, notes)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
  })
}

async function currentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  if (!navigator.geolocation) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

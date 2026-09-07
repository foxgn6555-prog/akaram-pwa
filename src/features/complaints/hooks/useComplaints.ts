import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { complaints } from '@sdk/complaints.sdk'
import { complaintsKeys } from '@lib/query-keys/complaints.keys'
import { rasterizePdfPages } from '../lib/pdf-pages'
import { inferLocationFromArabicText, recognizeComplaintImage } from '../lib/ocr'
import type { ComplaintAfterUpload, ComplaintItemFields, ComplaintReport, ComplaintSector, ComplaintSortEntry, ComplaintTicketAfterUpload, SendComplaintEmailInput } from '../types'

export function useComplaintInbox(sector?: ComplaintSector, date?: string) {
  return useQuery({
    queryKey: [...complaintsKeys.inbox(sector), date ?? 'all'],
    queryFn: () => complaints.inbox(sector,date),
  })
}

export function useComplaintInboxMedia(messageId: string | null) {
  return useQuery({
    queryKey: complaintsKeys.inboxMedia(messageId ?? 'none'),
    queryFn: () => complaints.inboxMedia(messageId as string),
    enabled: Boolean(messageId),
  })
}

export function useComplaintInboxMediaPage(messageId: string | null, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...complaintsKeys.inboxMedia(messageId ?? 'none'), 'page', page, pageSize],
    queryFn: () => complaints.inboxMediaPage(messageId as string, page, pageSize),
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
    mutationFn: async ({ messageId, sourceId, url, name, onProgress }: { messageId: string; sourceId: string; url: string; name: string; onProgress?: (current: number, total: number) => void }) => {
      let converted = 0
      await rasterizePdfPages(url, name, async (page, pageNumber, totalPages) => {
        await complaints.addInboxPdfPages(messageId, sourceId, [page], pageNumber)
        converted = pageNumber
        onProgress?.(pageNumber, totalPages)
      })
      return converted
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

export function useBatchCreateComplaintItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, entries }: { messageId: string; entries: ComplaintSortEntry[] }) =>
      complaints.batchCreateItemsFromInbox(messageId, entries),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: complaintsKeys.all }),
  })
}

export function useComplaintItems(mine = false, date?: string) {
  return useQuery({
    queryKey: [...complaintsKeys.items(mine ? 'manager' : 'officer'), date ?? 'all'],
    queryFn: () => complaints.items(mine,date),
  })
}

export function useManagerComplaintTicket(complaintId:string|null){
  return useQuery({queryKey:complaintsKeys.detail(`manager-ticket:${complaintId??'none'}`),queryFn:()=>complaints.managerTicket(complaintId as string),enabled:Boolean(complaintId)})
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

export function useAssignComplaintItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemIds, managerId }: { itemIds: string[]; managerId: string }) =>
      complaints.assignBatch(itemIds, managerId),
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

export function useUpdateComplaintItemDuringReview() {
  const queryClient=useQueryClient()
  return useMutation({mutationFn:({itemId,fields,reason}:{itemId:string;fields:ComplaintItemFields;reason:string})=>
    complaints.updateItemDuringReview(itemId,fields,reason),onSuccess:()=>queryClient.invalidateQueries({queryKey:complaintsKeys.all})})
}

export function useReplaceComplaintItemMedia() {
  const queryClient=useQueryClient()
  return useMutation({mutationFn:({itemId,oldMediaId,kind,file,reason}:{itemId:string;oldMediaId:string;kind:'before'|'after';file:File;reason:string})=>
    complaints.replaceItemMedia(itemId,oldMediaId,kind,file,reason),onSuccess:()=>queryClient.invalidateQueries({queryKey:complaintsKeys.all})})
}

export function useComplaintItemMedia(itemId: string | null) {
  return useQuery({ queryKey: complaintsKeys.media(itemId ?? 'none'),
    queryFn: () => complaints.itemMedia(itemId as string), enabled: Boolean(itemId) })
}
export function useComplaintItemsMedia(itemIds: string[]) {
  const ids=[...itemIds].sort()
  return useQuery({queryKey:[...complaintsKeys.all,'batch-media',ids],queryFn:()=>complaints.itemsMedia(ids),enabled:ids.length>0})
}

export function useComplaintSummary() {
  return useQuery({ queryKey: complaintsKeys.summary(), queryFn: () => complaints.summary() })
}
export function useComplaintAnalytics(from:string,to:string,sector?:ComplaintSector) {
  return useQuery({queryKey:complaintsKeys.analytics(from,to,sector),queryFn:()=>complaints.analytics(from,to,sector),enabled:Boolean(from&&to)})
}

export function useComplaintTemplates() {
  return useQuery({ queryKey: complaintsKeys.templates(), queryFn: () => complaints.templates() })
}

export function useComplaintContacts() {
  return useQuery({ queryKey: complaintsKeys.contacts(), queryFn: () => complaints.contacts() })
}

export function useComplaintArchiveFolders(){return useQuery({queryKey:[...complaintsKeys.all,'archive-folders'],queryFn:()=>complaints.archiveFolders()})}
export function useComplaintDeletionRequests(){return useQuery({queryKey:[...complaintsKeys.all,'deletion-requests'],queryFn:()=>complaints.deletionRequests()})}
export function useArchiveComplaintEmail(){const qc=useQueryClient();return useMutation({mutationFn:({messageId,reason}:{messageId:string;reason:string})=>complaints.archiveEmail(messageId,reason),onSuccess:()=>qc.invalidateQueries({queryKey:complaintsKeys.all})})}
export function useRestoreComplaintEmail(){const qc=useQueryClient();return useMutation({mutationFn:(folderId:string)=>complaints.restoreEmail(folderId),onSuccess:()=>qc.invalidateQueries({queryKey:complaintsKeys.all})})}
export function useRequestComplaintDeletion(){const qc=useQueryClient();return useMutation({mutationFn:({folderId,reason}:{folderId:string;reason:string})=>complaints.requestPermanentDeletion(folderId,reason),onSuccess:()=>qc.invalidateQueries({queryKey:complaintsKeys.all})})}
export function useDecideComplaintDeletion(){const qc=useQueryClient();return useMutation({mutationFn:({requestId,approved,note}:{requestId:string;approved:boolean;note?:string})=>complaints.decideDeletion(requestId,approved,note),onSettled:()=>qc.invalidateQueries({queryKey:complaintsKeys.all})})}
export function useRetryComplaintDeletion(){const qc=useQueryClient();return useMutation({mutationFn:({requestId,note}:{requestId:string;note?:string})=>complaints.retryDeletion(requestId,note),onSettled:()=>qc.invalidateQueries({queryKey:complaintsKeys.all})})}

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
  return useMutation({
    mutationFn: complaints.saveTemplate,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: complaintsKeys.templates() }),
        qc.invalidateQueries({ queryKey: complaintsKeys.reports() }),
      ])
    },
  })
}

export function useSaveComplaintContact() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: complaints.saveContact,
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.contacts() }) })
}

export function useComplaintReports(date?:string) {
  return useQuery({ queryKey: [...complaintsKeys.reports(),date??'all'], queryFn: () => complaints.reports(date) })
}

export function useReviewComplaintItem() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ itemId, approved, note }: { itemId: string; approved: boolean; note?: string }) =>
    complaints.reviewItem(itemId, approved, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: complaintsKeys.all }) })
}

export function useReviewComplaintAssignmentTicket(){
  const qc=useQueryClient()
  return useMutation({mutationFn:({complaintId,managerId,approved,note}:{complaintId:string;managerId:string;approved:boolean;note?:string})=>complaints.reviewAssignmentTicket(complaintId,managerId,approved,note),onSuccess:()=>qc.invalidateQueries({queryKey:complaintsKeys.all})})
}

export function usePrepareComplaintReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sector, date, templateId }: { sector: ComplaintSector; date: string; templateId?: string }) =>
      complaints.prepareReport(sector, date, templateId),
    onSuccess: async (reportId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: complaintsKeys.reports() }),
        qc.invalidateQueries({ queryKey: complaintsKeys.report(reportId) }),
      ])
    },
  })
}

export function usePrepareComplaintEmailReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, templateId }: { messageId: string; templateId?: string }) =>
      complaints.prepareEmailReport(messageId, templateId),
    onSuccess: async (reportId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: complaintsKeys.reports() }),
        qc.invalidateQueries({ queryKey: complaintsKeys.report(reportId) }),
      ])
    },
  })
}

export function useArchiveComplaintReport(){const qc=useQueryClient();return useMutation({mutationFn:({reportId,reason}:{reportId:string;reason:string})=>complaints.archiveReport(reportId,reason),onSuccess:async()=>{await qc.invalidateQueries({queryKey:complaintsKeys.reports()})}})}

export function useComplaintReport(reportId: string | null) {
  return useQuery({ queryKey: complaintsKeys.report(reportId ?? 'none'),
    queryFn: () => complaints.reportDetail(reportId as string), enabled: Boolean(reportId) })
}

export function useSaveComplaintReportDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: complaints.saveReportDraft,
    onSuccess: async (_data, detail) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: complaintsKeys.report(detail.id) }),
        qc.invalidateQueries({ queryKey: complaintsKeys.reports() }),
      ])
    },
  })
}

export function useComplaintReportDownload() {
  return useMutation({ mutationFn: (path: string) => complaints.reportDownloadUrl(path) })
}

export function useSetComplaintReportStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, status, reviewedPptxPath }: { reportId: string; status: ComplaintReport['status']; reviewedPptxPath?: string }) =>
      complaints.setReportStatus(reportId, status, reviewedPptxPath),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: complaintsKeys.all }) },
  })
}

export function useGenerateComplaintReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reportId: string) => complaints.generateReport(reportId),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: complaintsKeys.all }) },
  })
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

export function useStartComplaintAssignmentTicket(){
  const queryClient=useQueryClient()
  return useMutation({mutationFn:(complaintId:string)=>complaints.startAssignmentTicket(complaintId),onSuccess:()=>queryClient.invalidateQueries({queryKey:complaintsKeys.all})})
}

export function useCompleteComplaintAssignmentTicket(){
  const queryClient=useQueryClient()
  return useMutation({mutationFn:({complaintId,files,notes}:{complaintId:string;files:ComplaintTicketAfterUpload[];notes?:string})=>complaints.completeAssignmentTicket(complaintId,files,notes),onSuccess:()=>queryClient.invalidateQueries({queryKey:complaintsKeys.all})})
}

export function useCompleteComplaintItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, file, files, notes, location }: { itemId: string; file?: File; files?: ComplaintAfterUpload[]; notes?: string; location?: {latitude:number;longitude:number} }) => {
      const uploads=files?.length?files:file?[{file,source:'gallery' as const}]:[]
      if(!uploads.length)throw new Error('COMPLAINT_AFTER_IMAGE_REQUIRED')
      const resolvedLocation = location ?? await currentLocation()
      await complaints.uploadAfterBatch(itemId,uploads,resolvedLocation ?? undefined)
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

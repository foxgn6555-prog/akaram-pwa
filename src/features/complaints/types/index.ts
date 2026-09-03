export type ComplaintSector = 'karrada' | 'zaafaraniya'
export type InboxStatus = 'new' | 'extracting' | 'ready' | 'needs_review' | 'imported' | 'failed' | 'duplicate'
export type ComplaintItemStatus = 'under_review' | 'assigned' | 'in_progress' | 'processed' | 'quality_review' | 'approved' | 'returned'

export interface ComplaintInboxMessage {
  id: string
  senderEmail: string
  senderName: string | null
  replyTo: string | null
  subject: string | null
  sector: ComplaintSector | null
  receivedAt: string
  status: InboxStatus
  attachmentCount: number
  duplicateOf: string | null
}

export interface ComplaintInboxMedia {
  id: string
  name: string
  mimeType: string
  url: string
  duplicate: boolean
}

export interface ComplaintItemFields {
  title?: string
  municipalCenter?: string
  neighborhood?: string
  alley?: string
  locationText?: string
  ocrText?: string
}

export interface ComplaintItem {
  id: string
  complaintId: string
  referenceNo: string
  complaintStatus: string
  sector: ComplaintSector
  sequenceNo: number
  title: string | null
  municipalCenter: string | null
  neighborhood: string | null
  alley: string | null
  locationText: string | null
  ocrText: string | null
  assignedTo: string | null
  status: ComplaintItemStatus
  managerNotes: string | null
  reviewerNotes: string | null
  receivedAt: string
}

export interface ComplaintManager {
  userId: string
  fullName: string
  jobTitle: string | null
}

export interface SendComplaintEmailInput {
  complaintId?: string
  reportId?: string
  to: string[]
  subject: string
  text: string
  attachmentPaths: string[]
}

export interface ComplaintEmailDelivery {
  id: string
  recipients: string[]
  subject: string
  status: 'queued' | 'accepted' | 'delivered' | 'temporary_failure' | 'permanent_failure' | 'rejected'
  errorMessage: string | null
  createdAt: string
  deliveredAt: string | null
}

export interface ComplaintMedia {
  id: string
  kind: 'before' | 'after' | 'email_attachment' | 'report'
  url: string
  name: string
  mimeType: string
  capturedAt: string | null
}

export interface ComplaintSummary {
  total: number
  newCount: number
  assigned: number
  inProgress: number
  processed: number
  archived: number
  karrada: number
  zaafaraniya: number
}

export interface ComplaintTemplate {
  id: string
  name: string
  description: string | null
  sector: ComplaintSector | null
  layout: Record<string, unknown>
  isDefault: boolean
  isActive: boolean
  version: number
}

export interface ComplaintContact {
  id: string
  sector: ComplaintSector | null
  name: string
  email: string
  kind: 'sender_rule' | 'recipient' | 'cc'
  isActive: boolean
}

export interface ComplaintSetting {
  key: string
  value: Record<string, unknown>
  description: string | null
}

export interface ComplaintStatusEvent {
  id: string
  fromStatus: string | null
  toStatus: string
  note: string | null
  actorId: string | null
  createdAt: string
}

export interface ComplaintItemDetail {
  item: ComplaintItem
  media: ComplaintMedia[]
  history: ComplaintStatusEvent[]
  senderEmail: string | null
  subject: string | null
  bodyText: string | null
  inboxMessageId: string | null
}

export interface ComplaintReportItem {
  itemId: string
  displayOrder: number
  included: boolean
  slideLayout: Record<string, unknown>
  item: ComplaintItem
}

export interface ComplaintReportDetail extends ComplaintReport {
  layout: Record<string, unknown>
  items: ComplaintReportItem[]
  approvedAt: string | null
  sentAt: string | null
  archivedAt: string | null
  deliveries: ComplaintEmailDelivery[]
}

export interface ComplaintReport {
  id: string
  reportDate: string
  sector: ComplaintSector
  title: string
  status: 'draft' | 'quality_review' | 'approved' | 'sending' | 'sent' | 'failed' | 'archived'
  pptxPath: string | null
  recipients: string[]
  deliveryId: string | null
  createdAt: string
}

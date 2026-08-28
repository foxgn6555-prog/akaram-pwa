/** حالات الطلبات — mirror لقيد CHECK في 00006_requests.sql */
export const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const
export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS]

/** الانتقالات المشروعة — mirror لـ app.validate_request_transition (المصدر الحاكم: DB) */
export const REQUEST_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  [REQUEST_STATUS.PENDING]: [REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.APPROVED]: [REQUEST_STATUS.IN_PROGRESS, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.IN_PROGRESS]: [REQUEST_STATUS.COMPLETED],
  [REQUEST_STATUS.REJECTED]: [],
  [REQUEST_STATUS.COMPLETED]: [],
  [REQUEST_STATUS.CANCELLED]: [],
} as const

export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const
export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS]

export const PAYROLL_STATUS = { DRAFT: 'draft', APPROVED: 'approved', PAID: 'paid' } as const
export type PayrollStatus = (typeof PAYROLL_STATUS)[keyof typeof PAYROLL_STATUS]

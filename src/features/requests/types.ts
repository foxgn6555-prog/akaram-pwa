import type { RequestStatus } from '@lib/constants/status.constants'

/** mirror لـ 00006_requests.sql */
export interface Request {
  id: string
  employee_id: string
  type: 'leave' | 'expense_advance' | 'document_request' | 'correction' | 'other'
  status: RequestStatus
  payload: Record<string, unknown>
  approver_id: string | null
  decided_at: string | null
  rejection_reason: string | null
  version: number
  created_at: string
  updated_at: string
  employee?: { id: string; full_name: string; employee_number: string }
}

export type CreateRequestInput = {
  type: Request['type']
  payload: Record<string, unknown>
}

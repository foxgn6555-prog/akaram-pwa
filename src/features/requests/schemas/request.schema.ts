/**
 * Zod — عقد الطلبات. payload jsonb في DB مرن عمداً؛
 * هذا الـ schema هو العقد الصارم الذي يفرض شكل الـ payload لكل نوع.
 */
import { z } from 'zod'
import type { REQUEST_STATUS } from '@lib/constants/status.constants'

export const requestStatusSchema = z.enum([
  'pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled',
] as const)

/** إجازة */
const leavePayload = z.object({
  kind: z.enum(['annual', 'sick', 'unpaid', 'emergency']),
  from: z.string().date(),
  to: z.string().date(),
  reason: z.string().min(5).max(500),
})

/** سلفة مالية */
const expenseAdvancePayload = z.object({
  amount: z.number().positive('المبلغ يجب أن يكون موجباً'),
  currency: z.literal('IQD'),
  reason: z.string().min(5).max(500),
  repayMonths: z.number().int().min(1).max(24),
})

/** طلب وثيقة */
const documentRequestPayload = z.object({
  documentType: z.enum(['employment_letter', 'salary_certificate', 'id_copy', 'other']),
  notes: z.string().max(500).optional(),
})

/** تصحيح إداري */
const correctionPayload = z.object({
  subject: z.string().min(3).max(200),
  details: z.string().min(5).max(2000),
})

export const createRequestSchema = z
  .object({
    type: z.enum(['leave', 'expense_advance', 'document_request', 'correction', 'other']),
    payload: z.union([leavePayload, expenseAdvancePayload, documentRequestPayload, correctionPayload]),
  })
  .refine(
    (d) => !(d.type === 'leave' && 'from' in d.payload && 'to' in d.payload && d.payload.from > d.payload.to),
    { message: 'تاريخ البداية يجب أن يسبق النهاية', path: ['payload'] },
  )

export const decideRequestSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})

export type CreateRequestInput = z.infer<typeof createRequestSchema>
export type DecideRequestInput = z.infer<typeof decideRequestSchema>
export type { REQUEST_STATUS }

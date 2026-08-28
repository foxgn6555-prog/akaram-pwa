/** Buckets وقيودها — mirror لـ 00015_storage_buckets.sql */
export const BUCKETS = {
  EMPLOYEE_DOCUMENTS: 'employee-documents',
  PAYROLL: 'payroll',
  AVATARS: 'avatars',
} as const
export type BucketId = (typeof BUCKETS)[keyof typeof BUCKETS]

export interface BucketRule {
  id: BucketId
  maxBytes: number
  allowedMimeTypes: readonly string[]
}

export const BUCKET_RULES: Readonly<Record<BucketId, BucketRule>> = {
  [BUCKETS.EMPLOYEE_DOCUMENTS]: {
    id: BUCKETS.EMPLOYEE_DOCUMENTS,
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  },
  [BUCKETS.PAYROLL]: {
    id: BUCKETS.PAYROLL,
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf'],
  },
  [BUCKETS.AVATARS]: {
    id: BUCKETS.AVATARS,
    maxBytes: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
} as const

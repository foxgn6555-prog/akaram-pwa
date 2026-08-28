import { BUCKET_RULES, type BucketId } from '@lib/constants/storage.constants'

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`
}

export interface FileValidationResult {
  ok: boolean
  error?: 'TOO_LARGE' | 'BAD_TYPE'
}

/** تحقق من الملف قبل الرفع — mirror لقواعد Bucket في DB (تحقق مزدوج: عميل + storage policies) */
export function validateFile(file: File, bucket: BucketId): FileValidationResult {
  const rule = BUCKET_RULES[bucket]
  if (file.size > rule.maxBytes) return { ok: false, error: 'TOO_LARGE' }
  if (!rule.allowedMimeTypes.includes(file.type)) return { ok: false, error: 'BAD_TYPE' }
  return { ok: true }
}

/** اسم ملف آمن داخل مجلد الموظف: {employeeId}/{timestamp}-{slug}.{ext} */
export function buildStoragePath(employeeId: string, fileName: string): string {
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : ''
  const slug = fileName
    .slice(0, fileName.includes('.') ? fileName.lastIndexOf('.') : undefined)
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return `${employeeId}/${Date.now()}-${slug || 'file'}${ext}`
}

import type { BucketId } from '@lib/constants/storage.constants'

/** استراتيجية حل التعارض عند رفض الخادم (version mismatch) */
export type ConflictStrategy =
  | 'server-wins'   // بيانات مالية/رواتب — الخادم مرجع مطلق
  | 'client-wins'   // تفضيلات للقراءة (حالة قراءة الإشعار)
  | 'reject'        // الحالة الافتراضية: أبلغ المستخدم ودعه يعيد القرار

export interface QueuedMutation {
  id: string
  /** اسم العملية في الـ SDK — يُعاد تنفيذها عند عودة الاتصال */
  sdkCall: string
  payload: Record<string, unknown>
  /** نسخة الصف التي بُنيت عليها الطفرة (Optimistic Concurrency) */
  baseVersion: number
  queuedAt: number
  retries: number
}

export interface OfflineEntityPolicy {
  strategy: ConflictStrategy
  /** هل تُعرض الطفرة في طابور انتظار عند انقطاع الشبكة؟ */
  queueable: boolean
}

export type OfflineContext = { bucket?: BucketId }

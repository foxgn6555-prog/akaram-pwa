/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  قانون SDK (ADR 002): هذا الملف هو نقطة الوصول الوحيدة لـ Supabase
 *  في المشروع كله. أي استيراد لـ @supabase/* خارج src/services يرفضه
 *  ESLint (no-restricted-imports) في وقت الـ lint.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseConfig } from '@config/supabase.config'
import { SDKError } from '@lib/errors/SDKError'

export const supabase: SupabaseClient = createClient(
  supabaseConfig.url,
  supabaseConfig.anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: { headers: { 'x-client-info': 'municipal-pwa' } },
  },
)

/** خطأ شبكة؟ (أساس طابور Offline — ADR 006) */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof SDKError && error.code === 'NETWORK')
  )
}

/** غلاف لاستعلام maybeSingle: يسمح بنتيجة null مع توحيد أخطاء الشبكة والخادم. */
export async function sdkMaybe<T>(
  operation: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
): Promise<T | null> {
  try {
    const result = await operation
    if (result.error) throw new SDKError(result.error.message, result.error.code ?? 'UNKNOWN', result.error)
    return result.data
  } catch (error) {
    if (error instanceof SDKError) throw error
    if (error instanceof TypeError) throw new SDKError('تعذر الاتصال بالخادم — تحقق من الشبكة', 'NETWORK', error)
    throw new SDKError('خطأ غير متوقع في طبقة الخدمات', 'UNKNOWN', error)
  }
}

/**
 * غلاف موحّد لكل استدعاءات الـ SDK:
 * يحوّل أخطاء Supabase إلى SDKError منظمة (بدل أخطاء خام في الواجهة).
 * Overloads لتغطية اتحادات Supabase Auth (نتائج data بأشكال مختلفة).
 */
export async function sdkGuard<T>(
  operation: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
): Promise<T>
export async function sdkGuard(operation: PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<undefined>
export async function sdkGuard<T>(
  operation: PromiseLike<{ data?: unknown; error?: { message: string; code?: string } | null }>,
): Promise<T> {
  try {
    const result = await operation
    const error = result.error
    if (error) {
      throw new SDKError(error.message, error.code ?? 'UNKNOWN', error)
    }
    const data = (result as { data?: unknown }).data
    if (data === null || data === undefined) {
      throw new SDKError('لم تُعد العملية أي بيانات', 'EMPTY_RESULT')
    }
    return data as T
  } catch (error) {
    if (error instanceof SDKError) throw error
    if (error instanceof TypeError) {
      throw new SDKError('تعذر الاتصال بالخادم — تحقق من الشبكة', 'NETWORK', error)
    }
    throw new SDKError('خطأ غير متوقع في طبقة الخدمات', 'UNKNOWN', error)
  }
}

/**
 * غلاف للعمليات بلا بيانات مرجعة (void RPC / update / signOut).
 * يشترك مع sdkGuard في توحيد الأخطاء — دون شرط "يجب أن تُرجع بيانات".
 */
export async function sdkVoid(
  operation: PromiseLike<{ error?: { message: string; code?: string } | null }>,
): Promise<void> {
  try {
    const result = await operation
    if (result.error) {
      throw new SDKError(result.error.message, result.error.code ?? 'UNKNOWN', result.error)
    }
  } catch (error) {
    if (error instanceof SDKError) throw error
    if (error instanceof TypeError) {
      throw new SDKError('تعذر الاتصال بالخادم — تحقق من الشبكة', 'NETWORK', error)
    }
    throw new SDKError('خطأ غير متوقع في طبقة الخدمات', 'UNKNOWN', error)
  }
}
/**
 * حارس إبطال الجلسة (الجولة ٣-ج) — يجعل «إنهاء الجلسة» ملموساً على الجهاز المنتهي.
 *
 * المشكلة: حذف صف الجلسة في الخادم (app.session_revoke) يُبطل **رمز التحديث** فوراً،
 * لكن الجهاز المنتهي يحمل رمز وصول صالحاً حتى انتهاء صلاحيته (GoTrue: ساعة). فيظل
 * يعمل كأن شيئاً لم يحدث — وهو ما جعل «إنهاء الجلسة» يبدو معطلاً.
 *
 * الحل: كل جهاز يسأل «هل جلستي ما زالت موجودة؟» عند فتحه وعند عودته للمقدمة وكل دقيقة،
 * فإن غابت جلسته من الخادم أُخرج محلياً فوراً (signOut + تفريغ الكاش).
 *
 * لا قرار صلاحية هنا: الحذف نفسه يقع على الخادم؛ هذا الحارس ينفّذ الأثر على العميل فقط.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@sdk/client'
import { sessions, sessionIdFromToken } from '@sdk/sessions.sdk'

/** أول فحص بعد الإقلاع — يترك وقتاً لاستقرار الجلسة بعد الدخول */
export const FIRST_CHECK_DELAY_MS = 5_000
/** دورية الفحص ما دامت الصفحة مرئية */
export const CHECK_INTERVAL_MS = 60_000

/**
 * هل جلسة هذا الجهاز ما زالت قائمة في الخادم؟
 * @returns `null` إذا تعذّر الحكم (لا معرّف جلسة في الرمز أو استجابة غير صالحة)
 */
export async function currentSessionAlive(): Promise<boolean | null> {
  const { data } = await supabase.auth.getSession()
  const current = sessionIdFromToken(data.session?.access_token)
  if (!current) return null
  const list = await sessions.list()
  if (!Array.isArray(list)) return null
  return list.some((s) => s.id === current)
}

export function useRevokedSessionWatch(userId: string | null): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const run = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') return
      try {
        const alive = await currentSessionAlive()
        if (cancelled || alive !== false) return
        // الجلسة أُنهيت من جهاز آخر: إخراج فوري بلا انتظار انتهاء رمز الوصول
        queryClient.clear()
        await supabase.auth.signOut()
      } catch {
        /* فشل الشبكة أو الخادم لا يطرد المستخدم — نعيد المحاولة في الدورة التالية */
      }
    }

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void run()
    }
    const first = window.setTimeout(() => { void run() }, FIRST_CHECK_DELAY_MS)
    const timer = window.setInterval(() => { void run() }, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, queryClient])
}

/**
 * رمز الوصول (JWT) الحي — يُمرَّر لتضمين FlowBridge الثابت (iframe) ليتصل
 * بـ Edge Function flowbridge-api بهوية المستخدم الحالي (RLS هو الحاكم).
 * يتحدّث تلقائياً عند تجديد الجلسة (autoRefreshToken) أو تسجيل الدخول/الخروج.
 */
import { useEffect, useState } from 'react'
import { auth } from '@sdk/auth.sdk'

export function useFlowBridgeAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void auth.getAccessToken().then((t) => {
      if (active) setToken(t)
    })
    const unsubscribe = auth.onAuthStateChange((newToken) => {
      if (active) setToken(newToken)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return token
}

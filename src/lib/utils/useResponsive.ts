/**
 * خطاف تجاوب الشاشات — مصدر حقيقة واحد لمقاس الشاشة داخل التطبيق.
 *
 * النقاط (مطابقة لنقاط Tailwind الافتراضية):
 *  · sm  640   · md  768   · lg 1024 (حد الدسكتوب/الموبايل)   · xl 1280
 *
 * السلوك:
 *  · يشترك في الاستماع لتغيير المقاس مرة واحدة لكل مقاس (متغير مشترك)
 *  · يحدّث عند تغيير اتجاه الجهاز (orientationchange) أيضاً
 *  · آمن في بيئات بلا window (اختبارات/SSR) ويعطي وضع الدسكتوب الافتراضي
 */
import { useEffect, useState } from 'react'

export interface ResponsiveState {
  width: number
  /** موبايل/تابليت: أقل من lg (1024) — يظهر الدرج بدل الشريط الثابت */
  isMobile: boolean
  /** ≥ lg (1024) */
  isDesktop: boolean
  /** ≥ md (768) */
  isTabletUp: boolean
  /** ≥ xl (1280) */
  isWide: boolean
}

export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const

function readState(): ResponsiveState {
  const width = typeof window === 'undefined' ? BREAKPOINTS.lg : window.innerWidth
  return {
    width,
    isMobile: width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isTabletUp: width >= BREAKPOINTS.md,
    isWide: width >= BREAKPOINTS.xl,
  }
}

/** حالة مشتركة بين كل المستهلكين + مشترك واحد فقط لحدث resize */
let sharedState: ResponsiveState = readState()
const listeners = new Set<(s: ResponsiveState) => void>()
let subscribed = false

function notify(): void {
  sharedState = readState()
  listeners.forEach((fn) => fn(sharedState))
}

function ensureSubscription(): void {
  if (subscribed || typeof window === 'undefined') return
  subscribed = true
  window.addEventListener('resize', notify)
  window.addEventListener('orientationchange', notify)
}

/**
 * حالة تجاوب تفاعلية. تُحدَّث تلقائياً عند تغيير حجم النافذة.
 * @param initialWidth عرض ابتدائي للاختبارات (jsdom لا تحسب المقاس الحقيقي)
 */
export function useResponsive(initialWidth?: number): ResponsiveState {
  const fromWidth = (width: number): ResponsiveState => ({
    width,
    isMobile: width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isTabletUp: width >= BREAKPOINTS.md,
    isWide: width >= BREAKPOINTS.xl,
  })

  const [state, setState] = useState<ResponsiveState>(() =>
    initialWidth !== undefined ? fromWidth(initialWidth) : readState(),
  )

  useEffect(() => {
    // في الاختبارات/SSR يُمرَّر عرض ابتدائي ثابت → لا نشترك في قراءة window
    if (initialWidth !== undefined) return
    ensureSubscription()
    // زامنة فورية عند التركيب (قد يكون المقاس تغيّر قبل الاشتراك)
    setState(readState())
    const listener = (s: ResponsiveState): void => setState(s)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
    // initialWidth ثابت لكل عمر المكوّن
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}

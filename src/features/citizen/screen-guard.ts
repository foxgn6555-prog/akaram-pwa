/**
 * رادع لقطات الشاشة في محادثة الدعم (00169).
 * المتصفحات لا تمنع لقطة الشاشة فعلياً؛ لذا نعتمد مجموعة روادع:
 *   · تمويه المحادثة عند خروج التبويب من الواجهة أو فقدان التركيز (أغلب أدوات اللقطة تُفقد التركيز).
 *   · اعتراض PrintScreen وتفريغ الحافظة + اختصارات اللقطة/الطباعة المعروفة (Ctrl+P، Ctrl+Shift+S، ⌘⇧3/4/5، Win+Shift+S).
 *   · تعطيل النسخ/التحديد/السحب/القائمة السياقية داخل المحادثة، وإخفاؤها عند الطباعة.
 *   · إشعار للمستخدم بأن اللقطات غير مسموحة.
 */
import { useEffect, useState, type RefObject } from 'react'

export interface ScreenGuardState { blurred: boolean; notice: string | null }

export const SCREEN_GUARD_NOTICE = 'لقطات الشاشة غير مسموحة في هذه المحادثة حفاظاً على خصوصيتك وخصوصية الموظف.'
export const SCREEN_GUARD_PRINT_CSS = '@media print { [data-screen-guard] { display: none !important; } [data-screen-guard-print] { display: block !important; } }'

/** هل هذا الاختصار من اختصارات لقطة الشاشة/الطباعة؟ (دالة صافية — تُختبر مباشرة) */
export function isCaptureShortcut(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): boolean {
  const key = (e.key || '').toLowerCase()
  if (key === 'printscreen' || e.code === 'PrintScreen') return true
  if ((e.ctrlKey || e.metaKey) && key === 'p') return true
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 's' || key === '3' || key === '4' || key === '5')) return true
  if (e.metaKey && e.shiftKey && key === 's') return true
  return false
}

export function useScreenGuard(ref: RefObject<HTMLElement | null>, enabled: boolean): ScreenGuardState {
  const [blurred, setBlurred] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const warn = () => { setNotice(SCREEN_GUARD_NOTICE); clearTimeout(timer); timer = setTimeout(() => setNotice(null), 4000) }
    const hide = () => setBlurred(true)
    const show = () => setBlurred(false)
    const onVisibility = () => (document.visibilityState === 'hidden' ? hide() : show())
    const onKey = (e: KeyboardEvent) => {
      if (!isCaptureShortcut(e)) return
      e.preventDefault(); e.stopPropagation()
      hide(); warn()
      try { void navigator.clipboard?.writeText?.('') } catch { /* بلا صلاحية — نتجاهل */ }
      setTimeout(show, 1200)
    }
    const onKeyUp = (e: KeyboardEvent) => { if ((e.key || '').toLowerCase() === 'printscreen' || e.code === 'PrintScreen') { try { void navigator.clipboard?.writeText?.('') } catch { /* ignore */ } } }
    const block = (e: Event) => { e.preventDefault(); warn() }
    const el = ref.current
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', hide)
    window.addEventListener('focus', show)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('beforeprint', hide)
    window.addEventListener('afterprint', show)
    const local: Array<[string, EventListener]> = [['copy', block], ['cut', block], ['contextmenu', block], ['dragstart', block], ['selectstart', (e) => e.preventDefault()]]
    local.forEach(([t, h]) => el?.addEventListener(t, h))
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', show)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('beforeprint', hide)
      window.removeEventListener('afterprint', show)
      local.forEach(([t, h]) => el?.removeEventListener(t, h))
    }
  }, [ref, enabled])
  return { blurred, notice }
}

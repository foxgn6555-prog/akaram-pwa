/**
 * حالة UI فقط — ممنوع أي بيانات سيرفر هنا (قانون 5).
 * بيانات السيرفر حكر على TanStack Query.
 *
 * ملاحظة تجاوب الشاشات:
 *  · `sidebarCollapsed` → خاص بالدسكتوب (طي الشريط الجانبي إلى شريط أيقونات)
 *  · `mobileNavOpen`   → درج الموبايل (فتح/إغلاق) — لا علاقة له بالطي
 * الحالتان منفصلتان تماماً حتى لا يكبر/يصغر أحد الشاشات فيفسد وضع الأخرى.
 */
import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
}

interface UiState {
  /** طي شريط الدسكتوب (شريط أيقونات) — لا أثر له على الموبايل */
  sidebarCollapsed: boolean
  /** درج تنقل الموبايل مفتوح؟ — لا أثر له على الدسكتوب */
  mobileNavOpen: boolean
  theme: 'light' | 'dark'
  toasts: Toast[]
  /** صفحات تحتاج ملء الشاشة الكامل (بلا padding/max-width) — مثل تضمين FlowBridge */
  contentFullBleed: boolean
  toggleSidebarCollapsed: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setMobileNav: (open: boolean) => void
  toggleMobileNav: () => void
  setTheme: (theme: 'light' | 'dark') => void
  setContentFullBleed: (fullBleed: boolean) => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  // الدسكتوب: الشريط مفتوح بالكامل افتراضياً
  sidebarCollapsed: false,
  // الموبايل: الدرج مغلق افتراضياً
  mobileNavOpen: false,
  theme: 'light',
  toasts: [],
  contentFullBleed: false,

  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  setTheme: (theme) => set({ theme }),
  setContentFullBleed: (fullBleed) => set({ contentFullBleed: fullBleed }),

  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }].slice(-5),
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

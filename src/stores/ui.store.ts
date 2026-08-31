/**
 * حالة UI فقط — ممنوع أي بيانات سيرفر هنا (قانون 5).
 * بيانات السيرفر حكر على TanStack Query.
 */
import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
}

interface UiState {
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  toasts: Toast[]
  /** صفحات تحتاج ملء الشاشة الكامل (بلا padding/max-width) — مثل تضمين FlowBridge */
  contentFullBleed: boolean
  toggleSidebar: () => void
  setSidebar: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
  setContentFullBleed: (fullBleed: boolean) => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  theme: 'light',
  toasts: [],
  contentFullBleed: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar: (open) => set({ sidebarOpen: open }),
  setTheme: (theme) => set({ theme }),
  setContentFullBleed: (fullBleed) => set({ contentFullBleed: fullBleed }),

  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }].slice(-5),
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

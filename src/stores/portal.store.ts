/** البوابة النشطة + سجل التنقل داخل البوابة — حالة UI خالصة */
import { create } from 'zustand'
import type { PortalId } from '@lib/constants/portals.constants'

interface PortalState {
  activePortal: PortalId | null
  setActivePortal: (portal: PortalId) => void
  reset: () => void
}

export const usePortalStore = create<PortalState>((set) => ({
  activePortal: null,
  setActivePortal: (portal) => set({ activePortal: portal }),
  reset: () => set({ activePortal: null }),
}))

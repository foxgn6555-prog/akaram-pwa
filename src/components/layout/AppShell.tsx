/**
 * إطار التطبيق المقفول — القضاء النهائي على أي تداخل أو كسر عند التكبير:
 *  · الشاشة = h-screen ثابتة (overflow-hidden) — الصفحة نفسها لا تتمرر أبداً
 *  · الشريط الجانبي: عمود ثابت بارتفاع الشاشة (لا sticky ولا fixed على الديسكتوب)
 *  · الهيدر: ثابت أعلى العمود (لا يبتعد عن العين أبداً)
 *  · منطقة المحتوى الوحيدة المسموح لها بالتمرر (overflow-y-auto) بمحتوى محصور العرض
 * التكبير/التصغير لا يكسر البنية: إما وضع دسكتوب الصلب أو وضع درج الموبايل الصلب.
 */
import { useEffect } from 'react'
import { Outlet } from 'react-router'
import clsx from 'clsx'
import type { PortalId } from '@lib/constants/portals.constants'
import { portalThemes } from '@config/portals.config'
import { useUiStore } from '@stores/ui.store'
import { Toaster } from '@components/ui'
import { OfflineBanner } from '@components/feedback/OfflineBanner'
import { Sidebar, SidebarBackdrop } from '@components/layout/Sidebar/Sidebar'
import { Header } from '@components/layout/Header/Header'

export interface AppShellProps {
  portal: PortalId
}

export function AppShell({ portal }: AppShellProps) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebar = useUiStore((s) => s.setSidebar)
  const theme = portalThemes[portal]

  // الموبايل: الدرج مغلق افتراضياً
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebar(false)
  }, [setSidebar])

  return (
    <div className={clsx(theme.themeClass, 'portal-shell flex h-screen overflow-hidden')}>
      {/* ── الشريط: عمود ثابت (دسكتوب) ── */}
      <div className="max-lg:hidden">
        <Sidebar portal={portal} />
      </div>

      {/* ── درج الموبايل ── */}
      {sidebarOpen && (
        <div className="lg:hidden">
          <Sidebar portal={portal} onNavigate={() => setSidebar(false)} />
          <SidebarBackdrop onClose={() => setSidebar(false)} />
        </div>
      )}

      {/* ── عمود المحتوى: ثابت الارتفاع، التمرير داخلي فقط ── */}
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <Header portal={portal} />
        <main data-testid="app-main" className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster />
    </div>
  )
}

/**
 * إطار التطبيق المقفول — القضاء النهائي على أي تداخل أو كسر عند التكبير:
 *  · الشاشة = h-screen ثابتة (overflow-hidden) — الصفحة نفسها لا تتمرر أبداً
 *  · الشريط الجانبي: عمود ثابت بارتفاع الشاشة (لا sticky ولا fixed على الدسكتوب)
 *  · الهيدر: ثابت أعلى العمود (لا يبتعد عن العين أبداً)
 *  · منطقة المحتوى الوحيدة المسموح لها بالتمرر (overflow-y-auto) بمحتوى محصور العرض
 * التكبير/التصغير لا يكسر البنية: إما وضع دسكتوب الصلب أو وضع درج الموبايل الصلب.
 *
 * الموبايل (<lg):
 *  · درج تنقل منزلق (mobileNavOpen) + خلفية معتمة
 *  · شريط تنقل سفلي ثابت (MobileBottomNav) للوصول السريع بيد واحدة
 *  · حشو سفلي للمحتوى يحترم شريط النظام (safe-area-inset)
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
import { MobileBottomNav } from '@components/layout/MobileBottomNav'
import { Header } from '@components/layout/Header/Header'

export interface AppShellProps {
  portal: PortalId
}

/** حد شاشات الموبايل/التابليت (مطابق لـ lg في Tailwind = 1024px) */
const MOBILE_MAX_WIDTH = 1024

export function AppShell({ portal }: AppShellProps) {
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen)
  const setMobileNav = useUiStore((s) => s.setMobileNav)
  const fullBleed = useUiStore((s) => s.contentFullBleed)
  const theme = portalThemes[portal]

  // الموبايل: الدرج مغلق افتراضياً — ويُغلق تلقائياً عند تجاوز حد الدسكتوب
  useEffect(() => {
    const sync = (): void => {
      if (window.innerWidth >= MOBILE_MAX_WIDTH) setMobileNav(false)
    }
    // ضبط ابتدائي (في حال فُتح التطبيق لأول مرة على شاشة صغيرة)
    if (window.innerWidth < MOBILE_MAX_WIDTH) setMobileNav(false)
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [setMobileNav])

  return (
    <div className={clsx(theme.themeClass, 'portal-shell flex h-screen overflow-hidden')}>
      {/* ── الشريط: عمود ثابت (دسكتوب فقط) ── */}
      <div className="max-lg:hidden">
        <Sidebar portal={portal} variant="desktop" />
      </div>

      {/* ── درج الموبايل (موبايل فقط) ── */}
      {mobileNavOpen && (
        <div className="lg:hidden">
          <Sidebar portal={portal} variant="mobile" onNavigate={() => setMobileNav(false)} />
          <SidebarBackdrop onClose={() => setMobileNav(false)} />
        </div>
      )}

      {/* ── عمود المحتوى: ثابت الارتفاع، التمرير داخلي فقط ── */}
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <Header portal={portal} />
        <main
          data-testid="app-main"
          className={clsx(
            'flex-1',
            fullBleed
              ? 'flex min-h-0 flex-col overflow-hidden p-0'
              : // حشو سفلي على الموبايل لتفادي تغطية الشريط السفلي (~64px) + شريط النظام
                'overflow-y-auto p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-6',
          )}
        >
          {fullBleed ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <Outlet />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          )}
        </main>

        {/* ── شريط التنقل السفلي — موبايل فقط ── */}
        {!fullBleed && <MobileBottomNav portal={portal} />}
      </div>

      <Toaster />
    </div>
  )
}

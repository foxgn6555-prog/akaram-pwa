/**
 * الشريط الجانبي — بأسلوب Kyvzon (أقسام منظمة · شعار · ألوان الأكارم)
 * كل بوابة تعرض وحداتها فقط · زر طي · خروج · RTL
 *
 * التجاوب:
 *  · الدسكتوب (lg+): شريط ثابت بجانب المحتوى، قابل للطي لأيقونات (sidebarCollapsed)
 *  · الموبايل (<lg): درج منزلق بملء الارتفاع، يفتح من زر الهيدر (mobileNavOpen)
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useUiStore } from '@stores/ui.store'
import { useLogout } from '@features/auth/hooks/useAuth'
import { Icon } from '@components/ui/Icon/Icon'
import { portalThemes, PORTAL_UNITS, type SidebarUnit } from '@config/portals.config'
import type { PortalId } from '@lib/constants/portals.constants'
import { SidebarItem } from './SidebarItem'
import { useVisibleUnits } from '@features/portal-visibility'

export interface SidebarProps {
  portal: PortalId
  /** يُستدعى عند اختيار رابط في درج الموبايل (لإغلاقه بعد التنقل) */
  onNavigate?: () => void
  /**
   * وضع العرض:
   *  - 'desktop' شريط ثابت قابل للطي (الافتراضي)
   *  - 'mobile'  درج منزلق يظهر دائماً موسعاً
   */
  variant?: 'desktop' | 'mobile'
}

export function Sidebar({ portal, onNavigate, variant = 'desktop' }: SidebarProps) {
  const { t } = useTranslation('sidebar')
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = variant === 'mobile'
  // الطي خاص بالدسكتوب فقط؛ درج الموبايل يظهر دائماً موسعاً (يُقرأ دائماً بنفس الترتيب)
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const collapsed = !isMobile && sidebarCollapsed
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed)
  const setMobileNav = useUiStore((s) => s.setMobileNav)
  const logout = useLogout()
  const theme = portalThemes[portal]
  const units = useVisibleUnits(portal, (PORTAL_UNITS[portal] ?? []) as readonly SidebarUnit[])

  const isActive = (path: string): boolean =>
    path === `/${portal}`
      ? location.pathname === path || location.pathname === `${path}/`
      : location.pathname.startsWith(path)

  const isChildActive = (unit: SidebarUnit): boolean =>
    unit.exact === true
      ? location.pathname === unit.path
      : location.pathname.startsWith(unit.path)

  const goTo = (path: string): void => {
    navigate(path)
    onNavigate?.()
  }

  const handleLogout = (): void => {
    void logout.mutateAsync().then(() => window.location.assign('/login'))
  }

  const asideRef = useRef<HTMLElement | null>(null)
  // درج الموبايل: قفل تمرير الخلفية + تركيز أولي + استعادة التركيز عند الإغلاق + Escape/Tab
  useEffect(() => {
    if (!isMobile) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const root = asideRef.current
    const closeBtn = root?.querySelector<HTMLElement>('[data-testid="sidebar-mobile-close"]')
    closeBtn?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { setMobileNav(false); return }
      if (e.key !== 'Tab' || !root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true')
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [isMobile, setMobileNav])

  return (
    <aside
      ref={asideRef}
      data-testid={isMobile ? 'app-sidebar-mobile' : 'app-sidebar'}
      role={isMobile ? 'dialog' : undefined}
      aria-modal={isMobile ? true : undefined}
      aria-label={isMobile ? 'قائمة التنقل' : undefined}
      className={clsx(
        'relative isolate flex h-full shrink-0 flex-col overflow-visible border-e border-slate-200 bg-white transition-all duration-200',
        isMobile
          ? // درج الموبايل: فوق الهيدر/القوائم، ارتفاع ديناميكي كامل، واحترام notch/shريط النظام
            'fixed inset-y-0 start-0 z-[90] h-dvh w-72 max-w-[85vw] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl'
          : // الدسكتوب: شريط لاصق داخل تدفق الصفحة
            // z-20: يبقى الشريط (ومنه مقبض الانبثاق) فوق محتوى <main> وأقل من الدرج (z-40) والنوافذ (z-50)
            // العرض حصري (w-72 أو w-20) — لا يجتمعان أبداً لأن ترتيب كلاسات Tailwind يُبطل أحدهما (سبّب عُطل زر الانبثاق)
            clsx('z-30', collapsed ? 'w-20' : 'w-72'),
      )}
    >
      {/* مقبض الطي على الحافة — للدسكتوب فقط (أكبر وأوضح وأسهل نقراً) */}
      {!isMobile && (
        <button
          onClick={toggleCollapsed}
          data-testid="sidebar-collapse"
          title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          aria-expanded={!collapsed}
          className="absolute top-14 z-50 flex size-8 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-600 shadow-lg ring-2 ring-white transition-all hover:scale-110 hover:bg-brand-50 -end-4"
        >
          {/* RTL: السهم يشير لاتجاه الطي */}
          <Icon name={collapsed ? 'chevron-left' : 'chevron-right'} size={16} />
        </button>
      )}

      {/* زر إغلاق درج الموبايل (×) — ظاهر فقط في الدرج المنزلق */}
      {isMobile && (
        <button
          onClick={() => setMobileNav(false)}
          data-testid="sidebar-mobile-close"
          title="إغلاق القائمة"
          aria-label="إغلاق القائمة"
          className="absolute top-[calc(1rem+env(safe-area-inset-top))] z-50 flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md hover:text-red-600 -end-3"
        >
          <Icon name="x" size={18} />
        </button>
      )}

      {/* الشعار */}
      <div className={clsx(
        'flex h-16 shrink-0 items-center gap-3 border-b border-slate-100',
        collapsed ? 'flex-col justify-center px-2' : 'px-4',
      )}>
        <img src="/icons/logo-128.png" alt="جزيرة الأكارم" className="size-10 shrink-0 rounded-xl" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-brand-700">جزيرة الأكارم</p>
            <p className="truncate text-[11px] text-slate-500">{theme.label}</p>
          </div>
        )}
      </div>

      {/* الوحدات */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label="وحدات البوابة">
        {!collapsed && (
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t('sections.main')}
          </p>
        )}
        <ul className="space-y-1">
          {units.map((unit) => {
            const children = unit.children ?? []
            const parentActive = isActive(unit.path)

            return (
              <li key={unit.path}>
                <SidebarItem
                  unit={unit}
                  label={t(unit.labelKey)}
                  active={parentActive}
                  collapsed={collapsed}
                  portalClass={theme.themeClass}
                  // النقر على الوحدة → صفحتها المركزية (Hub) — وأيقونات الـ Hub تنقل للصفحات الفرعية
                  onSelect={() => goTo(unit.path)}
                />
                {parentActive && !collapsed && children.length > 0 && (
                  <ul className="mb-2 mt-1 space-y-0.5 ps-4" data-testid="unit-pages">
                    {children.map((child) => (
                      <li key={child.path}>
                        <SidebarItem
                          unit={child}
                          label={t(child.labelKey)}
                          active={isChildActive(child)}
                          collapsed={false}
                          portalClass={theme.themeClass}
                          compact
                          onSelect={() => goTo(child.path)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {/* الخروج */}
      <div className="border-t border-slate-100 px-3 py-2">
        <button
          onClick={handleLogout}
          data-testid="sidebar-logout"
          title={collapsed ? 'تسجيل الخروج' : undefined}
          className={clsx(
            'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors',
            collapsed && 'justify-center px-2',
          )}
        >
          <Icon name="logout" size={18} />
          {!collapsed && <span>تسجيل الخروج</span>}
        </button>
      </div>

      {/* تذييل */}
      <div className="border-t border-slate-100 px-4 py-3">
        {!collapsed ? (
          <p className="text-center text-[10px] text-slate-400">جزيرة الأكارم · نظام داخلي</p>
        ) : (
          <div className="flex justify-center">
            <img src="/icons/logo-128.png" alt="" className="size-6 opacity-40" />
          </div>
        )}
      </div>
    </aside>
  )
}

/** الخلفية المعتمة لدرج الموبايل */
export function SidebarBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      data-testid="sidebar-backdrop"
      className="fixed inset-0 z-[85] bg-slate-900/55 backdrop-blur-[2px] lg:hidden"
      onClick={onClose}
      aria-hidden="true"
    />
  )
}

/**
 * شريط التنقل السفلي للموبايل — تنقل سريع بيد واحدة (نمط تطبيقات الموبايل).
 *
 *  · يظهر فقط تحت lg (الموبايل/التابليت الصغير)
 *  · يعرض أول وحدات البوابة (حتى 4) + زر "المزيد" يفتح الدرج الكامل
 *  · ارتفاع الهدف اللمسي ≥ 44px (توصية WCAG / Apple HIG)
 *  · يحترم شريط النظام السفلي عبر env(safe-area-inset-bottom)
 *  · العنصر النشط يأخذ لون تمييز البوابة
 */
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { PORTAL_UNITS, type SidebarUnit } from '@config/portals.config'
import type { PortalId } from '@lib/constants/portals.constants'
import { useUiStore } from '@stores/ui.store'
import { useResponsive } from '@lib/utils/useResponsive'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

export interface MobileBottomNavProps {
  portal: PortalId
}

/** عدد عناصر التنقل المباشرة (الباقي خلف زر "المزيد") */
const QUICK_ITEMS = 4

export function MobileBottomNav({ portal }: MobileBottomNavProps) {
  const { t } = useTranslation('sidebar')
  const location = useLocation()
  const navigate = useNavigate()
  const setMobileNav = useUiStore((s) => s.setMobileNav)
  const { isMobile } = useResponsive()
  const units = (PORTAL_UNITS[portal] ?? []) as readonly SidebarUnit[]

  // يُعرض على الموبايل فقط — إخفاء برمجي (وليس CSS فقط) لقارئات الشاشة والاختبارات
  if (!isMobile || units.length === 0) return null

  const quickUnits = units.slice(0, QUICK_ITEMS)
  const hasMore = units.length > QUICK_ITEMS

  const isActive = (path: string, index: number): boolean =>
    index === 0
      ? // الصفحة الرئيسية للبوابة: مطابقة تامة لمسار البوابة
        location.pathname === `/${portal}` || location.pathname === `/${portal}/`
      : location.pathname.startsWith(path)

  const go = (path: string): void => {
    void navigate(path)
  }

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="تنقل سريع"
      className={clsx(
        'lg:hidden',
        'fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md',
        // احترام شريط النظام في الأجهزة ذات الحواف المنحنية (iPhone إلخ)
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {quickUnits.map((unit, index) => {
          const active = isActive(unit.path, index)
          return (
            <li key={unit.path} className="flex-1">
              <button
                onClick={() => go(unit.path)}
                data-testid={`bottom-nav-${index === 0 ? 'home' : unit.path.split('/').pop()}`}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors',
                  active ? 'text-brand-600' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <span
                  className={clsx(
                    'flex size-7 items-center justify-center rounded-full transition-colors',
                    active && 'bg-brand-50',
                  )}
                >
                  <Icon name={unit.icon as IconName} size={20} />
                </span>
                <span className="max-w-full truncate text-[10px] font-medium leading-4">
                  {t(unit.labelKey)}
                </span>
              </button>
            </li>
          )
        })}

        {hasMore && (
          <li className="flex-1">
            <button
              onClick={() => setMobileNav(true)}
              data-testid="bottom-nav-more"
              aria-haspopup="dialog"
              aria-label="المزيد من الصفحات"
              className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-slate-500 transition-colors hover:text-slate-700"
            >
              <span className="flex size-7 items-center justify-center rounded-full">
                <Icon name="menu" size={20} />
              </span>
              <span className="text-[10px] font-medium leading-4">المزيد</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  )
}

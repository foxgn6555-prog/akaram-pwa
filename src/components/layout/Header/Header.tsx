/**
 * الهيدر — بأسلوب Kyvzon (تكييف كامل لهوية جزيرة الأكرام):
 *  · بحث سريع في صفحات البوابة الحالية
 *  · تحية حسب وقت اليوم (صباح/مساء/ليل)
 *  · قائمة مستخدم غنية (معلومات + بوابات + خروج)
 *  · عنوان الصفحة الحالية ديناميكي
 */
import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  Search,
  Sunrise, Sun, Sunset, Moon,
} from 'lucide-react'
import { format } from 'date-fns'
import { ar } from 'date-fns/locale'
import clsx from 'clsx'
import { PORTALS, type PortalId } from '@lib/constants/portals.constants'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import { portalThemes, PORTAL_UNITS, type SidebarUnit } from '@config/portals.config'
import { useAuth, useLogout } from '@features/auth/hooks/useAuth'
import { useUiStore } from '@stores/ui.store'
import { Icon } from '@components/ui/Icon/Icon'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'

export interface HeaderProps {
  portal: PortalId
}

/** تحية حسب وقت اليوم */
function getGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12)
    return { text: 'صباح الخير', Icon: Sunrise, bg: 'bg-amber-50', border: 'border-amber-200', textColor: 'text-amber-700' }
  if (hour >= 12 && hour < 17)
    return { text: 'مساء الخير', Icon: Sun, bg: 'bg-orange-50', border: 'border-orange-200', textColor: 'text-orange-700' }
  if (hour >= 17 && hour < 21)
    return { text: 'مساء النور', Icon: Sunset, bg: 'bg-purple-50', border: 'border-purple-200', textColor: 'text-purple-700' }
  return { text: 'ليلة طيبة', Icon: Moon, bg: 'bg-indigo-50', border: 'border-indigo-200', textColor: 'text-indigo-700' }
}

export function Header({ portal }: HeaderProps) {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()
  const { data: session } = useAuth()
  const logout = useLogout()
  const theme = portalThemes[portal]
  const units = (PORTAL_UNITS[portal] ?? []) as readonly SidebarUnit[]
  const setSidebar = useUiStore((s) => s.setSidebar)

  // ── البحث السريع ──
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

  // ── نبض زمني: يحدّث التحية والتاريخ تلقائياً دون إعادة تحميل الصفحة ──
  const [, setTimeTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTimeTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // ── تحية ──
  const greeting = getGreeting()
  const GreetingIcon = greeting.Icon
  const today = format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar })

  // ── إغلاق البحث عند النقر خارجاً ──
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── عناصر البحث: كل صفحات البوابة ──
  const allPages = units.flatMap((u) => [
    { path: u.path, label: t(u.labelKey), icon: u.icon },
    ...(u.children ?? []).map((c) => ({ path: c.path, label: t(c.labelKey), icon: c.icon })),
  ])
  const searchResults = searchQuery.trim()
    ? allPages.filter((p) => p.label.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 6)
    : []

  // ── عنوان الصفحة الحالية ──
  const currentPage = allPages.find((p) =>
    p.path === location.pathname || location.pathname.startsWith(p.path + '/'))
  const pageTitle = currentPage?.label ?? theme.label

  // روابط القائمة حسب البوابة الحالية — لا روابط ثابتة لبوابة admin لغير المخوّلين
  const accountPath =
    portal === PORTALS.EMPLOYEE
      ? '/employee/profile'
      : portal === PORTALS.ADMIN
        ? '/admin/settings'
        : undefined
  const settingsPath = portal === PORTALS.ADMIN ? '/admin/settings' : undefined

  // الدور الفعلي للمستخدم (وليس اسم البوابة)
  const roleLabel = session ? (ROLE_LABELS[session.primaryRole] ?? theme.label) : theme.label

  const handleLogout = (): void => {
    void logout.mutateAsync().then(() => navigate('/login', { replace: true }))
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
      {/* ── القائمة + العنوان ── */}
      <button
        onClick={() => setSidebar(true)}
        className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="فتح القائمة"
      >
        <Icon name="menu" size={20} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-slate-800">{pageTitle}</h1>
        <p className="hidden text-[11px] text-slate-400 sm:block">{t('appName')}</p>
      </div>

      {/* ── البحث السريع ── */}
      <div className="relative hidden md:block" ref={searchRef}>
        <button
          onClick={() => setShowSearch((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-slate-400 hover:border-brand-300 hover:text-brand-600 transition-colors"
        >
          <Search size={16} />
          <span className="text-xs">بحث سريع…</span>
        </button>

        {showSearch && (
          <div className="absolute end-0 top-12 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن صفحة…"
                className="w-full h-9 rounded-lg bg-slate-50 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setShowSearch(false); setSearchQuery('') }}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50 text-start transition-colors"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <Icon name={item.icon} size={14} />
                    </span>
                    <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  </button>
                ))
              ) : (
                <p className="py-6 text-center text-xs text-slate-400">
                  {searchQuery ? 'لا توجد نتائج' : 'ابدأ الكتابة للبحث…'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── تحية حسب الوقت ── */}
      <div className={clsx('hidden lg:flex items-center gap-2 rounded-xl border px-3 py-1.5', greeting.bg, greeting.border)}>
        <GreetingIcon size={15} className={greeting.textColor} />
        <span className={clsx('text-xs font-semibold', greeting.textColor)}>{greeting.text}</span>
      </div>

      {/* ── التاريخ ── */}
      <span className="hidden xl:block text-[11px] text-slate-400">{today}</span>

      {/* ── الإشعارات ── */}
      <NotificationBell />

      {/* ── قائمة المستخدم ── */}
      <UserMenu
        fullName={session?.fullName ?? session?.email ?? 'مستخدم'}
        roleLabel={roleLabel}
        accountPath={accountPath}
        settingsPath={settingsPath}
        onLogout={handleLogout}
      />
    </header>
  )
}

import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PORTAL_UNITS, portalThemes, type SidebarUnit } from '@config/portals.config'
import { Icon } from '@components/ui/Icon/Icon'
import { useLogout } from '@features/auth/hooks/useAuth'
import type { PortalId } from '@lib/constants/portals.constants'

function flattenUnits(units: readonly SidebarUnit[]): SidebarUnit[] {
  return units.flatMap((unit) => [unit, ...(unit.children ?? [])])
}

/** معاينة شكل البوابة لحساب IT فقط: بيانات ثابتة من إعدادات الواجهة، بلا صفحات أو RPC للبوابة. */
export function PortalVisualPreview({ portal }: { portal: PortalId }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation('sidebar')
  const logout = useLogout()
  const theme = portalThemes[portal]
  const units = PORTAL_UNITS[portal] ?? []
  const pages = flattenUnits(units)
  const current = [...pages]
    .filter((unit) => location.pathname === unit.path || location.pathname.startsWith(`${unit.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
  const pageTitle = current ? t(current.labelKey) : theme.label

  return (
    <div className={`${theme.themeClass} flex h-dvh min-h-0 w-full overflow-hidden bg-slate-50`} dir="rtl" data-testid="portal-visual-preview">
      <aside className="hidden h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4">
          <img src="/icons/logo-128.png" alt="جزيرة الأكارم" className="size-10 rounded-xl" />
          <div className="min-w-0"><p className="truncate text-sm font-bold text-brand-700">جزيرة الأكارم</p><p className="truncate text-[11px] text-slate-500">{theme.label}</p></div>
        </div>
        <div className="border-b border-slate-100 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800"><Icon name="eye" size={14} /> معاينة بصرية فقط</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="وحدات المعاينة">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('sections.main')}</p>
          <ul className="space-y-1">
            {pages.map((unit) => {
              const active = location.pathname === unit.path || (unit.path !== `/${portal}` && location.pathname.startsWith(`${unit.path}/`))
              return (
                <li key={unit.path}>
                  <button type="button" onClick={() => navigate(unit.path)} aria-current={active ? 'page' : undefined}
                    className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-right text-sm transition-colors ${active ? 'bg-brand-50 font-bold text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <Icon name={unit.icon} size={17} /><span className="truncate">{t(unit.labelKey)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="border-t border-slate-100 p-3">
          <button type="button" onClick={() => { void logout.mutateAsync().then(() => window.location.assign('/login')) }}
            className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50">
            <Icon name="logout" size={17} /> تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="min-w-0"><h1 className="truncate text-base font-bold text-slate-800">{pageTitle}</h1><p className="text-[11px] text-slate-400">{theme.label}</p></div>
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800">وضع المعاينة — بلا بيانات</span>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden" aria-label="وحدات المعاينة">
          {pages.map((unit) => <button key={unit.path} type="button" onClick={() => navigate(unit.path)} className="shrink-0 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{t(unit.labelKey)}</button>)}
        </nav>
        <section className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon name={theme.icon} size={21} /></span>
                <div><h2 className="text-lg font-black text-slate-900">{pageTitle}</h2><p className="mt-1 text-sm leading-6 text-slate-600">هذه معاينة بصرية لبوابة {theme.label}. لا تُحمَّل سجلات البوابة أو ملفاتها، ولا تعمل أزرار أو عمليات فعلية من هذا العرض.</p></div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-2xl border border-dashed border-slate-300 bg-white/70" />)}
            </div>
            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center">
              <div><span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Icon name="eye" size={22} /></span><p className="font-bold text-slate-700">لا توجد بيانات في المعاينة</p><p className="mt-1 text-xs text-slate-500">اختَر وحدة من القائمة لمعاينة إطارها البصري فقط.</p></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

/** قائمة المستخدم المحسّنة — معلومات كاملة + بوابات + خروج */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, LogOut, User, Settings, RefreshCw } from 'lucide-react'
import { initials } from '@lib/utils/string.utils'
import { usePortalAccess } from '@features/auth/hooks/usePortalAccess'
import { portalThemes } from '@config/portals.config'

export interface UserMenuProps {
  fullName: string
  roleLabel: string
  onLogout: () => void
  /** مسار صفحة الحساب المناسب للبوابة الحالية — يُخفى الزر إن لم يتوفر */
  accountPath?: string
  /** مسار صفحة الإعدادات — يظهر فقط لمن يملك صفحة إعدادات فعلية */
  settingsPath?: string
}

export function UserMenu({ fullName, roleLabel, onLogout, accountPath, settingsPath }: UserMenuProps) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { data: access } = usePortalAccess()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const portals = access?.portals ?? []
  const showSwitcher = portals.length > 1

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-slate-50 transition-colors"
        aria-label="قائمة المستخدم"
      >
        <span className="hidden md:block text-end">
          <span className="block max-w-32 truncate text-sm font-semibold text-slate-700 leading-tight">{fullName}</span>
          <span className="block max-w-32 truncate text-[11px] text-slate-400">{roleLabel}</span>
        </span>
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-sm shadow-sm">
          {initials(fullName) || '؟'}
        </span>
        <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
      </button>

      {open && (
        <div className="absolute end-0 top-12 w-60 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50">
          {/* الرأس */}
          <div className="p-4 bg-gradient-to-br from-brand-50 to-brand-100/50 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold text-lg shadow">
                {initials(fullName) || '؟'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{fullName}</p>
                <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
              </div>
            </div>
          </div>

          <div className="p-2">
            {accountPath && (
              <button
                onClick={() => { setOpen(false); navigate(accountPath) }}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors"
              >
                <User size={16} />
                <span className="text-sm font-medium">حسابي</span>
              </button>
            )}
            {settingsPath && (
              <button
                onClick={() => { setOpen(false); navigate(settingsPath) }}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors"
              >
                <Settings size={16} />
                <span className="text-sm font-medium">الإعدادات</span>
              </button>
            )}

            {/* مبدّل البوابات */}
            {showSwitcher && (
              <div data-testid="portal-switcher" role="group" aria-label="تبديل البوابة">
                <div className="border-t border-slate-100 my-2" />
                <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  الانتقال بين البوابات
                </p>
                {portals.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setOpen(false); navigate(p.path) }}
                    data-testid={`switch-${p.id}`}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors"
                  >
                    <RefreshCw size={15} className="text-brand-500" />
                    <span className="text-sm">{portalThemes[p.id]?.label ?? p.id}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-slate-100 my-2" />
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-red-50 text-red-600 transition-colors"
            >
              <LogOut size={16} />
              <span className="text-sm font-medium">{t('actions.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

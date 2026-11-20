/** قائمة المستخدم المحسّنة — معلومات كاملة + بوابات + خروج */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronDown, LogOut, User, Settings, RefreshCw, MonitorSmartphone } from 'lucide-react'
import { initials } from '@lib/utils/string.utils'
import { usePortalAccess } from '@features/auth/hooks/usePortalAccess'
import { portalThemes } from '@config/portals.config'
import { MyDevicesDialog } from './MyDevicesDialog'

/** عرض اللوحة (w-64) — يُستخدم لحساب موضعها داخل الشاشة عند رسمها في body */
const PANEL_WIDTH = 256

export interface UserMenuProps {
  fullName: string
  roleLabel: string
  onLogout: () => void
  /** مسار صفحة الحساب المناسب للبوابة الحالية — يُخفى الزر إن لم يتوفر */
  accountPath?: string
  /** مسار صفحة الإعدادات — يظهر فقط لمن يملك صفحة إعدادات فعلية */
  settingsPath?: string
  /** يرفع طبقة الهيدر عند فتح القائمة حتى لا تحجبها/تتداخل معها أعمدة التخطيط */
  onOpenChange?: (open: boolean) => void
}

export function UserMenu({ fullName, roleLabel, onLogout, accountPath, settingsPath, onOpenChange }: UserMenuProps) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { data: access } = usePortalAccess()
  const [open, setOpen] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  /** موضع اللوحة: تُرسم في body (portal) لذا نحسب إحداثياتها من زر القائمة */
  const updateAnchor = useCallback((): void => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 24)
    // في RTL تنطلق اللوحة من حافة الزر نفسها ثم تُقصّ داخل الشاشة
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
    setAnchor({ top: Math.round(rect.bottom + 8), left: Math.round(left) })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null)
      return
    }
    updateAnchor()
  }, [open, updateAnchor])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      const target = e.target as Node
      // اللوحة صارت خارج شجرة الزر بعد الـportal — نفحصها أيضاً وإلا أُغلقت عند أول نقرة داخلها
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReflow = (): void => updateAnchor()
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, updateAnchor])

  const portals = access?.portals ?? []
  const showSwitcher = portals.length > 1

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-slate-50 transition-colors"
        aria-label="قائمة المستخدم"
        aria-haspopup="menu"
        aria-expanded={open}
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
        <>
        {/* الخلفية واللوحة تُرسمان في body عبر portal:
            1) الهيدر يحمل `backdrop-blur` فيصبح كتلةً حاوية لـ`position: fixed` التابعة له،
               فكانت `fixed inset-0` محسوبة على الهيدر (64px) فلا تُغلق القائمة بالنقر خارجها.
            2) AppShell يحمل `isolate` (سياق تكديس خاص) فكل `z-*` داخل الهيدر محصور فيه،
               فكانت الخلفية بـ`z-30` تُرسم فوق اللوحة وتُعتّمها (عطل «القائمة الشفافة»).
            الحل: كلاهما في body، الخلفية 2990 واللوحة 3000. */}
        {createPortal(
          <button
            type="button"
            data-testid="user-menu-backdrop"
            aria-label="إغلاق قائمة المستخدم"
            className="fixed inset-0 z-[2990] cursor-default bg-slate-950/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />,
          document.body,
        )}
        {createPortal(
          <div
            ref={panelRef}
            data-testid="user-menu-panel"
            style={anchor ? { top: anchor.top, left: anchor.left } : { top: 0, left: 0, visibility: 'hidden' }}
            className="fixed z-[3000] w-64 max-h-[min(80dvh,40rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-white shadow-2xl"
          >
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

            {/* الجولة ٣: الأجهزة والجلسات المفتوحة */}
            <div className="border-t border-slate-100 my-2" />
            <button
              data-testid="user-menu-devices"
              onClick={() => { setOpen(false); setDevicesOpen(true) }}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors"
            >
              <MonitorSmartphone size={16} />
              <span className="text-sm font-medium">أجهزتي وجلساتي</span>
            </button>

            <div className="border-t border-slate-100 my-2" />
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-red-50 text-red-600 transition-colors"
            >
              <LogOut size={16} />
              <span className="text-sm font-medium">{t('actions.logout')}</span>
            </button>
          </div>
          </div>,
          document.body,
        )}
        </>
      )}
      {devicesOpen && <MyDevicesDialog open onClose={() => setDevicesOpen(false)} />}
    </div>
  )
}

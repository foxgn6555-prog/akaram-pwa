/** عنصر قائمة الشريط الجانبي — حالة نشطة + تلميح عند الانهيار */
import clsx from 'clsx'
import { Icon } from '@components/ui/Icon/Icon'
import type { SidebarUnit } from '@config/portals.config'

export interface SidebarItemProps {
  unit: SidebarUnit
  label: string
  active: boolean
  collapsed: boolean
  portalClass: string
  onSelect: () => void
  /** عنصر فرعي (صفحة داخل وحدة) — أصغر حجماً */
  compact?: boolean
}

export function SidebarItem({ unit, label, active, collapsed, portalClass, onSelect, compact = false }: SidebarItemProps) {
  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={clsx(
        'flex w-full items-center gap-3 rounded-xl transition-colors',
        // هدف لمس مريح: ≥44px للرئيسي، ≥40px للفرعي
        compact ? 'min-h-10 px-3 py-2 text-[13px]' : 'min-h-11 px-3 py-2.5 text-sm',
        active
          ? 'font-semibold text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100',
        portalClass,
      )}
      style={
        active
          ? { background: 'var(--portal-color, var(--color-brand-600))' }
          : undefined
      }
    >
      <Icon name={unit.icon} size={compact ? 16 : 20} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

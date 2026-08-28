/** صفحة وحدة قيد التطوير — هوية البوابة + اسم الوحدة + رسالة واضحة */
import { useTranslation } from 'react-i18next'
import { PORTAL_UNITS } from '@config/portals.config'
import type { PortalId } from '@lib/constants/portals.constants'
import { Icon } from '@components/ui/Icon/Icon'

export interface UnitPlaceholderProps {
  portal: PortalId
  unitPath: string
}

export default function UnitPlaceholder({ portal, unitPath }: UnitPlaceholderProps) {
  const { t } = useTranslation('sidebar')
  const units = PORTAL_UNITS[portal] ?? []
  const unit = units.flatMap((u) => [u, ...(u.children ?? [])]).find((u) => u.path === unitPath)

  return (
    <section
      data-testid="unit-placeholder"
      className="mx-auto my-2 flex min-h-[45vh] w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-sm sm:p-10"
    >
      <span
        className="portal-accent flex size-16 items-center justify-center rounded-2xl"
        style={{ background: 'var(--portal-bg, #f1f5f9)' }}
      >
        <Icon name={unit?.icon ?? 'layout-grid'} size={28} />
      </span>
      <h1 className="text-lg font-bold text-slate-800">{unit ? t(unit.labelKey) : ''}</h1>
      <p className="max-w-md text-sm leading-6 text-slate-500">
        هذه الوحدة ضمن خطة المراحل القادمة — بنيتها في قاعدة البيانات جاهزة بالكامل،
        وواجهتها ستُستكمل في المرحلة التالية من التطوير.
      </p>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        قيد التطوير
      </span>
    </section>
  )
}

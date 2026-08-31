/**
 * صفحة الوحدة المركزية (Hub) — النمط الموحد لكل الوحدات:
 *  ① أيقونات روابط صفحات الوحدة — الضغط ينقل للصفحة
 *  ② تقارير وتفاصيل مجمعة عن بيانات تلك الصفحات
 * الخصائص: تُغذّى من صفحة الوحدة نفسها (البوابات تمرر محتواها).
 */
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

export interface HubPageLink {
  path: string
  label: string
  hint: string
  icon: IconName
}

export interface UnitHubProps {
  title: string
  description: string
  /** روابط صفحات الوحدة — تظهر كبطاقات أيقونية */
  pages: readonly HubPageLink[]
  children?: React.ReactNode
  testId?: string
}

export function UnitHub({ title, description, pages, children, testId = 'unit-hub' }: UnitHubProps) {
  const navigate = useNavigate()

  return (
    <section aria-labelledby="unit-hub-title" className="space-y-5" data-testid={testId}>
      <div>
        <h1 id="unit-hub-title" className="text-lg font-bold">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      {/* ① روابط صفحات الوحدة — كلاسات ثابتة حتى يولّدها Tailwind (لا أصناف ديناميكية) */}
      <div
        className={clsx(
          'grid grid-cols-2 gap-3',
          pages.length >= 4 && 'sm:grid-cols-2 lg:grid-cols-4',
          pages.length === 3 && 'sm:grid-cols-3',
          pages.length === 2 && 'sm:grid-cols-2',
          pages.length === 1 && 'grid-cols-1',
        )}
        data-testid={`${testId}-pages`}
      >
        {pages.map((page) => (
          <button
            key={page.path}
            onClick={() => navigate(page.path)}
            data-testid={`hub-card-${page.path.split('/').pop()}`}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
          >
            <span className="portal-accent flex size-14 items-center justify-center rounded-2xl bg-brand-50 transition-colors group-hover:bg-brand-100">
              <Icon name={page.icon} size={24} />
            </span>
            <span className="text-sm font-bold text-slate-800">{page.label}</span>
            <span className="text-xs leading-5 text-slate-500">{page.hint}</span>
          </button>
        ))}
      </div>

      {/* ② تقارير وتفاصيل الوحدة */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700">تقارير وتفاصيل الوحدة</h2>
        {children}
      </div>
    </section>
  )
}

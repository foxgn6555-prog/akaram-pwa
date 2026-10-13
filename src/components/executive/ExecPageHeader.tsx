/**
 * رأس موحّد لوحدات الإدارة العليا (00216) — كحلي/ذهبي بهوية الشركة، يحمل العنوان والوصف وأيقونة الوحدة،
 * وأرقاماً حيّة (اختيارية) وأزرار إجراء، وروابط للوحدات الشقيقة. يُستخدم في كل وحدات بوابة المدير المفوض ليبدو الترتيب واحداً.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

export interface ExecStat { label: string; value: ReactNode; tone?: 'gold' | 'red' | 'green' | 'plain'; testId?: string }
export interface ExecHeaderLink { to: string; label: string; icon: IconName }

const STAT_TONE = { gold: 'text-[#f3d06a]', red: 'text-red-300', green: 'text-emerald-300', plain: 'text-white' } as const

export function ExecPageHeader({ icon, iconNode, title, subtitle, stats, actions, links, testId = 'exec-page-header' }: {
  icon: IconName; iconNode?: ReactNode; title: string; subtitle?: ReactNode; stats?: ExecStat[]; actions?: ReactNode; links?: ExecHeaderLink[]; testId?: string
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#0b3d6b] via-[#0b4f8a] to-[#0a2f52] p-4 text-white shadow-lg print:hidden sm:rounded-3xl sm:p-5" data-testid={testId}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#c9a227] via-[#f3d06a] to-[#c9a227]" />
      <div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-[#c9a227]/10" /><div className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-white/5" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/25">{iconNode ?? <Icon name={icon} size={22} className="text-[#f3d06a]" />}</span>
          <div className="min-w-0"><h1 className="text-lg font-black sm:text-xl">{title}</h1>{subtitle && <p className="line-clamp-2 text-[11px] text-blue-100/90">{subtitle}</p>}</div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl className={clsx('relative mt-4 grid gap-2', stats.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:max-w-md')} data-testid={`${testId}-stats`}>
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15" data-testid={s.testId}>
              <dt className="truncate text-[10px] font-bold text-blue-100">{s.label}</dt>
              <dd className={clsx('mt-0.5 text-lg font-black tabular-nums leading-tight', STAT_TONE[s.tone ?? 'plain'])}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {links && links.length > 0 && (
        <nav className="relative mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" aria-label="وحدات أخرى" data-testid={`${testId}-links`}>
          {links.map((l) => <Link key={l.to} to={l.to} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 text-[11px] font-black text-white ring-1 ring-white/20 hover:bg-white hover:text-[#0b3d6b]"><Icon name={l.icon} size={13} className="text-[#f3d06a]" />{l.label}</Link>)}
        </nav>
      )}
    </header>
  )
}

/** زر إجراء داخل الرأس (أبيض/ذهبي) */
export function HeaderButton({ onClick, icon, children, primary = true, testId }: { onClick: () => void; icon: IconName; children: ReactNode; primary?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className={clsx('inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-black shadow transition', primary ? 'bg-white text-[#0b3d6b] hover:bg-blue-50' : 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20')}>
      <Icon name={icon} size={14} className="text-[#c9a227]" />{children}
    </button>
  )
}

/** شريط تبويبات بالهوية نفسها (يُستخدم في وحدات البوابة) */
export function ExecTabBar<K extends string>({ tabs, value, onChange, testId }: { tabs: ReadonlyArray<{ key: K; label: ReactNode; icon?: IconName; badge?: number }>; value: K; onChange: (k: K) => void; testId?: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm [scrollbar-width:none]" role="tablist" data-testid={testId}>
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button key={t.key} type="button" role="tab" aria-selected={active} aria-pressed={active} data-testid={`tab-${t.key}`} onClick={() => onChange(t.key)}
            className={clsx('flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-black transition sm:min-w-0 sm:flex-1', active ? 'bg-gradient-to-l from-[#0b3d6b] to-[#0b4f8a] text-white shadow' : 'text-slate-600 hover:bg-slate-100')}>
            {t.icon && <Icon name={t.icon} size={14} className={active ? 'text-[#f3d06a]' : 'text-slate-400'} />}
            <span>{t.label}</span>
            {t.badge ? <span className={clsx('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-[#c9a227] text-slate-900' : 'bg-red-100 text-red-700')}>{t.badge}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}

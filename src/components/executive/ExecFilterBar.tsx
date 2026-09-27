/** شريط الفلاتر التنفيذي: فترات جاهزة + نطاق مخصص + قاطع + شفت + تحديث (يعمل على الهاتف بصفوف ملتفة) */
import clsx from 'clsx'
import { Icon } from '@components/ui/Icon/Icon'
import { PERIOD_PRESETS, presetRange, type ExecFilters, type ExecFilterOptions, type PeriodPreset, label } from '@features/executive'

const field = 'h-9 rounded-xl border border-slate-300 bg-white px-2 text-xs'

export function ExecFilterBar({ value, onChange, options, onRefresh, isFetching, compact = false, children }: {
  value: ExecFilters; onChange: (f: ExecFilters) => void; options?: ExecFilterOptions | null; onRefresh?: () => void; isFetching?: boolean; compact?: boolean; children?: React.ReactNode
}) {
  const setPreset = (p: PeriodPreset) => { if (p === 'custom') onChange({ ...value, preset: p }); else onChange({ ...value, preset: p, ...presetRange(p) }) }
  const presets = compact ? PERIOD_PRESETS.filter((p) => ['today', 'week', 'month', 'prev_month', 'year', 'custom'].includes(p.key)) : PERIOD_PRESETS
  const groups = new Map<string, ExecFilterOptions['sectors']>()
  for (const s of options?.sectors ?? []) { const g = groups.get(s.parent) ?? []; g.push(s); groups.set(s.parent, g) }
  return (
    <div className="exec-filters flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur print:hidden" data-testid="exec-filters">
      <div className="flex items-center gap-1">
       {onRefresh && <button type="button" onClick={onRefresh} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" title="تحديث" data-testid="refresh"><Icon name="refresh" size={14} className={clsx(isFetching && 'animate-spin')} /></button>}
       <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="الفترة">
        {presets.map((p) => (
          <button key={p.key} type="button" onClick={() => setPreset(p.key)} data-testid={`preset-${p.key}`} aria-pressed={value.preset === p.key}
            className={clsx('h-8 shrink-0 rounded-full px-3 text-[11px] font-bold transition', value.preset === p.key ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{p.label}</button>
        ))}
       </div>
      </div>
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <label className="flex min-w-0 items-center gap-1 text-[11px] text-slate-500">من<input type="date" className={clsx(field, 'min-w-0 flex-1')} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', from: e.target.value })} data-testid="date-from" /></label>
        <label className="flex min-w-0 items-center gap-1 text-[11px] text-slate-500">إلى<input type="date" className={clsx(field, 'min-w-0 flex-1')} value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', to: e.target.value })} data-testid="date-to" /></label>
        <select className={clsx(field, 'min-w-0 sm:max-w-[11rem]')} value={value.sector ?? ''} onChange={(e) => onChange({ ...value, sector: e.target.value ? Number(e.target.value) : null })} data-testid="sector-filter" aria-label="القاطع">
          <option value="">كل القواطع</option>
          {[...groups.entries()].map(([parent, list]) => <optgroup key={parent} label={label(parent)}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
        </select>
        <select className={clsx(field, 'min-w-0')} value={value.shift ?? ''} onChange={(e) => onChange({ ...value, shift: e.target.value || null })} data-testid="shift-filter" aria-label="الشفت">
          <option value="">كل الشفتات</option>
          {(options?.shifts ?? []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {(value.sector || value.shift) && <button type="button" className="text-[11px] font-bold text-red-600 hover:underline" onClick={() => onChange({ ...value, sector: null, shift: null })} data-testid="clear-filters">مسح الفلاتر</button>}
        {children && <div className="col-span-2 sm:col-auto sm:mr-auto">{children}</div>}
      </div>
    </div>
  )
}

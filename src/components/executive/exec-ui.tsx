/**
 * عناصر واجهة الإدارة العليا — مشتركة بين المدير المفوض/التنفيذي/المعاون/المالية، بلا منطق أعمال.
 * الرسوم مبنية يدوياً بـ SVG/CSS (بلا مكتبة): تتمدد مع عرض الشاشة، مقروءة على 360px، تطبع بألوانها،
 * وتُعرض قيمها نصاً بجانب الرسم دائماً (لا اعتماد على tooltip الفأرة).
 */
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { fmtInt, fmtNum, type Insight, type InsightTone } from '@features/executive'
import { PALETTE } from './palette'
export { PALETTE }

export type Tone = 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'cyan'
const TONE_BG: Record<Tone, string> = { slate: 'bg-slate-100 text-slate-700', blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', violet: 'bg-violet-100 text-violet-700', cyan: 'bg-cyan-100 text-cyan-700' }
const TONE_HEX: Record<Tone, string> = { slate: '#475569', blue: '#2563eb', emerald: '#059669', amber: '#d97706', red: '#dc2626', violet: '#7c3aed', cyan: '#0891b2' }

/* ───────────── حاويات ───────────── */
export function Panel({ title, subtitle, icon, action, children, className, testId, tone = 'slate' }: { title: string; subtitle?: string; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string; testId?: string; tone?: Tone }) {
  return (
    <section className={clsx('exec-panel min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4 print:break-inside-avoid print:shadow-none', className)} data-testid={testId}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-xl', TONE_BG[tone])}><Icon name={icon} className="h-4 w-4" /></span>}
          <div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-800">{title}</h3>{subtitle && <p className="text-[11px] leading-4 text-slate-500">{subtitle}</p>}</div>
        </div>
        {action && <div className="shrink-0 print:hidden">{action}</div>}
      </header>
      {children}
    </section>
  )
}

export function SectionTitle({ children, id, hint }: { children: ReactNode; id?: string; hint?: string }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-2 print:mt-4">
      <h2 id={id} className="flex items-center gap-2 text-sm font-black text-slate-700"><span className="h-4 w-1 rounded bg-slate-900" />{children}</h2>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
  )
}

export function Empty({ text = 'لا بيانات في هذه الفترة' }: { text?: string }) { return <p className="grid h-20 place-items-center rounded-xl bg-slate-50 text-xs text-slate-400">{text}</p> }

/* ───────────── أرقام ───────────── */
export function Delta({ value, increaseIsGood = true, suffix = '٪' }: { value: number | null | undefined; increaseIsGood?: boolean; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-[10px] text-slate-400">—</span>
  if (value === 0) return <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">ثابت</span>
  const good = increaseIsGood ? value > 0 : value < 0
  return (
    <span className={clsx('inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10px] font-black tabular-nums', good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')} data-testid="delta" data-good={good}>
      {value > 0 ? '▲' : '▼'} {fmtInt(Math.abs(value))}{suffix}
    </span>
  )
}

export function Kpi({ title, value, unit, delta, increaseIsGood, hint, icon, tone = 'slate', testId, spark }: {
  title: string; value: string | number; unit?: string; delta?: number | null; increaseIsGood?: boolean; hint?: string; icon?: IconName; tone?: Tone; testId?: string; spark?: number[]
}) {
  return (
    <div className="exec-kpi relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm print:break-inside-avoid" data-testid={testId}>
      <span className="absolute inset-y-0 right-0 w-1" style={{ background: TONE_HEX[tone] }} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold leading-4 text-slate-500">{title}</p>
        {icon && <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-lg', TONE_BG[tone])}><Icon name={icon} className="h-3.5 w-3.5" /></span>}
      </div>
      <p className={clsx('flex flex-wrap items-baseline gap-1 font-black leading-6 tabular-nums text-slate-900', String(value).length > 11 ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl')}>{typeof value === 'number' ? fmtNum(value, 1) : value}{unit && <span className="text-xs font-bold text-slate-500">{unit}</span>}</p>
      {spark && spark.length > 1 && <Sparkline values={spark} color={TONE_HEX[tone]} />}
      <div className="flex items-center justify-between gap-1">
        {delta !== undefined ? <Delta value={delta} increaseIsGood={increaseIsGood} /> : <span />}
        {hint && <span className="truncate text-[10px] text-slate-400">{hint}</span>}
      </div>
    </div>
  )
}

/** بطاقة وحدة: رقم رئيسي + دلتا + ثلاثة أرقام فرعية + خط اتجاه — لصفحة المدير المفوض */
export function ScoreCard({ title, icon, tone, value, unit, delta, increaseIsGood, facts, spark, to, testId }: {
  title: string; icon: IconName; tone: Tone; value: string | number; unit?: string; delta?: number | null; increaseIsGood?: boolean; facts: Array<[string, string | number]>; spark?: number[]; to?: string; testId?: string
}) {
  return (
    <div className="exec-kpi flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 print:break-inside-avoid" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-black text-slate-700"><span className={clsx('grid h-7 w-7 place-items-center rounded-lg', TONE_BG[tone])}><Icon name={icon} className="h-4 w-4" /></span>{title}</span>
        {delta !== undefined && <Delta value={delta} increaseIsGood={increaseIsGood} />}
      </div>
      <p className={clsx('mt-2 font-black tabular-nums text-slate-900', String(value).length > 11 ? 'text-lg' : 'text-2xl')}>{typeof value === 'number' ? fmtInt(value) : value}{unit && <span className="mr-1 text-xs font-bold text-slate-500">{unit}</span>}</p>
      {spark && spark.length > 1 && <Sparkline values={spark} color={TONE_HEX[tone]} height={34} />}
      <dl className="mt-2 grid grid-cols-3 gap-1 border-t border-slate-100 pt-2">
        {facts.map(([k, v]) => <div key={k} className="min-w-0"><dt className="truncate text-[10px] text-slate-400">{k}</dt><dd className="truncate text-xs font-black tabular-nums text-slate-700">{typeof v === 'number' ? fmtNum(v, 1) : v}</dd></div>)}
      </dl>
      {to && <a href={to} className="mt-2 text-[11px] font-bold text-blue-700 hover:underline print:hidden">التفاصيل ←</a>}
    </div>
  )
}

/** بند يحتاج قراراً/انتباهاً */
export function DecisionItem({ count, text, tone, icon, to }: { count: number; text: string; tone: Tone; icon: IconName; to?: string }) {
  const inner = (
    <>
      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base font-black tabular-nums', TONE_BG[tone])}>{fmtInt(count)}</span>
      <span className="min-w-0 flex-1 text-xs font-bold leading-4 text-slate-700">{text}</span>
      <Icon name={icon} className="h-4 w-4 shrink-0 text-slate-300" />
    </>
  )
  const cls = 'flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm'
  return to ? <a href={to} className={clsx(cls, 'hover:bg-slate-50')} data-testid="decision-item">{inner}</a> : <div className={cls} data-testid="decision-item">{inner}</div>
}

/* ───────────── الاستنتاجات ───────────── */
const TONE_STYLE: Record<InsightTone, string> = { good: 'border-emerald-200 bg-emerald-50/70 text-emerald-950', bad: 'border-red-200 bg-red-50/70 text-red-950', warn: 'border-amber-200 bg-amber-50/70 text-amber-950', neutral: 'border-slate-200 bg-slate-50 text-slate-800' }
const TONE_ICON: Record<InsightTone, string> = { good: '✔', bad: '✖', warn: '!', neutral: '•' }
const TONE_BADGE: Record<InsightTone, string> = { good: 'bg-emerald-600', bad: 'bg-red-600', warn: 'bg-amber-500', neutral: 'bg-slate-400' }
export function InsightList({ items, limit, testId = 'insights' }: { items: Insight[]; limit?: number; testId?: string }) {
  const list = limit ? items.slice(0, limit) : items
  if (!list.length) return <p className="text-xs text-slate-400">لا توجد بيانات كافية لاستخلاص نتائج في هذه الفترة.</p>
  return (
    <ul className="grid gap-2 md:grid-cols-2" data-testid={testId}>
      {list.map((i) => (
        <li key={i.id} className={clsx('flex gap-2 rounded-2xl border px-3 py-2 text-[13px] leading-6 print:break-inside-avoid', TONE_STYLE[i.tone])} data-tone={i.tone}>
          <span className={clsx('mt-1.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-black text-white', TONE_BADGE[i.tone])}>{TONE_ICON[i.tone]}</span>
          <span><span className="ml-1 rounded bg-white/80 px-1 text-[10px] font-black text-slate-600">{i.domain}</span>{i.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function HealthGauge({ score, label, compact = false }: { score: number; label: string; compact?: boolean }) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - score / 100)
  const color = score >= 85 ? '#059669' : score >= 70 ? '#2563eb' : score >= 50 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-3" data-testid="health-gauge" data-score={score}>
      <svg width={compact ? 64 : 88} height={compact ? 64 : 88} viewBox="0 0 88 88" className="-rotate-90 shrink-0">
        <circle cx="44" cy="44" r={r} stroke="#e2e8f0" strokeWidth="9" fill="none" />
        <circle cx="44" cy="44" r={r} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
        <text x="44" y="44" transform="rotate(90 44 44)" textAnchor="middle" dominantBaseline="central" className="fill-slate-900 text-xl font-black">{score}</text>
      </svg>
      <div><p className="text-[11px] text-slate-500">مؤشر الأداء العام</p><p className="text-base font-black" style={{ color }}>{label}</p>{!compact && <p className="text-[10px] text-slate-400">حضور · إنجاز الشكاوى · مخالفات المحطة · الصيانة</p>}</div>
    </div>
  )
}

/* ───────────── الرسوم (SVG/CSS خالصة) ───────────── */
const shortDay = (d: string) => d.slice(5).replace('-', '/')
const W = 600 // عرض منطقي؛ يتمدد مع الحاوية عبر viewBox
/** منحنى ناعم (Catmull-Rom → Bézier) يمر بكل النقاط */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]},${pts[0]![1]}` : ''
  let d = `M${pts[0]![0]},${pts[0]![1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}

export function Sparkline({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0)
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${100 - ((v - min) / (max - min || 1)) * 100}`)
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height, direction: 'ltr' }} aria-hidden>
      <polyline points={`0,100 ${pts.join(' ')} 100,100`} fill={color} opacity={0.12} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** اتجاه زمني (مساحة) لسلسلة واحدة أو أكثر — المحاور نصية HTML فتبقى مقروءة على أي عرض */
export function TrendArea({ data, keys, height = 150, testId }: { data: ReadonlyArray<Record<string, string | number>>; keys: Array<{ key: string; name: string; color?: string }>; height?: number; testId?: string }) {
  if (!data.length) return <Empty />
  const H = 100
  const vals = (k: string) => data.map((d) => Number(d[k] ?? 0))
  const max = Math.max(1, ...keys.flatMap((k) => vals(k.key)))
  const x = (i: number) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W)
  const y = (v: number) => H - (v / max) * H
  const totals = keys.map((k) => vals(k.key).reduce((s, v) => s + v, 0))
  const peakIdx = vals(keys[0]!.key).reduce((b, v, i, a) => (v > (a[b] ?? 0) ? i : b), 0)
  const ticks = data.length <= 4 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 3), Math.floor(((data.length - 1) * 2) / 3), data.length - 1]
  return (
    <div data-testid={testId} className="exec-chart w-full min-w-0" data-points={data.length}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="flex flex-wrap gap-x-3">{keys.map((k, i) => <span key={k.key} className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: k.color ?? PALETTE[i] }} />{k.name}: <b className="tabular-nums">{fmtNum(totals[i], 1)}</b></span>)}</span>
        <span className="text-slate-400">الذروة {fmtNum(max, 1)} يوم {shortDay(String(data[peakIdx]!.d))}</span>
      </div>
      <div className="relative" style={{ height }}>
        <span className="absolute left-0 top-0 rounded bg-white/80 px-1 text-[10px] tabular-nums text-slate-400">{fmtNum(max, 0)}</span>
        <span className="absolute bottom-0 left-0 rounded bg-white/80 px-1 text-[10px] text-slate-400">0</span>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" style={{ direction: 'ltr' }} aria-hidden>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="#e2e8f0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
          {keys.map((k, i) => {
            const v = vals(k.key), color = k.color ?? PALETTE[i]!
            const path = smoothPath(v.map((n, j) => [x(j), Math.min(H, Math.max(0, y(n)))]))
            return <g key={k.key}><path d={`${path} L${x(v.length - 1)},${H} L${x(0)},${H} Z`} fill={color} opacity={0.14} /><path d={path} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" /></g>
          })}
        </svg>
        {/* نقاط الذروة وآخر يوم بقيمهما نصاً */}
        {data.length > 1 && [peakIdx, data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => {
          const v = Number(data[i]![keys[0]!.key] ?? 0)
          return <span key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-full border border-slate-200 bg-white px-1 text-[10px] font-black tabular-nums shadow-sm" style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(v) / H) * 100}%`, direction: 'ltr' }}>{fmtNum(v, 1)}</span>
        })}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-slate-400" style={{ direction: 'ltr' }}>
        {ticks.map((i) => <span key={i} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(x(i) / W) * 100}%` }}>{shortDay(String(data[i]!.d))}</span>)}
      </div>
    </div>
  )
}

/** أعمدة أفقية HTML — الاسم كاملاً فوق العمود، القيمة بجانبه: لا قصّ للأسماء العربية على الهاتف */
export function BarsH({ data, valueKey = 'count', nameKey = 'name', color = PALETTE[0]!, max: maxProp, format = (v: number) => fmtNum(v, 1), testId, limit = 8 }: {
  data: ReadonlyArray<object>; valueKey?: string; nameKey?: string; color?: string; max?: number; format?: (v: number) => string; testId?: string; limit?: number
}) {
  const rows = (data as Array<Record<string, string | number>>).slice(0, limit).map((r) => ({ name: String(r[nameKey] ?? ''), v: Number(r[valueKey] ?? 0) }))
  if (!rows.length) return <Empty />
  const max = maxProp ?? Math.max(1, ...rows.map((r) => r.v)), total = rows.reduce((s, r) => s + r.v, 0)
  return (
    <ul className="exec-chart space-y-1.5" data-testid={testId}>
      {rows.map((r, i) => (
        <li key={`${r.name}-${i}`} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="truncate font-semibold text-slate-700">{r.name}</span><span className="shrink-0 font-black tabular-nums text-slate-800">{format(r.v)}{total > 0 && <span className="mr-1 font-normal text-slate-400">({Math.round((r.v / total) * 100)}٪)</span>}</span></div>
          <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.v / max) * 100)}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** أعمدة مكدّسة يومية (CSS): كل يوم عمود، والمقاطع بالألوان؛ الأيام الكثيرة تُضغط تلقائياً */
export function StackedBars({ data, keys, height = 140, testId }: { data: ReadonlyArray<Record<string, string | number>>; keys: Array<{ key: string; name: string; color: string }>; height?: number; testId?: string }) {
  if (!data.length) return <Empty />
  const sum = (d: Record<string, string | number>) => keys.reduce((s, k) => s + Number(d[k.key] ?? 0), 0)
  const max = Math.max(1, ...data.map(sum))
  const totals = keys.map((k) => data.reduce((s, d) => s + Number(d[k.key] ?? 0), 0))
  const step = Math.ceil(data.length / 6)
  return (
    <div className="exec-chart w-full min-w-0" data-testid={testId}>
      <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">{keys.map((k, i) => <span key={k.key} className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: k.color }} />{k.name}: <b className="tabular-nums">{fmtInt(totals[i])}</b></span>)}</div>
      <div className="flex items-end gap-px rounded-lg border-b border-slate-200" style={{ height, direction: 'ltr' }}>
        {data.map((d, i) => (
          <div key={String(d.d)} className="group relative flex h-full min-w-0 flex-1 flex-col-reverse" title={`${shortDay(String(d.d))}: ${keys.map((k) => `${k.name} ${fmtInt(Number(d[k.key] ?? 0))}`).join(' · ')}`}>
            {keys.map((k) => <div key={k.key} style={{ height: `${(Number(d[k.key] ?? 0) / max) * 100}%`, background: k.color }} className={clsx(i % 2 ? 'opacity-90' : '')} />)}
          </div>
        ))}
      </div>
      <div className="mt-1 flex text-[10px] text-slate-400" style={{ direction: 'ltr' }}>
        {data.map((d, i) => <span key={String(d.d)} className="min-w-0 flex-1 truncate text-center tabular-nums">{i % step === 0 || i === data.length - 1 ? shortDay(String(d.d)) : ''}</span>)}
      </div>
    </div>
  )
}

/** حلقة نسب مع قائمة كاملة القيم */
export function Donut({ data, size = 112, testId }: { data: Array<{ name: string; value: number }>; size?: number; testId?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <Empty />
  const r = 40, c = 2 * Math.PI * r
  let acc = 0
  const segs = data.map((d, i) => { const len = (d.value / total) * c, off = acc; acc += len; return { ...d, len, off, color: PALETTE[i % PALETTE.length]! } })
  return (
    <div className="flex min-w-0 items-center gap-3" data-testid={testId}>
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90 shrink-0" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        {segs.map((s) => <circle key={s.name} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${Math.max(s.len - 1.5, 0)} ${c}`} strokeDashoffset={-s.off} />)}
        <text x="50" y="50" transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="central" className="fill-slate-900 text-[18px] font-black">{fmtInt(total)}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-[11px]">
        {segs.slice(0, 7).map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} /><span className="truncate">{s.name}</span></span><span className="shrink-0 font-bold tabular-nums">{fmtInt(s.value)} <span className="text-slate-400">({Math.round((s.value / total) * 100)}٪)</span></span></li>
        ))}
        {segs.length > 7 && <li className="text-slate-400">+{segs.length - 7} أخرى</li>}
      </ul>
    </div>
  )
}

/** شريط تقدّم (مصروف من مخصص، إنجاز من إجمالي…) */
export function Progress({ value, max, color = PALETTE[0]!, label, format = (v: number) => fmtNum(v, 0) }: { value: number; max: number; color?: string; label: string; format?: (v: number) => string }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="truncate font-semibold text-slate-700">{label}</span><span className="shrink-0 tabular-nums"><b>{format(value)}</b> <span className="text-slate-400">من {format(max)} · {p}٪</span></span></div>
      <div className="mt-0.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 90 ? '#dc2626' : p >= 75 ? '#d97706' : color }} /></div>
    </div>
  )
}

export function MiniTable({ rows, cols, testId }: { rows: Array<Array<string | number>>; cols: string[]; testId?: string }) {
  if (!rows.length) return <Empty />
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full text-[12px]">
        <thead><tr className="border-b border-slate-200 text-slate-500">{cols.map((c) => <th key={c} className="py-1.5 text-right font-semibold first:pr-1 last:text-left">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-100 last:border-0">{r.map((c, j) => <td key={j} className={clsx('py-1.5 first:pr-1', j > 0 && 'text-left font-bold tabular-nums')}>{typeof c === 'number' ? fmtNum(c, 1) : c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

/** قسم قابل للطيّ على الهاتف، مفتوح دائماً على الشاشات الكبيرة وفي الطباعة */
export function Collapsible({ title, children, defaultOpen = false, testId }: { title: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div data-testid={testId}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 lg:hidden print:hidden">{title}<Icon name={open ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" /></button>
      <div className={clsx(open ? 'mt-2 block' : 'hidden', 'lg:block print:block')}>{children}</div>
    </div>
  )
}

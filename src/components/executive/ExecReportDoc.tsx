/**
 * عناصر «وثيقة التقرير» الرسمية (00217) — ما يراه المدير المفوض ويُطبع:
 *   · الموجز التنفيذي: ستة مؤشرات بحكم واضح (تحسّن/تراجع/مستقر/لا نشاط) + الخلاصة في نقاط مرقّمة + جدول «قرارات مطلوبة» بجهة مسؤولة
 *   · جدول المؤشرات مجمّعاً حسب الوحدة، والوحدات بلا نشاط تُطوى في سطر واحد بدل أعمدة أصفار
 *   · «أرقام القسم» في رأس كل قسم، و«لا نشاط مسجّل» بدل رسوم فارغة
 * قاعدة ثابتة: لا نُظهر «ممتاز» ولا نسب تغيّر حين لا توجد بيانات تكفي.
 */
import clsx from 'clsx'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import {
  attendanceRate, buildDecisions, buildExecSheets, fmtInt, fmtMoney, fmtNum, healthScore, label, scopeOf,
  type Decision, type ExecOverview, type ExecPortalKind, type Insight, type SectionKey,
} from '@features/executive'
import { HealthGauge } from './exec-ui'

export const NAVY = '#0b3d6b'
const BAD_IF_UP = /شكاو|غياب|مخالف|كشوف|صيانة|كلفة|استقطاع|إنهاء|مشتريات|إنفاق|عجز|قيد/

/* ───────────── حكم التغيّر ───────────── */
export type Verdict = { kind: 'up' | 'down' | 'flat' | 'new' | 'none' | 'na'; pct: number | null; good: boolean | null; text: string }
/** يحوّل (الحالي، السابق) إلى حكم مقروء: لا نسب مئوية وهمية حين يكون السابق صفراً */
export function verdict(cur: number, prev: number | null | undefined, name: string, hasPrev: boolean): Verdict {
  if (!hasPrev || prev === null || prev === undefined) return { kind: 'na', pct: null, good: null, text: 'بلا مقارنة' }
  if (!prev && !cur) return { kind: 'none', pct: null, good: null, text: 'لا نشاط' }
  if (!prev) return { kind: 'new', pct: null, good: BAD_IF_UP.test(name) ? false : true, text: 'جديد' }
  const p = Math.round(((cur - prev) / prev) * 100)
  if (p === 0) return { kind: 'flat', pct: 0, good: null, text: 'مستقر' }
  const good = BAD_IF_UP.test(name) ? p < 0 : p > 0
  return { kind: p > 0 ? 'up' : 'down', pct: p, good, text: `${p > 0 ? '▲' : '▼'} ${Math.abs(p)}٪` }
}
export function VerdictChip({ v, muted = false }: { v: Verdict; muted?: boolean }) {
  const cls = v.good === null ? (v.kind === 'none' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-600') : v.good ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'
  return <span className={clsx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums', cls, muted && 'opacity-70')} data-verdict={v.kind}>{v.text}{v.good === null ? '' : v.good ? ' · تحسّن' : ' · تراجع'}</span>
}

/* ───────────── الموجز التنفيذي ───────────── */
const OWNER: Record<Decision['icon'], string> = { wallet: 'الشؤون المالية', calendar: 'المدراء المباشرون', clipboard: 'وحدة الشكاوى', settings: 'الكراج المركزي / الصيانة', truck: 'غرفة العمليات', 'alert-triangle': 'الموارد البشرية' }
const BRIEF_PICK = ['الشكاوى الواردة', 'شكاوى قيد المعالجة', 'انطلاقات الآليات', 'أطنان المحطة التحويلية', 'نسبة الحضور ٪', 'كشوفات المخالفات']
const BRIEF_PICK_FIN = ['صافي كشف الرواتب (د.ع)', 'الاستقطاعات (د.ع)', 'الإنفاق التشغيلي (د.ع)', 'مشتريات الصيانة (د.ع)', 'الملاك الفعلي', 'أيام الاستقطاع المقترحة']

export function Brief({ o, p, insights, kind }: { o: ExecOverview; p: ExecOverview | null; insights: Insight[]; kind: ExecPortalKind }) {
  const scope = scopeOf(kind)
  const sheet = buildExecSheets(o, [], p, scope)[0]!
  const pick = scope === 'finance' ? BRIEF_PICK_FIN : BRIEF_PICK
  const rows = pick.map((n) => sheet.rows.find((r) => r[0] === n)).filter(Boolean) as Array<Array<string | number | null>>
  const decisions: Decision[] = kind === 'finance' ? buildDecisions(o).filter((d) => d.icon === 'wallet') : buildDecisions(o)
  const health = healthScore(o)
  const findings = insights.slice(0, 5)
  return (
    <section id="rep-brief" className="exec-brief scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="rep-brief">
      <header className="flex items-start justify-between gap-3 border-b-4 px-4 py-3 sm:px-5" style={{ borderColor: NAVY }}>
        <div><p className="text-[10px] font-bold tracking-wide text-slate-500">صفحة القرار</p><h2 className="text-lg font-black" style={{ color: NAVY }}>الموجز التنفيذي</h2><p className="text-[11px] text-slate-500">ما يلزم معرفته في دقيقة واحدة — التفاصيل في الأقسام المرقّمة</p></div>
        {kind !== 'finance' && (health.basis ? <HealthGauge score={health.score} label={health.label} compact /> : <span className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-500" data-testid="health-na">مؤشر الأداء: لا بيانات كافية</span>)}
      </header>

      <div className="grid grid-cols-2 divide-x divide-x-reverse divide-slate-200 border-b border-slate-200 sm:grid-cols-3 lg:grid-cols-6" data-testid="rep-brief-kpis">
        {rows.map((r) => {
          const name = String(r[0]), cur = Number(r[1] ?? 0), prevV = p ? Number(r[2] ?? 0) : null
          const v = verdict(cur, prevV, name, !!p)
          const money = /د\.ع/.test(name)
          return (
            <div key={name} className="exec-brief-card px-3 py-3">
              <p className="truncate text-[11px] font-bold text-slate-500">{name.replace(' (د.ع)', '').replace(' ٪', '')}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{money ? fmtInt(cur) : fmtNum(cur, 1)}<span className="mr-1 text-[10px] font-bold text-slate-400">{money ? 'د.ع' : /٪/.test(name) ? '٪' : ''}</span></p>
              <div className="mt-1 flex flex-wrap items-center gap-1"><VerdictChip v={v} />{p && v.kind !== 'na' && <span className="text-[10px] tabular-nums text-slate-400">السابق {money ? fmtInt(prevV ?? 0) : fmtNum(prevV ?? 0, 1)}</span>}</div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-x-reverse lg:divide-slate-200">
        <div className="p-4 sm:p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><Icon name="activity" size={14} className="text-[#c9a227]" />الخلاصة في {findings.length ? ARABIC_N[findings.length] ?? findings.length : ''} نقاط</h3>
          {findings.length ? (
            <ol className="space-y-2" data-testid="rep-brief-findings">
              {findings.map((i, n) => (
                <li key={i.id} className="flex gap-2 text-[12.5px] leading-6 text-slate-800" data-tone={i.tone}>
                  <span className={clsx('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black text-white', TONE_DOT[i.tone])}>{n + 1}</span>
                  <span><b className="text-slate-900">{i.domain}:</b> {i.text}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-xs text-slate-400">لا توجد بيانات كافية لاستخلاص نتائج في هذه الفترة.</p>}
        </div>
        <div className="border-t border-slate-200 p-4 sm:p-5 lg:border-t-0" data-testid="rep-brief-decisions">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><Icon name="check-square" size={14} className="text-[#c9a227]" />قرارات مطلوبة</h3>
          {decisions.length ? (
            <table className="w-full text-[12px]">
              <thead><tr className="text-[10px] text-slate-500"><th className="pb-1 text-right font-bold">#</th><th className="pb-1 text-right font-bold">البند</th><th className="pb-1 text-center font-bold">العدد</th><th className="pb-1 text-right font-bold">الجهة</th></tr></thead>
              <tbody>
                {decisions.map((d, n) => (
                  <tr key={d.text} className="border-t border-slate-100" data-testid="decision-row">
                    <td className="py-1.5 pl-2 text-slate-400">{n + 1}</td>
                    <td className="py-1.5 font-bold text-slate-800">{d.text}</td>
                    <td className="py-1.5 text-center"><span className={clsx('inline-grid h-6 min-w-6 place-items-center rounded-md px-1 text-xs font-black tabular-nums', DEC_TONE[d.tone] ?? 'bg-slate-100 text-slate-700')}>{fmtInt(d.count)}</span></td>
                    <td className="py-1.5 text-[11px] text-slate-600">{OWNER[d.icon] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">لا توجد بنود معلّقة تحتاج قراراً في هذه الفترة.</p>}
        </div>
      </div>
    </section>
  )
}
const ARABIC_N: Record<number, string> = { 1: 'نقطة واحدة', 2: 'نقطتين', 3: 'ثلاث', 4: 'أربع', 5: 'خمس' }
const TONE_DOT: Record<Insight['tone'], string> = { good: 'bg-emerald-600', bad: 'bg-red-600', warn: 'bg-amber-500', neutral: 'bg-slate-400' }
const DEC_TONE: Record<string, string> = { red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-800', blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700', slate: 'bg-slate-100 text-slate-700' }

/* ───────────── جدول المؤشرات المجمّع ───────────── */
const GROUP_OF: Array<[RegExp, string, IconName]> = [
  [/شكاو/, 'الشكاوى', 'clipboard'], [/انطلاق|الرحلة|صيانة/, 'الأسطول والصيانة', 'truck'], [/المحطة|حمولة/, 'المحطة التحويلية', 'scale'], [/كشوفات/, 'الميدان', 'alert-triangle'],
  [/حضور|غياب|الملاك|استقطاع/, 'القوى العاملة', 'users'], [/رواتب|موازنة|إنفاق|مشتريات|مخصصات|موظفو الكشف|الراتب|الشراء/, 'المالية', 'wallet'], [/إعلام|تجهيز/, 'الإعلام والتجهيز', 'camera'],
]
export function IndicatorsTable({ o, p, kind }: { o: ExecOverview; p: ExecOverview | null; kind: ExecPortalKind }) {
  const scope = scopeOf(kind)
  const sheet = buildExecSheets(o, [], p, scope)[0]!
  const groups = new Map<string, { icon: IconName; rows: typeof sheet.rows }>()
  for (const r of sheet.rows) {
    const name = String(r[0]); const g = GROUP_OF.find(([re]) => re.test(name)) ?? [/./, 'أخرى', 'list' as IconName]
    const e = groups.get(g[1]) ?? { icon: g[2], rows: [] as typeof sheet.rows }; e.rows.push(r); groups.set(g[1], e)
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200" data-testid="rep-summary">
      <table className="w-full text-[12px]">
        <thead><tr className="text-white" style={{ background: NAVY }}><th className="px-3 py-2 text-right font-black">المؤشر</th><th className="px-3 py-2 text-left font-black">الفترة الحالية</th>{p && <th className="px-3 py-2 text-left font-black">الفترة السابقة</th>}{p && <th className="px-3 py-2 text-right font-black">الحكم</th>}</tr></thead>
        <tbody>
          {[...groups.entries()].map(([g, { icon, rows }]) => {
            const idle = rows.every((r) => !Number(r[1] ?? 0) && (!p || !Number(r[2] ?? 0)))
            return [
              <tr key={`${g}-h`} className="bg-slate-50"><td colSpan={p ? 4 : 2} className="px-3 py-1.5 text-[11px] font-black text-slate-700"><span className="inline-flex items-center gap-1.5"><Icon name={icon} size={13} className="text-[#c9a227]" />{g}</span></td></tr>,
              ...(idle
                ? [<tr key={`${g}-idle`} data-testid="group-idle"><td className="px-3 py-1.5 text-[11px] text-slate-400" colSpan={p ? 4 : 2}>لا نشاط مسجّل في هذه الفترة{p ? ' ولا في الفترة السابقة' : ''}.</td></tr>]
                : rows.map((r) => {
                  const name = String(r[0]), cur = Number(r[1] ?? 0), prevV = p ? Number(r[2] ?? 0) : null, money = /د\.ع/.test(name)
                  const fmt = (n: number) => (money ? fmtInt(n) : fmtNum(n, 1))
                  return (
                    <tr key={name} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/40">
                      <td className="px-3 py-1.5 text-slate-700">{name}</td>
                      <td className="px-3 py-1.5 text-left font-black tabular-nums text-slate-900">{fmt(cur)}</td>
                      {p && <td className="px-3 py-1.5 text-left tabular-nums text-slate-500">{fmt(prevV ?? 0)}</td>}
                      {p && <td className="px-3 py-1.5"><VerdictChip v={verdict(cur, prevV, name, true)} /></td>}
                    </tr>
                  )
                })),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ───────────── أرقام القسم + لا نشاط ───────────── */
type Fig = { label: string; value: string | number; hint?: string }
export function sectionFigures(k: SectionKey, o: ExecOverview): Fig[] | null {
  const a = o.workforce.attendance, rate = attendanceRate(a), f = o.finance
  switch (k) {
    case 'complaints': return [{ label: 'الواردة', value: fmtInt(o.complaints.total) }, { label: 'المنجزة', value: o.complaints.total ? `${Math.round((o.complaints.resolved / o.complaints.total) * 100)}٪` : '—', hint: `${fmtInt(o.complaints.resolved)} شكوى` }, { label: 'قيد المعالجة', value: fmtInt(o.complaints.open) }, { label: 'أبرز نوع', value: o.complaints.by_type[0]?.name ?? '—' }]
    case 'fleet': return [{ label: 'الانطلاقات', value: fmtInt(o.fleet.departures) }, { label: 'الآليات', value: fmtInt(o.fleet.vehicles) }, { label: 'متوسط الرحلة', value: `${fmtNum(o.fleet.avg_hours)} س` }, { label: 'في الصيانة الآن', value: fmtInt(o.fleet.maintenance.open_now), hint: `${fmtInt(o.fleet.breakdowns)} بلاغ عطل` }]
    case 'station': return [{ label: 'الأطنان', value: fmtNum(o.station.tons) }, { label: 'عمليات الوزن', value: fmtInt(o.station.weighings) }, { label: 'مخالفات النقص', value: fmtInt(o.station.violations) }, { label: 'العجز', value: `${fmtNum(o.station.deficit_tons)} طن` }]
    case 'workforce': case 'workforce_cost': return [{ label: 'الملاك الفعلي', value: fmtInt(o.workforce.active) }, { label: 'نسبة الحضور', value: rate === null ? '—' : `${rate}٪` }, { label: 'أيام الغياب', value: fmtInt(a.absent) }, { label: 'التأخير', value: fmtInt(a.late), hint: a.deduction_days ? `${fmtNum(a.deduction_days)} يوم استقطاع مقترح` : undefined }]
    case 'disclosures': return [{ label: 'الكشوفات', value: fmtInt(o.disclosures.total) }, { label: 'أبرز مخالفة', value: o.disclosures.by_violation[0] ? label(o.disclosures.by_violation[0].name) : '—' }, { label: 'أكثر متعهد', value: o.disclosures.by_contractor[0]?.name ?? '—' }, { label: 'قيد الموافقة', value: fmtInt(o.disclosures.by_status.find((s) => s.key === 'pending')?.count ?? 0) }]
    case 'supplies': case 'support': return [{ label: 'طلبات التجهيز', value: fmtInt(o.supplies.total) }, { label: 'حاويات GBS', value: fmtInt(o.gbs.total), hint: `${fmtInt(o.gbs.updates)} تحديثاً` }, { label: 'أنشطة الإعلام', value: fmtInt(o.media.submissions) }, { label: 'الصور', value: fmtInt(o.media.photos) }]
    case 'finance': case 'payroll': case 'budget': case 'spend': return [{ label: 'صافي الرواتب', value: fmtMoney(f.payroll?.final_total ?? 0), hint: f.payroll ? `${f.payroll.month.slice(0, 7)} · ${label(f.payroll.status)}` : 'لا كشف' }, { label: 'الإنفاق التشغيلي', value: fmtMoney(f.purchases.total + f.maintenance_cost) }, { label: 'الموازنة', value: f.budget.allocated ? `${Math.round((f.budget.spent / f.budget.allocated) * 100)}٪` : '—', hint: f.budget.allocated ? 'نسبة الصرف' : undefined }, { label: 'أوامر الشراء', value: fmtInt(f.purchases.orders) }]
    case 'sectors': return [{ label: 'قواطع نشطة', value: fmtInt(o.fleet.by_sector.length) }, { label: 'الأكثر شكاوى', value: o.complaints.by_sector[0] ? label(o.complaints.by_sector[0].name) : '—' }, { label: 'الأعلى انطلاقات', value: o.fleet.by_sector[0]?.name ?? '—' }, { label: 'طلبات التجهيز', value: fmtInt(o.supplies.total) }]
    default: return null
  }
}
export function SectionFigures({ figs, testId }: { figs: Fig[]; testId?: string }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-4" data-testid={testId}>
      {figs.map((f, i) => (
        <div key={f.label} className={clsx('px-3 py-2', i % 2 === 1 && 'border-r border-slate-200', i >= 2 && 'border-t border-slate-200 sm:border-t-0', i > 0 && 'sm:border-r')}>
          <dt className="text-[10px] font-bold text-slate-500">{f.label}</dt>
          <dd className="truncate text-base font-black tabular-nums text-slate-900">{f.value}</dd>
          {f.hint && <dd className="truncate text-[10px] text-slate-400">{f.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

/** هل في القسم بيانات تستحق رسوماً؟ وإلا نعرض سطراً واحداً واضحاً */
export function sectionHasData(k: SectionKey, o: ExecOverview): boolean {
  switch (k) {
    case 'complaints': return o.complaints.total > 0
    case 'fleet': return o.fleet.departures > 0 || o.fleet.maintenance.opened > 0 || o.fleet.maintenance.open_now > 0
    case 'station': return o.station.weighings > 0
    case 'workforce': case 'workforce_cost': return o.workforce.active > 0 || attendanceRate(o.workforce.attendance) !== null
    case 'disclosures': return o.disclosures.total > 0
    case 'supplies': return o.supplies.total > 0 || o.gbs.total > 0
    case 'support': return o.media.submissions > 0 || o.gbs.total > 0
    case 'sectors': return o.fleet.by_sector.length > 0 || o.complaints.by_sector.length > 0
    case 'finance': case 'payroll': case 'budget': case 'spend': return !!o.finance.payroll || o.finance.purchases.total > 0 || o.finance.maintenance_cost > 0 || o.finance.budget.allocated > 0
    default: return true
  }
}
export function NoActivity({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-slate-500" data-testid="no-activity">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-200"><Icon name="archive-box" size={16} /></span>
      <div><p className="text-xs font-black text-slate-700">لا نشاط مسجّل في {what} خلال هذه الفترة</p><p className="text-[11px]">لم تُسجَّل أي حركة في المنصة لهذا القسم، لذلك لا تُعرض رسوم أو جداول بأصفار.</p></div>
    </div>
  )
}

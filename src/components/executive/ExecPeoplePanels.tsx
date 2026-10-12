/**
 * 00218 — قسم «الأشخاص» في التقرير التنفيذي.
 * ترتيب القراءة: ملخّص → السائقون مقابل البصمات → الأكثر غياباً → الأكثر تأخراً → الأكثر التزاماً → الأكثر كشوفات → الأكثر استقطاعاً هذا الشهر.
 * الأرقام بأرقام لاتينية (حضور/مالية). كل جدول بحالة فارغة واضحة. بلا أي فعل تحريري — عرض فقط.
 */
import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { fmtInt, fmtMoney, useExecPeople, type ExecPeople, type ExecPortalKind } from '@features/executive'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

const NAVY = '#0b3d6b'
const GOLD = '#c9a227'
const mins = (m: number | null | undefined) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)} س ${m % 60} د` : `${fmtInt(m)} د`)
const who = (r: { name: string; number: string | null; department: string }) => (
  <div className="min-w-0"><p className="truncate font-black text-slate-800">{r.name}</p><p className="truncate text-[10px] text-slate-400">{r.number ? `${r.number} · ` : ''}{r.department}</p></div>
)

export function ExecPeoplePanels({ from, to, kind }: { from: string; to: string; kind: ExecPortalKind }) {
  const { data, isLoading, error } = useExecPeople(from, to)
  if (isLoading) return <LoadingSpinner />
  if (error) return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">تعذر تحميل بيانات الأشخاص</p>
  if (!data) return null
  return <ExecPeopleBody data={data} kind={kind} />
}

/** الجسم مفصول عن الخطاف ليُستخدم في الاختبارات ومن المعاينة */
export function ExecPeopleBody({ data: d, kind }: { data: ExecPeople; kind: ExecPortalKind }) {
  const showMoney = kind === 'admin' || kind === 'finance'
  const s = d.summary
  const chips: Array<{ label: string; value: string; tone: 'navy' | 'emerald' | 'red' | 'amber' | 'slate' }> = [
    { label: 'موظفون لهم سجل حضور', value: fmtInt(s.employees), tone: 'navy' },
    { label: 'سجل مثالي (لا غياب ولا تأخير)', value: fmtInt(s.perfect), tone: 'emerald' },
    { label: 'لديهم غياب', value: fmtInt(s.with_absence), tone: s.with_absence ? 'red' : 'slate' },
    { label: 'عليهم كشوفات', value: fmtInt(s.with_disclosures), tone: s.with_disclosures ? 'amber' : 'slate' },
    { label: `مستقطَع منهم في ${s.deduction_month}`, value: fmtInt(s.deducted), tone: s.deducted ? 'amber' : 'slate' },
  ]
  const drv = d.drivers
  const drvPct = drv.dep_days ? Math.round((drv.punched_days * 100) / drv.dep_days) : null
  return (
    <div className="space-y-4" data-testid="exec-people">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="people-summary">
        {chips.map((c) => (
          <li key={c.label} className={clsx('rounded-xl border px-3 py-2', c.tone === 'navy' && 'border-[#0b3d6b]/20 bg-[#0b3d6b]/5', c.tone === 'emerald' && 'border-emerald-200 bg-emerald-50', c.tone === 'red' && 'border-red-200 bg-red-50', c.tone === 'amber' && 'border-amber-200 bg-amber-50', c.tone === 'slate' && 'border-slate-200 bg-slate-50')}>
            <p className="text-[10px] font-bold text-slate-500">{c.label}</p><p className="text-xl font-black tabular-nums text-slate-900" dir="ltr">{c.value}</p>
          </li>
        ))}
      </ul>

      <Block n="أ" title="بصمات السائقين مقابل الانطلاقات" icon="fingerprint" testId="people-drivers"
        subtitle={drv.dep_days ? `${fmtInt(drv.drivers)} سائق · ${fmtInt(drv.dep_days)} يوم انطلاق · بصمة في ${fmtInt(drv.punched_days)} يوماً (${drvPct}%)` : 'لا انطلاقات مربوطة بسائق من ملاك الموظفين في هذه الفترة'}
        flag={drv.unlinked_departures ? `${fmtInt(drv.unlinked_departures)} انطلاقة بلا سائق مربوط بالملاك — لا يمكن مطابقتها مع البصمة` : undefined}>
        {drv.rows.length ? (
          <Table cols={['السائق', 'أيام الانطلاق', 'الرحلات', 'أيام ببصمة', 'أيام بلا بصمة', 'المطابقة']}
            rows={drv.rows.map((r) => [who(r), fmtInt(r.dep_days), fmtInt(r.trips), fmtInt(r.punched_days), <Bad key="m" v={r.missing_days} />, <Pct key="p" v={r.match_pct} goodAbove={90} />])} />
        ) : <EmptyRow text="لا انطلاقات مربوطة بسائقين خلال الفترة" />}
        <Note>المطابقة = الأيام التي انطلق فيها السائق ووُجدت له بصمة في اليوم نفسه. يوم بلا بصمة يعني انطلاقاً مسجّلاً في الكراج دون أثر على جهاز الحضور — يُراجع مع غرفة العمليات والتطوير المركزية.</Note>
      </Block>

      <Block n="ب" title="الأكثر غياباً" icon="alert-triangle" tone="red" testId="people-absent" subtitle="مرتّبون بعدد أيام الغياب ثم التأخير · أيام العمل = الأيام غير أيام الراحة">
        {d.absent.length ? (
          <Table cols={['الموظف', 'غياب', 'تأخير', 'حضور', 'إجازة', 'أيام العمل', 'نسبة الغياب', 'أيام الاستقطاع']}
            rows={d.absent.map((r) => [who(r), <Bad key="a" v={r.absent} />, fmtInt(r.late), fmtInt(r.present), fmtInt(r.leave), fmtInt(r.working_days), <Pct key="p" v={r.absent_pct} invert />, r.deduction_days ? Number(r.deduction_days).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'])} />
        ) : <EmptyRow text="لا غياب مسجّل خلال الفترة" tone="emerald" />}
      </Block>

      <Block n="ج" title="الأكثر تأخراً" icon="calendar" tone="amber" testId="people-late" subtitle="مجموع دقائق التأخير عن وقت الدخول المتوقع">
        {d.late.length ? (
          <Table cols={['الموظف', 'أيام التأخير', 'مجموع التأخير', 'متوسط اليوم', 'أيام العمل']}
            rows={d.late.map((r) => [who(r), fmtInt(r.late_days), <span key="m" className="font-black text-amber-700">{mins(r.late_minutes)}</span>, mins(r.avg_late), fmtInt(r.working_days)])} />
        ) : <EmptyRow text="لا تأخير مسجّل خلال الفترة" tone="emerald" />}
      </Block>

      <Block n="د" title="الأكثر التزاماً" icon="check" tone="emerald" testId="people-committed" subtitle="لا غياب، أقل تأخير، وصول مبكر — يُشترط ثلاثة أيام عمل على الأقل ضمن الفترة">
        {d.committed.length ? (
          <Table cols={['الموظف', 'أيام العمل', 'الحضور', 'نسبة الحضور', 'التأخير', 'متوسط الدخول', 'التبكير', 'الدرجة']}
            rows={d.committed.map((r) => [who(r), fmtInt(r.working_days), fmtInt(r.present), <Pct key="p" v={r.attendance_pct} goodAbove={95} />, mins(r.late_minutes), <span key="i" dir="ltr">{r.avg_in ?? '—'}</span>, r.avg_early_minutes ? `${fmtInt(r.avg_early_minutes)} د` : '—', <Score key="s" v={r.score} />])} />
        ) : <EmptyRow text="لا يوجد من أكمل ثلاثة أيام عمل ضمن الفترة" />}
        <Note>الدرجة من 100: نسبة الحضور ناقص دقائق التأخير (حتى 30 نقطة). الوصول المبكر يُستخدم فقط لكسر التعادل.</Note>
      </Block>

      <Block n="هـ" title="الأكثر كشوفات" icon="clipboard" tone="violet" testId="people-disclosures" subtitle="الكشوفات الميدانية المسجّلة على موظفين من الملاك خلال الفترة">
        {d.disclosures.length ? (
          <Table cols={showMoney ? ['الموظف', 'الكشوفات', 'معتمدة', 'قيد الإجراء', 'أبرز مخالفة', 'المبلغ المعتمد'] : ['الموظف', 'الكشوفات', 'معتمدة', 'قيد الإجراء', 'أبرز مخالفة']}
            rows={d.disclosures.map((r) => { const base: ReactNode[] = [who(r), <Bad key="c" v={r.count} tone="violet" />, fmtInt(r.approved), fmtInt(r.pending), r.top_violation ?? '—']; return showMoney ? [...base, <span key="a" dir="ltr">{fmtMoney(r.amount)}</span>] : base })} />
        ) : <EmptyRow text="لا كشوفات على موظفين خلال الفترة" tone="emerald" />}
      </Block>

      {showMoney && (
        <Block n="و" title={`الأكثر استقطاعاً — ${s.deduction_month}`} icon="wallet" tone="navy" testId="people-deductions" subtitle="استقطاعات الحضور المسجّلة لشهر نهاية الفترة (مبلغ معتمد من الشؤون المالية)">
          {d.deductions.length ? (
            <Table cols={['الموظف', 'المبلغ', 'الأيام', 'المقترح آلياً', 'القيود', 'الأسباب']}
              rows={d.deductions.map((r) => [who(r), <span key="a" dir="ltr" className="font-black text-red-700">{fmtMoney(r.amount)}</span>, Number(r.days).toLocaleString('en-US', { maximumFractionDigits: 2 }), Number(r.proposed_days).toLocaleString('en-US', { maximumFractionDigits: 2 }), fmtInt(r.items), <span key="r" className="text-[11px] text-slate-500">{r.reasons ?? '—'}</span>])} />
          ) : <EmptyRow text="لا استقطاعات مسجّلة لهذا الشهر" tone="emerald" />}
        </Block>
      )}
      <Reading lines={peopleReading(d, showMoney)} />
    </div>
  )
}

/** جمل «القراءة» الرسمية لقسم الأشخاص — تُبنى من الأرقام نفسها */
export function peopleReading(d: ExecPeople, showMoney: boolean): string[] {
  const out: string[] = []
  const drv = d.drivers
  if (drv.dep_days) {
    const pct = Math.round((drv.punched_days * 100) / drv.dep_days)
    const worst = drv.rows.find((r) => r.missing_days > 0)
    out.push(`سجّل ${fmtInt(drv.drivers)} سائقاً ${fmtInt(drv.dep_days)} يوم انطلاق تطابقت منها ${fmtInt(drv.punched_days)} مع البصمة (${pct}%)${worst ? `؛ أعلى فجوة لدى ${worst.name} (${fmtInt(worst.missing_days)} يوم بلا بصمة)` : ''}`)
  }
  if (drv.unlinked_departures) out.push(`${fmtInt(drv.unlinked_departures)} انطلاقة بلا سائق مربوط بملاك الموظفين — تحتاج ربطاً في غرفة العمليات قبل أن تدخل في المطابقة`)
  const a = d.absent[0]
  if (a) out.push(`الأكثر غياباً ${a.name} (${a.department}) بـ ${fmtInt(a.absent)} يوم من ${fmtInt(a.working_days)} (${fmtInt(a.absent_pct)}%)`)
  else out.push('لا غياب مسجّل على أي موظف خلال الفترة')
  const l = d.late[0]
  if (l) out.push(`الأكثر تأخراً ${l.name} بمجموع ${mins(l.late_minutes)} على ${fmtInt(l.late_days)} يوم`)
  const c = d.committed[0]
  if (c) out.push(`الأكثر التزاماً ${c.name} (${c.department}) بنسبة حضور ${fmtInt(c.attendance_pct)}% ومتوسط دخول ${c.avg_in ?? '—'}`)
  const x = d.disclosures[0]
  if (x) out.push(`الأكثر كشوفات ${x.name} بـ ${fmtInt(x.count)} كشف${x.top_violation ? ` أبرزها «${x.top_violation}»` : ''}`)
  const dd = d.deductions[0]
  if (showMoney && dd) out.push(`أعلى استقطاع في ${d.summary.deduction_month} على ${dd.name} بمبلغ ${fmtMoney(dd.amount)} (${Number(dd.days).toLocaleString('en-US', { maximumFractionDigits: 2 })} يوم)`)
  if (d.summary.perfect) out.push(`${fmtInt(d.summary.perfect)} موظفاً بسجل مثالي بلا غياب ولا تأخير`)
  return out
}
function Reading({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <div className="rounded-xl border-r-4 bg-slate-50 p-3 text-xs leading-6 text-slate-700" style={{ borderColor: NAVY }} data-testid="rep-reading-people">
      <p className="mb-1 flex items-center gap-1 font-black" style={{ color: NAVY }}><Icon name="file-text" size={12} className="text-[#c9a227]" />القراءة</p>
      <p>{lines.join('؛ ')}.</p>
    </div>
  )
}

/* ───────── عناصر العرض ───────── */
const TONE_RING: Record<string, string> = { slate: 'bg-slate-100 text-slate-700', red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-700', emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700', navy: 'bg-[#0b3d6b] text-[#f3d06a]' }
function Block({ n, title, subtitle, icon, tone = 'slate', flag, testId, children }: { n: string; title: string; subtitle?: string; icon: IconName; tone?: keyof typeof TONE_RING; flag?: string; testId: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white print:break-inside-avoid" data-testid={testId}>
      <header className="flex items-start gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE_RING[tone])}><Icon name={icon} size={15} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><span className="text-xs font-black" style={{ color: GOLD }}>{n}.</span>{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </header>
      {flag && <p className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-900 sm:mx-4" data-testid={`${testId}-flag`}><Icon name="alert-triangle" size={12} />{flag}</p>}
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  )
}
function Table({ cols, rows }: { cols: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead><tr className="border-b-2 text-[11px] text-slate-500" style={{ borderColor: NAVY }}><th className="w-8 py-1.5 pr-1 text-right font-semibold">#</th>{cols.map((c) => <th key={c} className="py-1.5 text-right font-semibold first:pr-1 last:text-left [&:not(:first-child)]:text-center">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={clsx('border-b border-slate-100 last:border-0', i === 0 && 'bg-slate-50/70')}>
              <td className="py-1.5 pr-1 text-[11px] font-black tabular-nums text-slate-400" dir="ltr">{i + 1}</td>
              {r.map((c, j) => <td key={j} className={clsx('py-1.5', j === 0 ? 'pr-1' : 'text-center font-bold tabular-nums text-slate-700', j === r.length - 1 && j > 0 && 'text-left')} dir={j === 0 ? undefined : 'ltr'}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function EmptyRow({ text, tone = 'slate' }: { text: string; tone?: 'slate' | 'emerald' }) {
  return <p className={clsx('rounded-xl border border-dashed px-3 py-4 text-center text-xs font-bold', tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-500')} data-testid="people-empty">{text}</p>
}
function Note({ children }: { children: ReactNode }) { return <p className="mt-2 text-[10px] leading-5 text-slate-400">{children}</p> }
function Bad({ v, tone = 'red' }: { v: number; tone?: 'red' | 'violet' }) {
  return v ? <span className={clsx('inline-block min-w-7 rounded-md px-1.5 py-0.5 text-[11px] font-black', tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700')}>{fmtInt(v)}</span> : <span className="text-slate-400">0</span>
}
function Pct({ v, goodAbove = 90, invert = false }: { v: number; goodAbove?: number; invert?: boolean }) {
  const good = invert ? v <= 100 - goodAbove : v >= goodAbove
  const bad = invert ? v >= 50 : v < 60
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100"><span className={clsx('block h-full rounded-full', good ? 'bg-emerald-500' : bad ? 'bg-red-500' : 'bg-amber-500')} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
      <span className={clsx('text-[11px] font-black', good ? 'text-emerald-700' : bad ? 'text-red-700' : 'text-amber-700')}>{fmtInt(v)}%</span>
    </span>
  )
}
function Score({ v }: { v: number }) {
  const n = Math.round(Number(v))
  return <span className={clsx('inline-block rounded-md px-2 py-0.5 text-[11px] font-black', n >= 95 ? 'bg-emerald-600 text-white' : n >= 85 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700')}>{n}</span>
}

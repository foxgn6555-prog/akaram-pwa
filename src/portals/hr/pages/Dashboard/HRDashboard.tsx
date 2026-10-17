/**
 * بوابة الموارد البشرية — «الرئيسية» (00256 · أُعيد ترتيبها في 00266)
 * الترتيب: ① الملاك (4 مؤشرات متساوية) ② حركة الملاك 6 أشهر (أعمدة شهرية مُرقّمة) + تركيبة القوى العاملة
 *          ③ حضور اليوم (حلقة) + اتجاه 30 يوماً (أعمدة يومية مكدّسة + متوسطات مشروحة) ④ التوزيعات (4 بطاقات متساوية) ⑤ يحتاج متابعة.
 * قواعد: بطاقات متساوية الارتفاع في كل صف · لا منحنيات ممّوجة · كل رقم مكتوب نصاً بجانب رسمه · بلا أرقام مالية (الرواتب للمالية حصراً).
 */
import { Link } from 'react-router'
import { useHrDashboard } from '@features/hr'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { StackedBars, BarsH, Empty, PALETTE } from '@components/executive/exec-ui'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import clsx from 'clsx'
import type { ReactNode } from 'react'

const AR_MONTHS = ['كانون2', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين1', 'تشرين2', 'كانون1']
const monthLabel = (ym: string) => AR_MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym
const C = { present: '#059669', late: '#d97706', absent: '#dc2626', incomplete: '#7c3aed', leave: '#2563eb' }
const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0)
const fmt = (n: number) => n.toLocaleString('en-US')

export default function HRDashboard() {
  const { data: s, isLoading } = useHrDashboard()
  if (isLoading) return <LoadingSpinner />
  if (!s) return <p className="text-sm text-slate-500">لا صلاحية لعرض لوحة الموارد البشرية</p>
  const total = s.today.present + s.today.late + s.today.absent + s.today.incomplete + s.today.leave
  const trend = s.attendance_30d ?? []
  const workDays = trend.filter((d) => d.present + d.late + d.absent + d.incomplete + d.leave > 0)
  const movement = s.movement_6m ?? []
  const ma = s.month_attendance
  const attendanceRate = ma && ma.days > 0 ? Math.round((ma.present / ma.days) * 100) : null
  const contract = s.by_contract, tenure = s.tenure, status = s.by_status
  const hires6 = movement.reduce((a, m) => a + m.hired, 0), terms6 = movement.reduce((a, m) => a + m.terminated, 0)
  const followUps: Array<{ count: number; text: string; to: string; tone: 'amber' | 'red' | 'violet' | 'blue'; icon: IconName; testId?: string }> = [
    { count: s.unmatched_punches, text: 'بصمات غير مطابَقة خلال 30 يوماً — اربط PIN بالموظف من دفتر البصمة', to: '/hr/biometric', tone: 'amber', icon: 'fingerprint', testId: 'd-unmatched' },
    { count: s.salary_pending, text: 'رواتب بانتظار تعريف المالية (تُدخلها المالية حصراً)', to: '/hr/employees', tone: 'amber', icon: 'wallet', testId: 'd-salary-pending' },
    { count: s.leaves_pending ?? 0, text: 'طلبات إجازة بانتظار البت', to: '/hr/leaves', tone: 'blue', icon: 'calendar', testId: 'd-leaves-pending' },
    { count: s.today.incomplete, text: 'بصمة ناقصة اليوم (دخول بلا خروج أو العكس)', to: '/hr/attendance', tone: 'violet', icon: 'alert-triangle' },
    { count: s.incomplete_profiles ?? 0, text: 'ملفات موظفين تنقصها بصمة أو مسمى أو مدير مباشر', to: '/hr/employees', tone: 'red', icon: 'user', testId: 'd-incomplete-profiles' },
  ]
  const openFollowUps = followUps.filter((f) => f.count > 0).length

  return (
    <div className="space-y-5" data-testid="hr-dashboard">
      <ExecPageHeader icon="home" title="الموارد البشرية — الرئيسية" subtitle="لمحة حيّة عن الملاك والحضور والإجازات — تتحدث تلقائياً" />

      {/* ── ① الملاك ── */}
      <section aria-label="الملاك">
        <RowTitle>الملاك</RowTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat to="/hr/employees" title="موظفون على الملاك" value={s.employees_active} icon="users" tone="emerald" testId="d-active" hint={contract ? `شهري ${contract.monthly} · يومي ${contract.daily}` : 'العقود الفعّالة حالياً'} />
          <Stat to="/hr/recruitment" title="تعيينات هذا الشهر" value={s.hired_this_month} icon="user-plus" tone="blue" testId="d-hired" hint={`آخر 6 أشهر: ${fmt(hires6)}`} />
          <Stat to="/hr/recruitment" title="إنهاءات هذا الشهر" value={s.terminated_this_month} icon="logout" tone="red" testId="d-terminated" hint={`آخر 6 أشهر: ${fmt(terms6)}`} />
          <Stat title="منتهية خدمتهم (إجمالي)" value={s.employees_terminated} icon="archive-box" tone="slate" testId="d-terminated-total" hint="منذ بداية السجل" />
        </div>
      </section>

      {/* ── ② حركة الملاك + التركيبة ── */}
      <section className="grid gap-3 lg:grid-cols-3" aria-label="حركة الملاك والتركيبة">
        <Card className="lg:col-span-2" title="حركة الملاك — آخر 6 أشهر" subtitle="تعيينات مقابل إنهاءات لكل شهر" icon="user-plus" tone="violet" action={<More to="/hr/recruitment">التوظيف</More>}>
          <MonthlyBars testId="d-movement-6m" data={movement} />
        </Card>
        <Card title="تركيبة القوى العاملة" subtitle={`${fmt(s.employees_active)} موظفاً على الملاك`} icon="pie-chart" tone="cyan">
          {contract && status && tenure ? (
            <div className="space-y-3" data-testid="d-composition">
              <Group label="نوع العقد"><Bar label="شهري" value={contract.monthly} max={s.employees_active} color={PALETTE[0]!} /><Bar label="يومي" value={contract.daily} max={s.employees_active} color={PALETTE[2]!} /></Group>
              <Group label="الحالة"><Bar label="فعّال" value={status.active} max={s.employees_active} color={C.present} /><Bar label="في إجازة" value={status.on_leave} max={s.employees_active} color={C.leave} /><Bar label="موقوف" value={status.suspended} max={s.employees_active} color={C.late} /></Group>
              <Group label="سنوات الخدمة"><Bar label="أقل من سنة" value={tenure.lt1} max={s.employees_active} color={PALETTE[4]!} /><Bar label="1 – 3 سنوات" value={tenure.y1_3} max={s.employees_active} color={PALETTE[4]!} /><Bar label="أكثر من 3" value={tenure.gt3} max={s.employees_active} color={PALETTE[4]!} /></Group>
            </div>
          ) : <Empty text="تحتاج تحديث قاعدة البيانات (00224)" />}
        </Card>
      </section>

      {/* ── ③ الحضور ── */}
      <section aria-label="الحضور">
        <RowTitle>الحضور</RowTitle>
        <div className="grid gap-3 lg:grid-cols-3">
          <Card title="حضور اليوم" subtitle={total > 0 ? `${fmt(total)} سجلاً محتسباً` : 'لم يُحتسب بعد'} icon="activity" tone="emerald" action={<More to="/hr/attendance">الحضور</More>}>
            <TodayDonut testId="d-today-donut" data={[
              { name: 'حاضر', value: s.today.present, color: C.present, testId: 'd-present' }, { name: 'متأخر', value: s.today.late, color: C.late, testId: 'd-late' }, { name: 'غائب', value: s.today.absent, color: C.absent, testId: 'd-absent' },
              { name: 'بصمة ناقصة', value: s.today.incomplete, color: C.incomplete, testId: 'd-incomplete' }, { name: 'في إجازة', value: s.leaves_today, color: C.leave, testId: 'd-leaves' },
            ]} />
            {total === 0 && <p className="mt-3 rounded-xl bg-slate-50 p-2 text-[11px] leading-5 text-slate-500">يُحتسب من البصمات عند «إعادة الاحتساب» في الحضور أو من غرفة العمليات.</p>}
          </Card>
          <Card className="lg:col-span-2" title="اتجاه الحضور — آخر 30 يوماً" subtitle="عدد الموظفين يومياً حسب الحالة (أيام الراحة مستثناة)" icon="bar-chart" tone="blue"
            action={attendanceRate !== null && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700" data-testid="d-attendance-rate">نسبة حضور الشهر {attendanceRate}٪</span>}>
            <StackedBars testId="d-trend-30d" height={160} data={trend.map((d) => ({ d: d.d, present: d.present, late: d.late, absent: d.absent }))}
              keys={[{ key: 'present', name: 'حاضر', color: C.present }, { key: 'late', name: 'متأخر', color: C.late }, { key: 'absent', name: 'غائب', color: C.absent }]} />
            {trend.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2" data-testid="d-trend-averages">
                <Avg label="متوسط الحاضرين يومياً" value={avg(workDays.map((d) => d.present))} color={C.present} />
                <Avg label="متوسط المتأخرين يومياً" value={avg(workDays.map((d) => d.late))} color={C.late} />
                <Avg label="متوسط الغائبين يومياً" value={avg(workDays.map((d) => d.absent))} color={C.absent} />
              </div>
            )}
            {trend.length > 0 && <p className="mt-2 text-[10px] text-slate-400">المتوسطات على أيام العمل المحتسبة فقط ({fmt(workDays.length)} يوماً من {fmt(trend.length)}).</p>}
          </Card>
        </div>
      </section>

      {/* ── ④ التوزيعات ── */}
      <section aria-label="التوزيعات">
        <RowTitle>التوزيعات</RowTitle>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card title="حسب القسم" icon="layout-grid" tone="blue" testId="d-by-dept"><BarsH data={s.by_department} color={PALETTE[0]!} format={String} /></Card>
          <Card title="حسب الفرع" icon="map-pin" tone="cyan" testId="d-by-branch"><BarsH data={s.by_branch} color={PALETTE[5]!} format={String} /></Card>
          <Card title="حسب الشفت" icon="calendar" tone="violet" testId="d-by-shift"><BarsH data={s.shifts} color={PALETTE[4]!} format={String} /></Card>
          <Card title="إجازات هذا الشهر" subtitle="حسب النوع" icon="calendar" tone="emerald" testId="d-leaves-month" action={<More to="/hr/leaves">الإجازات</More>}><BarsH data={s.leaves_month ?? []} color={PALETTE[1]!} format={String} /></Card>
        </div>
      </section>

      {/* ── ⑤ يحتاج متابعة ── */}
      <Card title="يحتاج متابعة" subtitle={openFollowUps ? `${openFollowUps} بنود مفتوحة — اضغط للانتقال` : 'لا بنود مفتوحة'} icon="alert-triangle" tone={openFollowUps ? 'amber' : 'emerald'} testId="d-followups">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {followUps.map((f) => (
            <Link key={f.text} to={f.to} data-testid={f.testId} className={clsx('flex items-center gap-3 rounded-xl border px-3 py-2.5 transition hover:bg-slate-50', f.count > 0 ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50/60 opacity-70')}>
              <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-black tabular-nums', f.count > 0 ? TONE_BG[f.tone] : 'bg-slate-100 text-slate-500')}>{f.count}</span>
              <span className="min-w-0 flex-1 text-xs font-bold leading-4 text-slate-700">{f.text}</span>
              <Icon name={f.icon} className="h-4 w-4 shrink-0 text-slate-300" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}

const TONE_BG = { amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', violet: 'bg-violet-100 text-violet-700', blue: 'bg-blue-100 text-blue-700' } as const
type Tone = 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'cyan'
const TONE = {
  slate: { bg: 'bg-slate-100 text-slate-700', bar: '#64748b' }, blue: { bg: 'bg-blue-100 text-blue-700', bar: '#2563eb' }, emerald: { bg: 'bg-emerald-100 text-emerald-700', bar: '#059669' },
  amber: { bg: 'bg-amber-100 text-amber-700', bar: '#d97706' }, red: { bg: 'bg-red-100 text-red-700', bar: '#dc2626' }, violet: { bg: 'bg-violet-100 text-violet-700', bar: '#7c3aed' }, cyan: { bg: 'bg-cyan-100 text-cyan-700', bar: '#0891b2' },
} as const satisfies Record<Tone, { bg: string; bar: string }>

function RowTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 flex items-center gap-2 text-xs font-black text-slate-500"><span className="h-3 w-1 rounded-full bg-brand-600" />{children}</h2>
}
function More({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50">{children} ←</Link>
}

/** مؤشر رئيسي: رقم كبير + أيقونة + سطر توضيحي؛ ارتفاع ثابت وعرض متساوٍ */
function Stat({ title, value, icon, tone, hint, testId, to }: { title: string; value: number; icon: IconName; tone: Tone; hint?: string; testId?: string; to?: string }) {
  const body = (
    <div className="relative flex h-full min-h-[108px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md" data-testid={testId}>
      <span className="absolute inset-y-0 right-0 w-1.5" style={{ background: TONE[tone].bar }} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold leading-4 text-slate-600">{title}</p>
        <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', TONE[tone].bg)}><Icon name={icon} className="h-4.5 w-4.5" /></span>
      </div>
      <p className="text-3xl font-black leading-none tabular-nums text-slate-900">{fmt(value)}</p>
      <p className="truncate text-[11px] text-slate-400">{hint ?? ' '}</p>
    </div>
  )
  return to ? <Link to={to} className="block min-w-0">{body}</Link> : body
}

/** حاوية بطاقة بعنوان موحّد — ارتفاع كامل داخل الصف (بلا عنصر header: عقد تصميم بوابة HR) */
function Card({ title, subtitle, icon, tone = 'slate', action, children, className, testId }: { title: string; subtitle?: string; icon?: IconName; tone?: Tone; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={clsx('flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid', className)} data-testid={testId}>
      <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', TONE[tone].bg)}><Icon name={icon} className="h-4 w-4" /></span>}
          <div className="min-w-0"><h3 className="text-sm font-black leading-5 text-slate-800">{title}</h3>{subtitle && <p className="text-[11px] leading-4 text-slate-500">{subtitle}</p>}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div><p className="mb-1.5 text-[11px] font-black text-slate-500">{label}</p><div className="space-y-1.5">{children}</div></div>
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="truncate font-semibold text-slate-700">{label}</span><span className="shrink-0 tabular-nums"><b>{fmt(value)}</b> <span className="text-slate-400">· {p}٪</span></span></div>
      <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} /></div>
    </div>
  )
}

function Avg({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</p>
      <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

/** أعمدة شهرية متجاورة (تعيين/إنهاء) مع الرقم فوق كل عمود واسم الشهر تحته */
function MonthlyBars({ data, testId }: { data: Array<{ month: string; hired: number; terminated: number }>; testId: string }) {
  if (!data.length) return <Empty />
  const max = Math.max(1, ...data.flatMap((m) => [m.hired, m.terminated]))
  const hires = data.reduce((a, m) => a + m.hired, 0), terms = data.reduce((a, m) => a + m.terminated, 0)
  return (
    <div data-testid={testId}>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm" style={{ background: C.present }} />تعيين: <b className="tabular-nums">{fmt(hires)}</b></span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm" style={{ background: C.absent }} />إنهاء: <b className="tabular-nums">{fmt(terms)}</b></span>
        <span className="text-slate-400">صافي الحركة: <b className={clsx('tabular-nums', hires - terms >= 0 ? 'text-emerald-700' : 'text-red-700')}>{hires - terms >= 0 ? '+' : ''}{fmt(hires - terms)}</b></span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, direction: 'ltr' }}>
        {data.map((m) => (
          <div key={m.month} className="min-w-0" data-testid={`d-move-${m.month}`}>
            <div className="flex h-36 items-end justify-center gap-1.5 rounded-xl bg-slate-50 px-2 pt-5">
              <Col value={m.hired} max={max} color={C.present} />
              <Col value={m.terminated} max={max} color={C.absent} />
            </div>
            <p className="mt-1 truncate text-center text-[10px] font-bold text-slate-500" dir="rtl">{monthLabel(m.month)} {m.month.slice(0, 4)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
function Col({ value, max, color }: { value: number; max: number; color: string }) {
  const h = Math.max(value > 0 ? 6 : 2, Math.round((value / max) * 100))
  return (
    <div className="relative flex h-full w-full max-w-[28px] flex-col justify-end">
      <span className="mb-0.5 text-center text-[10px] font-black tabular-nums text-slate-700">{value}</span>
      <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: value > 0 ? color : '#cbd5e1' }} />
    </div>
  )
}

/** حلقة حضور اليوم بألوان دلالية ثابتة + قائمة أرقام كاملة */
function TodayDonut({ data, testId }: { data: Array<{ name: string; value: number; color: string; testId: string }>; testId: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = 40, c = 2 * Math.PI * r
  let acc = 0
  const segs = data.map((d) => { const len = total ? (d.value / total) * c : 0, off = acc; acc += len; return { ...d, len, off } })
  return (
    <div data-testid={testId} className="flex flex-col items-center gap-4 sm:flex-row">
      <svg width={140} height={140} viewBox="0 0 100 100" className="-rotate-90 shrink-0" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        {segs.filter((x) => x.len > 0).map((x) => <circle key={x.name} cx="50" cy="50" r={r} fill="none" stroke={x.color} strokeWidth="14" strokeDasharray={`${x.len} ${c - x.len}`} strokeDashoffset={-x.off} strokeLinecap="butt" />)}
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center fill-slate-900 text-[22px] font-black">{total}</text>
      </svg>
      <ul className="w-full min-w-0 flex-1 divide-y divide-slate-100 text-xs">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-2 py-1.5" data-testid={d.testId}>
            <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
            <span className="font-black tabular-nums text-slate-900">{d.value} <span className="text-[10px] font-semibold text-slate-400">({total ? Math.round((d.value / total) * 100) : 0}٪)</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

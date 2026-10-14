/**
 * بوابة الموارد البشرية — «الرئيسية»: ملخص حي لبقية الوحدات مع رسومات (00256)
 * مؤشرات القوى العاملة + حركة 6 أشهر · حضور اليوم (دونات) + اتجاه 30 يوماً · توزيعات (قسم/فرع/شفت/عقد/خدمة) · إجازات الشهر · ما يحتاج متابعة.
 * بلا أرقام مالية — الرواتب للمالية حصراً (نعرض عدد «بانتظار التعريف» فقط).
 */
import { Link } from 'react-router'
import { useHrDashboard } from '@features/hr'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Kpi, TrendArea, StackedBars, BarsH, Empty, PALETTE } from '@components/executive/exec-ui'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import clsx from 'clsx'
import type { ReactNode } from 'react'

const AR_MONTHS = ['كانون2', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين1', 'تشرين2', 'كانون1']
const monthLabel = (ym: string) => AR_MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym

export default function HRDashboard() {
  const { data: s, isLoading } = useHrDashboard()
  if (isLoading) return <LoadingSpinner />
  if (!s) return <p className="text-sm text-slate-500">لا صلاحية لعرض لوحة الموارد البشرية</p>
  const total = s.today.present + s.today.late + s.today.absent + s.today.incomplete + s.today.leave
  const trend = s.attendance_30d ?? []
  const movement = s.movement_6m ?? []
  const ma = s.month_attendance
  const attendanceRate = ma && ma.days > 0 ? Math.round((ma.present / ma.days) * 100) : null
  const spark = (k: 'present' | 'late' | 'absent') => trend.map((d) => d[k])
  const hiresSpark = movement.map((m) => m.hired), termSpark = movement.map((m) => m.terminated)
  const contract = s.by_contract, tenure = s.tenure, status = s.by_status
  const followUps: Array<{ count: number; text: string; to: string; tone: 'amber' | 'red' | 'violet' | 'blue'; icon: IconName; testId?: string }> = [
    { count: s.unmatched_punches, text: 'بصمات غير مطابَقة خلال 30 يوماً — اربط PIN بالموظف من دفتر البصمة', to: '/hr/biometric', tone: 'amber', icon: 'fingerprint', testId: 'd-unmatched' },
    { count: s.salary_pending, text: 'رواتب بانتظار تعريف المالية (تُدخلها المالية حصراً)', to: '/hr/employees', tone: 'amber', icon: 'wallet', testId: 'd-salary-pending' },
    { count: s.leaves_pending ?? 0, text: 'طلبات إجازة بانتظار البت', to: '/hr/leaves', tone: 'blue', icon: 'calendar', testId: 'd-leaves-pending' },
    { count: s.today.incomplete, text: 'بصمة ناقصة اليوم (دخول بلا خروج أو العكس)', to: '/hr/attendance', tone: 'violet', icon: 'alert-triangle' },
    { count: s.incomplete_profiles ?? 0, text: 'ملفات موظفين تنقصها بصمة أو مسمى أو مدير مباشر', to: '/hr/employees', tone: 'red', icon: 'user', testId: 'd-incomplete-profiles' },
  ]

  return (
    <div className="space-y-5" data-testid="hr-dashboard">
      <ExecPageHeader icon="home" title="الموارد البشرية — الرئيسية" subtitle="لمحة حيّة عن الموظفين والحضور والإجازات — تتحدث تلقائياً" />

      {/* ── مؤشرات رئيسية ── */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="مؤشرات القوى العاملة">
        <Link to="/hr/employees" className="min-w-0"><Kpi title="موظفون على الملاك" value={s.employees_active} icon="users" tone="emerald" testId="d-active" hint={contract ? `شهري ${contract.monthly} · يومي ${contract.daily}` : undefined} /></Link>
        <Link to="/hr/recruitment" className="min-w-0"><Kpi title="تعيينات هذا الشهر" value={s.hired_this_month} icon="user-plus" tone="blue" testId="d-hired" spark={hiresSpark} hint={movement.length ? 'آخر 6 أشهر' : undefined} /></Link>
        <Link to="/hr/recruitment" className="min-w-0"><Kpi title="إنهاءات هذا الشهر" value={s.terminated_this_month} icon="logout" tone="red" testId="d-terminated" spark={termSpark} hint={movement.length ? 'آخر 6 أشهر' : undefined} /></Link>
        <Kpi title="منتهية خدمتهم (إجمالي)" value={s.employees_terminated} icon="archive-box" tone="slate" testId="d-terminated-total" />
      </section>

      {/* ── حضور اليوم + اتجاه الشهر ── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="حضور اليوم" subtitle={total > 0 ? `${total} سجلاً محتسباً` : 'لم يُحتسب بعد'} icon="activity" tone="emerald" action={<Link to="/hr/attendance" className="text-xs font-semibold text-brand-700 hover:underline">الحضور ←</Link>}>
          <TodayDonut testId="d-today-donut" data={[
            { name: 'حاضر', value: s.today.present, color: C.present, testId: 'd-present' }, { name: 'متأخر', value: s.today.late, color: C.late, testId: 'd-late' }, { name: 'غائب', value: s.today.absent, color: C.absent, testId: 'd-absent' },
            { name: 'بصمة ناقصة', value: s.today.incomplete, color: C.incomplete, testId: 'd-incomplete' }, { name: 'في إجازة', value: s.leaves_today, color: C.leave, testId: 'd-leaves' },
          ]} />
          {total === 0 && <p className="mt-2 text-[11px] text-slate-400">يُحتسب من البصمات عند «إعادة الاحتساب» أو من غرفة العمليات.</p>}
        </Card>
        <Card className="lg:col-span-2" title="اتجاه الحضور — آخر 30 يوماً" subtitle="عدد الموظفين يومياً حسب الحالة (أيام الراحة مستثناة)" icon="bar-chart" tone="blue"
          action={attendanceRate !== null && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700" data-testid="d-attendance-rate">نسبة حضور الشهر {attendanceRate}٪</span>}>
          <TrendArea testId="d-trend-30d" data={trend} height={170} keys={[{ key: 'present', name: 'حاضر', color: C.present }, { key: 'late', name: 'متأخر', color: C.late }, { key: 'absent', name: 'غائب', color: C.absent }]} />
          {trend.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Kpi title="حاضر/يوم" value={avg(spark('present'))} tone="emerald" spark={spark('present')} />
              <Kpi title="متأخر/يوم" value={avg(spark('late'))} tone="amber" spark={spark('late')} />
              <Kpi title="غائب/يوم" value={avg(spark('absent'))} tone="red" spark={spark('absent')} />
            </div>
          )}
        </Card>
      </section>

      {/* ── حركة الملاك + تركيبة القوى العاملة ── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="حركة الملاك — آخر 6 أشهر" subtitle="تعيينات مقابل إنهاءات شهرياً" icon="user-plus" tone="violet" action={<Link to="/hr/recruitment" className="text-xs font-semibold text-brand-700 hover:underline">التوظيف ←</Link>}>
          <StackedBars testId="d-movement-6m" height={150} data={movement.map((m) => ({ d: `${m.month.slice(0, 4)}-${monthLabel(m.month)}`, hired: m.hired, terminated: m.terminated }))}
            keys={[{ key: 'hired', name: 'تعيين', color: C.present }, { key: 'terminated', name: 'إنهاء', color: C.absent }]} />
        </Card>
        <Card title="تركيبة القوى العاملة" subtitle="على الملاك حالياً" icon="pie-chart" tone="cyan">
          {contract && status && tenure ? (
            <div className="space-y-3" data-testid="d-composition">
              <div>
                <p className="mb-1 text-[11px] font-bold text-slate-500">نوع العقد</p>
                <Bar label="شهري" value={contract.monthly} max={s.employees_active} color={PALETTE[0]!} />
                <Bar label="يومي" value={contract.daily} max={s.employees_active} color={PALETTE[2]!} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold text-slate-500">الحالة</p>
                <Bar label="فعّال" value={status.active} max={s.employees_active} color={PALETTE[1]!} />
                <Bar label="في إجازة" value={status.on_leave} max={s.employees_active} color={PALETTE[5]!} />
                <Bar label="موقوف" value={status.suspended} max={s.employees_active} color={PALETTE[3]!} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold text-slate-500">سنوات الخدمة</p>
                <Bar label="أقل من سنة" value={tenure.lt1} max={s.employees_active} color={PALETTE[4]!} />
                <Bar label="1 – 3 سنوات" value={tenure.y1_3} max={s.employees_active} color={PALETTE[4]!} />
                <Bar label="أكثر من 3" value={tenure.gt3} max={s.employees_active} color={PALETTE[4]!} />
              </div>
            </div>
          ) : <Empty text="تحتاج تحديث قاعدة البيانات (00224)" />}
        </Card>
      </section>

      {/* ── توزيعات ── */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card title="حسب القسم" icon="layout-grid" testId="d-by-dept"><BarsH data={s.by_department} color={PALETTE[0]!} format={String} /></Card>
        <Card title="حسب الفرع" icon="map-pin" testId="d-by-branch"><BarsH data={s.by_branch} color={PALETTE[5]!} format={String} /></Card>
        <Card title="حسب الشفت" icon="calendar" testId="d-by-shift"><BarsH data={s.shifts} color={PALETTE[4]!} format={String} /></Card>
        <Card title="إجازات هذا الشهر حسب النوع" icon="calendar" testId="d-leaves-month" action={<Link to="/hr/leaves" className="text-xs font-semibold text-brand-700 hover:underline">الإجازات ←</Link>}>
          <BarsH data={s.leaves_month ?? []} color={PALETTE[1]!} format={String} />
        </Card>
      </section>

      {/* ── يحتاج متابعة ── */}
      <Card title="يحتاج متابعة" subtitle="بنود مفتوحة مرتبة حسب الأهمية — اضغط للانتقال" icon="alert-triangle" tone="amber" testId="d-followups">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {followUps.map((f) => (
            <Link key={f.text} to={f.to} data-testid={f.testId} className={clsx('flex items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm hover:bg-slate-50', f.count > 0 ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60 opacity-70')}>
              <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base font-black tabular-nums', f.count > 0 ? TONE_BG[f.tone] : 'bg-slate-100 text-slate-500')}>{f.count}</span>
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
const C = { present: '#059669', late: '#d97706', absent: '#dc2626', incomplete: '#7c3aed', leave: '#2563eb' }
const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0)

/** حاوية بطاقة بعنوان — بلا عنصر header (عقد تصميم بوابة HR) */
function Card({ title, subtitle, icon, tone = 'slate', action, children, className, testId }: { title: string; subtitle?: string; icon?: IconName; tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'cyan'; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  const bg = { slate: 'bg-slate-100 text-slate-700', blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', violet: 'bg-violet-100 text-violet-700', cyan: 'bg-cyan-100 text-cyan-700' }[tone]
  return (
    <section className={clsx('min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 print:break-inside-avoid', className)} data-testid={testId}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-xl', bg)}><Icon name={icon} className="h-4 w-4" /></span>}
          <div className="min-w-0"><h3 className="text-sm font-black leading-5 text-slate-800">{title}</h3>{subtitle && <p className="text-[11px] leading-4 text-slate-500">{subtitle}</p>}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px]"><span className="truncate font-semibold text-slate-700">{label}</span><span className="shrink-0 tabular-nums"><b>{value}</b> <span className="text-slate-400">· {p}٪</span></span></div>
      <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} /></div>
    </div>
  )
}

/** دونات حضور اليوم بألوان دلالية ثابتة (أخضر حاضر · كهرماني متأخر · أحمر غائب) + أرقام نصية دائماً */
function TodayDonut({ data, testId }: { data: Array<{ name: string; value: number; color: string; testId: string }>; testId: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = 40, c = 2 * Math.PI * r
  let acc = 0
  const segs = data.map((d) => { const len = total ? (d.value / total) * c : 0, off = acc; acc += len; return { ...d, len, off } })
  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-4">
        <svg width={128} height={128} viewBox="0 0 100 100" className="-rotate-90 shrink-0" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
          {segs.filter((x) => x.len > 0).map((x) => <circle key={x.name} cx="50" cy="50" r={r} fill="none" stroke={x.color} strokeWidth="14" strokeDasharray={`${x.len} ${c - x.len}`} strokeDashoffset={-x.off} />)}
          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center fill-slate-900 text-[20px] font-black">{total}</text>
        </svg>
        <ul className="min-w-0 flex-1 space-y-1 text-xs">
          {data.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2" data-testid={d.testId}>
              <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}</span>
              <span className="font-bold tabular-nums text-slate-900">{d.value}{' '}<span className="text-[10px] font-semibold text-slate-400">({total ? Math.round((d.value / total) * 100) : 0}٪)</span></span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

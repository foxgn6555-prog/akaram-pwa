/** تقرير شكاوى المواطنين والدعم المباشر — يُستخدم في غرفة العمليات وتقارير معاون المدير المفوض والمدير المفوض */
import { useCitizenReport } from '@features/citizen'
import { Kpi, MiniTable, Panel } from '@components/executive/exec-ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const n = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${Number(v).toLocaleString('ar-IQ-u-nu-latn')}${unit}`)

export function CitizenReportPanel({ from, to }: { from: string; to: string }) {
  const { data: r, isLoading, error } = useCitizenReport(from, to)
  if (isLoading) return <LoadingSpinner />
  if (error) return <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">تعذر تحميل تقرير شكاوى المواطنين</p>
  if (!r) return null
  const c = r.complaints; const s = r.support
  const resolvedPct = c.total ? Math.round((c.resolved / c.total) * 100) : 0
  return (
    <div className="space-y-3" data-testid="citizen-report">
      <Panel title="شكاوى المواطنين (الصفحة العامة)" subtitle={`${from} → ${to} · ${c.total.toLocaleString('ar-IQ-u-nu-latn')} شكوى`} icon="clipboard" tone="blue" testId="citizen-report-complaints">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi title="إجمالي الشكاوى" value={n(c.total)} icon="clipboard" />
          <Kpi title="تمت المعالجة" value={n(c.resolved)} hint={`${resolvedPct}% من الإجمالي`} tone="emerald" icon="check" />
          <Kpi title="قيد المعالجة" value={n(c.in_progress)} tone="amber" icon="activity" />
          <Kpi title="معلقة" value={n(c.on_hold)} icon="alert-triangle" />
          <Kpi title="جديدة بلا إسناد" value={n(c.new)} hint={c.unassigned_over_24h ? `${c.unassigned_over_24h} تجاوزت 24 ساعة` : 'كلها حديثة'} tone={c.unassigned_over_24h ? 'red' : 'slate'} icon="bell" />
          <Kpi title="متوسط زمن المعالجة" value={n(c.avg_resolution_hours)} unit="ساعة" hint={c.avg_assign_hours != null ? `الإسناد خلال ${c.avg_assign_hours} س` : undefined} icon="activity" />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-black text-slate-700">حسب مسؤول القسم</p>
            <MiniTable cols={['المسؤول', 'المسندة', 'المنجزة', 'المعلقة']} rows={c.by_assignee.map((a) => [a.name, a.total, a.resolved, a.on_hold])} testId="citizen-by-assignee" />
          </div>
          <div>
            <p className="mb-1 text-xs font-black text-slate-700">أقدم الشكاوى المفتوحة</p>
            <MiniTable cols={['الرقم', 'المواطن', 'الحالة', 'العمر (س)', 'المسؤول']} rows={c.oldest_open.map((o) => [o.ref_no, o.name, o.status_label, o.age_hours, o.assignee ?? '—'])} testId="citizen-oldest" />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">رضا المواطنين عن المعالجة: {c.avg_rating != null ? `${c.avg_rating} / 5 (${c.rated} تقييم)` : 'لا تقييمات بعد'} · {c.with_location} شكوى بموقع GPS · {c.with_photos} بصور</p>
      </Panel>
      <Panel title="الدعم الفني المباشر" subtitle={`${s.sessions.toLocaleString('ar-IQ-u-nu-latn')} محادثة`} icon="life-buoy" tone="amber" testId="citizen-report-support">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi title="المحادثات" value={n(s.sessions)} icon="users" />
          <Kpi title="أُجيبت" value={n(s.answered)} tone="emerald" icon="check" />
          <Kpi title="لم تُجب" value={n(s.abandoned)} tone={s.abandoned ? 'red' : 'slate'} icon="alert-triangle" />
          <Kpi title="متوسط الانتظار" value={n(s.avg_wait_minutes)} unit="دقيقة" icon="activity" />
          <Kpi title="أول رد" value={n(s.avg_first_reply_minutes)} unit="دقيقة" icon="send" />
          <Kpi title="رضا المواطنين" value={s.avg_rating != null ? `${s.avg_rating}/5` : '—'} hint={`${s.rated} تقييم · ${s.messages} رسالة`} tone="blue" icon="user" />
        </div>
        {s.by_agent.length > 0 && <div className="mt-3"><p className="mb-1 text-xs font-black text-slate-700">حسب موظف الدعم</p><MiniTable cols={['الموظف', 'المحادثات', 'التقييم']} rows={s.by_agent.map((a) => [a.name, a.sessions, a.avg_rating ?? '—'])} testId="citizen-by-agent" /></div>}
        {s.waiting_now > 0 && <p className="mt-2 text-xs font-black text-red-700">⚠ {s.waiting_now} مواطن بانتظار الرد الآن</p>}
      </Panel>
    </div>
  )
}

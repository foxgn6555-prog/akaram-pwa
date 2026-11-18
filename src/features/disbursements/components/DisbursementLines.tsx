/**
 * أسطر طلب الصرف: مرشّحات (الفرع · القسم · الشرائح بعدّاداتها · البحث · الترتيب) + بطاقات الأشخاص (موبايل أولاً).
 *  · موظف: الاسم والمبلغ، الفرع والقسم والرقم، شارات (استقطاع/سلفة/معدَّل/بلا ملف راتب)، شبكة الأيام والمبالغ
 *  · متعهد: القطاع، شارات (محجوب بالبصمة/استقطاع)، شبكة الأيام والأجور، وجدول أيام الشهر القابل للطي
 *  · البصمة الناقصة لا تظهر هنا إطلاقاً: اليوم الناقص البصمة مدفوع كغيره ويراه غرفة العمليات وحدها
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import type { ContractorLineDay, DisbursementDetail, DisbursementFlag, DisbursementKind, DisbursementLine, DisbursementSort } from '@sdk/disbursements.sdk'
import { useDisbursementLines } from '../hooks'
import { blockReasonLabel, dayLabel, minutesLabel } from '../format'
import { FilterChip, Tag } from './DisbursementUi'

const FLAG_ORDER: DisbursementFlag[] = ['all', 'deduction', 'adjusted', 'advance', 'zero']
const flagLabel = (f: DisbursementFlag, kind: DisbursementKind): string =>
  f === 'all' ? 'الكل' : f === 'deduction' ? (kind === 'contractor_wages' ? 'محجوب/مستقطع' : 'استقطاع') : f === 'adjusted' ? 'معدَّل يدوياً' : f === 'advance' ? 'سلفة' : 'صافٍ صفر'
const SORTS: ReadonlyArray<{ key: DisbursementSort; label: string }> = [
  { key: 'number', label: 'ترتيب: الرقم' }, { key: 'name', label: 'ترتيب: الاسم' }, { key: 'net_desc', label: 'الصافي: الأعلى' }, { key: 'net_asc', label: 'الصافي: الأدنى' },
]

export function DisbursementLinesPanel({ detail }: { detail: DisbursementDetail }) {
  const { request, facets } = detail
  const kind = request.kind
  const [group, setGroup] = useState('')
  const [subGroup, setSubGroup] = useState('')
  const [flag, setFlag] = useState<DisbursementFlag>('all')
  const [sort, setSort] = useState<DisbursementSort>('number')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t) }, [search])

  const groups = useMemo(() => [...new Set(facets.groups.map((g) => g.group ?? ''))], [facets.groups])
  const subGroups = useMemo(() => [...new Set(facets.groups.filter((g) => !group || (g.group ?? '') === group).map((g) => g.sub_group ?? ''))], [facets.groups, group])
  const groupLabel = kind === 'employee_payroll' ? 'الفرع' : 'القطاع الرئيسي'
  const subLabel = kind === 'employee_payroll' ? 'القسم' : 'القطاع'

  const lines = useDisbursementLines(request.id, { group: group || null, subGroup: subGroup || null, flag, search: q || null, sort })
  const rows = lines.data?.pages.flatMap((p) => p.rows) ?? []
  const total = lines.data?.pages[0]?.total ?? 0
  const netTotal = lines.data?.pages[0]?.net_total ?? 0
  const filtered = group !== '' || subGroup !== '' || flag !== 'all' || q !== ''

  return (
    <section className="space-y-2.5" aria-label="أسطر الطلب" data-testid="disb-lines">
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm" data-testid="disb-lines-filters">
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-[10px] font-extrabold text-slate-500">{groupLabel}
            <select className={clsx(field, 'mt-0.5 font-bold')} value={group} onChange={(e) => { setGroup(e.target.value); setSubGroup('') }} data-testid="disb-filter-group" aria-label={groupLabel}>
              <option value="">الكل</option>{groups.map((g) => <option key={g} value={g}>{g || '—'}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[10px] font-extrabold text-slate-500">{subLabel}
            <select className={clsx(field, 'mt-0.5 font-bold')} value={subGroup} onChange={(e) => setSubGroup(e.target.value)} data-testid="disb-filter-subgroup" aria-label={subLabel}>
              <option value="">الكل</option>{subGroups.map((g) => <option key={g} value={g}>{g || '—'}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="الشرائح">
          {FLAG_ORDER.filter((f) => f === 'all' || facets.flags[f] > 0).map((f) => (
            <FilterChip key={f} active={flag === f} onClick={() => setFlag(f)} count={facets.flags[f]} testId={`disb-flag-${f}`}>{flagLabel(f, kind)}</FilterChip>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input type="search" inputMode="search" className={clsx(field, 'font-bold')} placeholder={kind === 'employee_payroll' ? 'بحث بالاسم أو الرقم الوظيفي' : 'بحث باسم المتعهد'} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث في الأسطر" data-testid="disb-lines-search" />
          <select className={clsx(field, 'w-auto max-w-[9.5rem] font-bold')} value={sort} onChange={(e) => setSort(e.target.value as DisbursementSort)} aria-label="ترتيب الأسطر" data-testid="disb-lines-sort">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <p className="text-[11px] font-bold text-slate-500" data-testid="disb-lines-summary" aria-live="polite">
          {lines.isLoading ? 'جارٍ التحميل…' : <>{fmtMoney(total)} {kind === 'employee_payroll' ? 'موظف' : 'متعهد'}{filtered && <> · صافيهم <bdi dir="ltr" className="font-black text-slate-800">{fmtMoney(netTotal)}</bdi> د.ع</>}</>}
        </p>
      </div>

      {lines.isLoading && rows.length === 0 ? <LoadingSpinner /> : lines.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="disb-lines-error">
          تعذّر تحميل الأسطر. <button type="button" className="font-black underline" onClick={() => void lines.refetch()}>إعادة المحاولة</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-500" data-testid="disb-lines-empty">لا نتائج بهذه المرشّحات</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="disb-lines-list">
          {rows.map((l) => <li key={l.id}>{kind === 'employee_payroll' ? <EmployeeLineCard l={l} /> : <ContractorLineCard l={l} />}</li>)}
        </ul>
      )}
      {lines.hasNextPage && (
        <button type="button" onClick={() => void lines.fetchNextPage()} disabled={lines.isFetchingNextPage}
          className="h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60" data-testid="disb-lines-more">
          {lines.isFetchingNextPage ? 'جارٍ التحميل…' : `عرض المزيد (${fmtMoney(total - rows.length)} متبقٍ)`}
        </button>
      )}
    </section>
  )
}

const Cell = ({ k, v, tone }: { k: string; v: string | number; tone?: 'red' }) => (
  <div className="min-w-0"><dt className="text-[10px] font-bold leading-snug text-slate-500">{k}</dt><dd className={clsx('text-xs font-black leading-snug tabular-nums', tone === 'red' ? 'text-red-700' : 'text-slate-900')}><bdi dir="ltr">{v}</bdi></dd></div>
)
const NetAmount = ({ v }: { v: number }) => <p className="shrink-0 whitespace-nowrap text-[15px] font-black tabular-nums text-[#0b3d6b]"><bdi dir="ltr">{fmtMoney(v)}</bdi><small className="ms-1 text-[9px] font-extrabold text-slate-500">د.ع</small></p>

function EmployeeLineCard({ l }: { l: DisbursementLine }) {
  const d = l.details
  const sub = [l.group_name, l.sub_group_name].filter(Boolean).join(' · ')
  return (
    <article className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm" data-testid={`disb-line-${l.person_number ?? l.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h4 className="text-[13px] font-black leading-snug text-slate-900">{l.full_name}</h4>
          <p className="text-[10.5px] font-bold leading-snug text-slate-500">{sub}{sub && l.person_number ? ' · ' : ''}<bdi dir="ltr">{l.person_number}</bdi>{l.job_title ? ` · ${l.job_title}` : ''}</p></div>
        <NetAmount v={l.net_amount} />
      </div>
      {(l.has_deduction || l.has_advance || l.adjusted || d.no_profile) && (
        <div className="flex flex-wrap gap-1">
          {d.no_profile && <Tag tone="slate">بلا ملف راتب</Tag>}
          {l.has_deduction && <Tag tone="red">استقطاع <bdi dir="ltr">{fmtMoney(l.deductions_total)}</bdi></Tag>}
          {l.has_advance && <Tag tone="amber">سلفة <bdi dir="ltr">{fmtMoney(d.advance_installment ?? 0)}</bdi></Tag>}
          {l.adjusted && <Tag tone="blue">معدَّل يدوياً</Tag>}
        </div>
      )}
      {!d.no_profile && (
        <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5 border-t border-dashed border-slate-300 pt-2">
          <Cell k="أيام الدوام" v={d.working_days ?? 0} /><Cell k="حاضر" v={d.days_present ?? 0} /><Cell k="غياب" v={d.days_absent ?? 0} tone={(d.days_absent ?? 0) > 0 ? 'red' : undefined} />
          <Cell k="تأخير" v={minutesLabel(d.late_minutes)} /><Cell k="قبل الاستقطاع" v={fmtMoney(l.gross_amount)} /><Cell k="الصافي" v={fmtMoney(l.net_amount)} />
        </dl>
      )}
      {l.adjusted && d.finance_note && <p className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] leading-relaxed text-blue-900">ملاحظة المالية: {d.finance_note}</p>}
    </article>
  )
}

function ContractorLineCard({ l }: { l: DisbursementLine }) {
  const d = l.details
  const [open, setOpen] = useState(false)
  const days: ContractorLineDay[] = d.days ?? []
  const sub = [l.group_name, l.sub_group_name].filter(Boolean).join(' · ')
  return (
    <article className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm" data-testid={`disb-line-${l.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h4 className="text-[13px] font-black leading-snug text-slate-900">{l.full_name}</h4>
          <p className="text-[10.5px] font-bold leading-snug text-slate-500">{sub}{l.person_number ? <> · <bdi dir="ltr">{l.person_number}</bdi></> : null}</p></div>
        <NetAmount v={l.net_amount} />
      </div>
      {((d.blocked_days ?? 0) > 0 || (d.deduction_amount ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1">
          {(d.blocked_days ?? 0) > 0 && <Tag tone="amber" >محجوب بالبصمة: {d.blocked_days} {d.blocked_days === 1 ? 'يوم' : 'أيام'} · <bdi dir="ltr">{fmtMoney(d.blocked_amount ?? 0)}</bdi></Tag>}
          {(d.deduction_amount ?? 0) > 0 && <Tag tone="red">استقطاع نقص الدقائق <bdi dir="ltr">{fmtMoney(d.deduction_amount ?? 0)}</bdi> ({minutesLabel(d.deduction_minutes)})</Tag>}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5 border-t border-dashed border-slate-300 pt-2">
        <Cell k="أيام الصرف" v={d.pay_days ?? 0} /><Cell k="مدفوعة" v={d.paid_days ?? 0} /><Cell k="محجوبة" v={d.blocked_days ?? 0} tone={(d.blocked_days ?? 0) > 0 ? 'red' : undefined} />
        <Cell k="أجر المتعهد اليومي" v={fmtMoney(d.contractor_daily_wage ?? 0)} /><Cell k="أجر العامل اليومي" v={fmtMoney(d.worker_daily_wage ?? 0)} /><Cell k="قبل الحجب والاستقطاع" v={fmtMoney(l.gross_amount)} />
      </dl>
      {days.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="h-9 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 hover:bg-slate-50" data-testid={`disb-line-days-toggle-${l.id}`}>
            {open ? 'إخفاء أيام الشهر' : `أيام الشهر (${days.length})`}
          </button>
          {open && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-[11px]" data-testid={`disb-line-days-${l.id}`}>
              {days.map((x) => (
                <li key={x.date} className={clsx('flex items-center justify-between gap-2 px-2 py-1.5', x.state === 'blocked' && 'bg-amber-50/70')}>
                  <span className="font-bold text-slate-700">{dayLabel(x.date)} <span className="text-slate-400">· العدد <bdi dir="ltr">{x.headcount}</bdi></span></span>
                  <span className="text-end">
                    {x.state === 'blocked'
                      ? <b className="font-black text-amber-700">محجوب — {blockReasonLabel(x.reason)}</b>
                      : x.deduction > 0 ? <b className="font-black text-red-700">نقص {minutesLabel(x.deduct_minutes)} · −<bdi dir="ltr">{fmtMoney(x.deduction)}</bdi></b> : <b className="font-black text-emerald-700">مدفوع</b>}
                    <span className="ms-2 tabular-nums text-slate-600"><bdi dir="ltr">{fmtMoney(x.pay)}</bdi></span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  )
}

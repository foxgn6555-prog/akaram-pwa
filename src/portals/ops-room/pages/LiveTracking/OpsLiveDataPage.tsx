/**
 * بيانات وحدة البث المباشر — غرفة العمليات (00288).
 * جلسات البث (مسؤولو الأقسام/المتعهدون) حسب الأيام: اسم الحساب، القسم، أول موقع مشارَك ووقته،
 * داخل/خارج الزون المُسنَد، آخر تحديث، النقاط، المدة، وانتهاء البث — جدول احترافي + تصدير Excel بنفس الفلاتر
 * + تفاصيل الجلسة (نقاطها) عند النقر.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'
import { downloadWorkbook } from '@features/gbs/gbs-excel'
import { useLiveSessionPoints, useLiveSessions } from '@features/live-tracking/useLiveMap'
import { LIVE_FILTERS, LIVE_KIND_COLOR, LIVE_KIND_LABEL, timeHM, type LiveFilter } from '@features/live-tracking/live-map.logic'
import { DAY_PRESETS, buildLiveDataWorkbook, durationText, dayOf, endText, filterSessions, inZoneText, presetRange, summarizeSessions, type DayPreset } from '@features/live-tracking/live-data.logic'
import type { LiveSessionRow } from '@sdk/live-tracking.sdk'
import { disclosureErrorMessage } from '@sdk/disclosures-unit.sdk'

const n = (v: number) => v.toLocaleString('en-US')
const zoneCls = (v: boolean | null) => v === true ? 'bg-emerald-50 text-emerald-800' : v === false ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-600'

export default function OpsLiveDataPage() {
  const [preset, setPreset] = useState<DayPreset>('today')
  const [custom, setCustom] = useState(() => presetRange('week'))
  const [filter, setFilter] = useState<LiveFilter>('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const range = preset === 'custom' ? custom : presetRange(preset)
  const q = useLiveSessions({ from: range.from, to: range.to, kind: filter === 'all' ? null : filter })
  const all = useMemo(() => q.data ?? [], [q.data])
  const rows = useMemo(() => filterSessions(all, filter, search), [all, filter, search])
  const sum = useMemo(() => summarizeSessions(rows), [rows])
  const open = rows.find((r) => r.session_id === openId) ?? null

  const exportExcel = async () => {
    setExporting(true)
    try { await downloadWorkbook(await buildLiveDataWorkbook(rows, { from: range.from, to: range.to, filter, search }), `بيانات-البث-المباشر-${range.from}-${range.to}.xlsx`) } finally { setExporting(false) }
  }

  return (
    <div dir="rtl" className="space-y-3 pb-6" data-testid="ops-live-data-page">
      <ExecPageHeader icon="list" title="بيانات وحدة البث المباشر" subtitle="سجل جلسات البث أثناء الشفت — أول موقع مشارَك ووقته، داخل/خارج الزون المُسنَد، وآخر تحديث (الاحتفاظ 30 يوماً)"
        stats={[
          { label: 'الجلسات', value: n(sum.sessions) }, { label: 'الأشخاص', value: n(sum.people) },
          { label: 'مسؤولو الأقسام', value: n(sum.managers) }, { label: 'المتعهدون', value: n(sum.contractors) },
          { label: 'أول موقع داخل الزون', value: n(sum.firstInZone), tone: 'green' }, { label: 'أول موقع خارج الزون', value: n(sum.firstOutZone), tone: sum.firstOutZone ? 'red' : 'plain' },
          { label: 'نقاط خارج الزون', value: n(sum.outOfZonePoints), tone: sum.outOfZonePoints ? 'gold' : 'plain' }, { label: 'جارٍ الآن', value: n(sum.active) },
        ]}
        actions={<HeaderButton icon="download" testId="live-data-export" onClick={() => { void exportExcel() }}>{exporting ? 'جارٍ التصدير…' : 'تصدير Excel'}</HeaderButton>}
        links={[{ to: '/ops-room/live-tracking', label: 'خريطة البث المباشر', icon: 'map-pin' }]}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-1" data-testid="live-data-days">
          {DAY_PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} data-testid={`live-days-${p.id}`} onClick={() => setPreset(p.id)}
              className={clsx('rounded-xl px-3 py-1.5 text-xs font-black transition', preset === p.id ? 'bg-[#0b3d6b] text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{p.label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-1 text-xs font-bold">
            <input type="date" data-testid="live-data-from" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 rounded-xl border px-2" />
            <span>←</span>
            <input type="date" data-testid="live-data-to" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 rounded-xl border px-2" />
          </div>
        )}
        <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500" data-testid="live-data-range">{range.from} ← {range.to}</span>
        <div className="flex gap-1" role="tablist" data-testid="live-data-filters">
          {LIVE_FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} data-testid={`live-data-filter-${f.id}`} onClick={() => setFilter(f.id)}
              className={clsx('rounded-xl px-3 py-1.5 text-xs font-black transition', filter === f.id ? 'bg-emerald-700 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{f.label}</button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو القسم…" data-testid="live-data-search"
          className="h-9 min-w-[160px] flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold outline-none focus:border-[#0b3d6b]" />
        {q.error && <div role="alert" className="w-full rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{disclosureErrorMessage(q.error)}</div>}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-right text-xs" data-testid="live-data-table">
            <thead className="bg-[#0b3d6b] text-[11px] font-black text-white">
              <tr>
                {['#', 'اليوم', 'اسم الحساب', 'النوع', 'القسم / المنطقة', 'الشفت', 'أول موقع مشارَك', 'وقت أول مشاركة', 'الزون (أول موقع)', 'آخر تحديث', 'الزون (آخر)', 'النقاط', 'خارج الزون', 'المدة', 'الانتهاء'].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.isLoading && <tr><td colSpan={15} className="p-6 text-center font-bold text-slate-500">جارٍ التحميل…</td></tr>}
              {!q.isLoading && rows.length === 0 && <tr><td colSpan={15} className="p-6 text-center font-bold text-slate-500" data-testid="live-data-empty">لا توجد جلسات بث في هذه المدة.</td></tr>}
              {rows.map((r, i) => (
                <tr key={r.session_id} data-testid={`live-data-row-${r.session_id}`} onClick={() => setOpenId(openId === r.session_id ? null : r.session_id)}
                  className={clsx('cursor-pointer tabular-nums transition hover:bg-blue-50/60', i % 2 && 'bg-slate-50/60', openId === r.session_id && 'bg-blue-50')}>
                  <td className="px-2 py-1.5 text-slate-400">{n(i + 1)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{dayOf(r.started_at)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-black text-slate-900">{r.full_name}</td>
                  <td className="px-2 py-1.5"><span className="rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: LIVE_KIND_COLOR[r.kind] }}>{LIVE_KIND_LABEL[r.kind]}</span></td>
                  <td className="px-2 py-1.5">{r.area_names || '—'}{r.manager_name ? <span className="block text-[10px] text-slate-500">مسؤول القسم: {r.manager_name}</span> : null}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{r.shift_name ?? ''} {timeHM(r.shift_start)}–{timeHM(r.shift_end)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px]">{r.first_lat != null ? `${r.first_lat.toFixed(5)}, ${r.first_lng?.toFixed(5)}` : '—'}</td>
                  <td className="px-2 py-1.5 font-black">{timeHM(r.started_at)}</td>
                  <td className="px-2 py-1.5"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', zoneCls(r.first_in_zone))}>{inZoneText(r.first_in_zone)}</span></td>
                  <td className="px-2 py-1.5">{timeHM(r.last_seen_at)}</td>
                  <td className="px-2 py-1.5"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', zoneCls(r.last_in_zone))}>{inZoneText(r.last_in_zone)}</span></td>
                  <td className="px-2 py-1.5">{n(r.point_count)}</td>
                  <td className={clsx('px-2 py-1.5 font-black', r.out_of_zone_count ? 'text-red-700' : 'text-slate-500')}>{n(r.out_of_zone_count)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{durationText(r.duration_minutes)}</td>
                  <td className="px-2 py-1.5"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', r.ended_at ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800')}>{endText(r)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <SessionDetails row={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function SessionDetails({ row, onClose }: { row: LiveSessionRow; onClose: () => void }) {
  const pts = useLiveSessionPoints(row.session_id)
  return (
    <section className="rounded-2xl border bg-white p-3 shadow-sm" data-testid="live-session-details">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-900">تفاصيل جلسة {row.full_name} — {dayOf(row.started_at)} ({LIVE_KIND_LABEL[row.kind]} · {row.area_names || '—'})</h2>
        <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">إغلاق</button>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-right text-xs tabular-nums">
          <thead className="bg-slate-100 text-[11px] font-black"><tr>{['#', 'الوقت', 'الإحداثيات', 'الدقة', 'الزون'].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {pts.isLoading && <tr><td colSpan={5} className="p-3 text-center text-slate-500">جارٍ التحميل…</td></tr>}
            {(pts.data ?? []).map((p, i) => (
              <tr key={p.recorded_at} data-testid="live-point-row">
                <td className="px-2 py-1 text-slate-400">{n(i + 1)}</td><td className="px-2 py-1 font-black">{timeHM(p.recorded_at)}</td>
                <td className="px-2 py-1 font-mono text-[10px]">{p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}</td>
                <td className="px-2 py-1">{p.accuracy_m != null ? `±${Math.round(p.accuracy_m)} م` : '—'}</td>
                <td className="px-2 py-1"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', zoneCls(p.in_zone))}>{inZoneText(p.in_zone)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

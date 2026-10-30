/**
 * 00384 — وحدة «خريطة النفايات (بقع التوقف)» — غرفة العمليات.
 * تعرض الشهر السابق افتراضياً من النسخة الليلية (gps_hotspots). فلاتر: الشهر، القاطع (متعدد)، الصنف (الخفيف مخفي افتراضياً)،
 * التكرار، عدد الآليات؛ عدّاد وملخص؛ إطار ثابت؛ ملء الشاشة؛ قائمة أعلى البقع (أسفل الخريطة على الهاتف).
 * الموظفون لا يصلون (RLS + دالة القاعدة). تفاصيل البقعة/التصدير/المقارنة = الجولة 00385.
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import WasteMap from '@features/gps-hotspots/WasteMap'
import { useGpsHotspots } from '@features/gps-hotspots/hooks'
import { CLASS_COLOR, CLASS_LABEL, DEFAULT_FILTERS, HOTSPOT_CLASSES, HOTSPOT_RECURRENCES, MIN_VEHICLES_OPTIONS, RECURRENCE_LABEL, applyFilters, classThresholdLabel, defaultMonth, fmtMinutes, monthLabel, recurrenceThresholdLabel, summarize, toggleIn, type WasteMapFilters } from '@features/gps-hotspots/hotspots.logic'
import { useSectors } from '@features/sector'
import { lvnErrorToast } from '@features/gps-lvn/lvn-errors'

const n = (v: number) => v.toLocaleString('en-US')
const chip = (on: boolean, color?: string) => clsx('rounded-xl border px-2.5 py-1.5 text-[11px] font-black transition', on ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50', on && !color && 'bg-slate-900')

export default function OpsWasteMapPage() {
  const [month, setMonth] = useState<string | null>(null)
  const [filters, setFilters] = useState<WasteMapFilters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<number | null>(null)
  const q = useGpsHotspots(month)
  const sectorsQ = useSectors()
  const months = useMemo(() => q.data?.months ?? [], [q.data])
  // الشهر الافتراضي = الشهر السابق إن كان منسوخاً
  useEffect(() => { if (month === null && months.length) { const d = defaultMonth(months); if (d && d !== q.data?.month) setMonth(d) } }, [month, months, q.data?.month])
  const all = useMemo(() => q.data?.rows ?? [], [q.data])
  const rows = useMemo(() => applyFilters(all, filters), [all, filters])
  const sum = useMemo(() => summarize(rows), [rows])
  const shownMonth = q.data?.month ?? month
  const thresholds = q.data?.sync?.thresholds ?? null
  const sectorOptions = useMemo(() => {
    const inData = new Map<number, string>()
    for (const h of all) h.sector_ids.forEach((id, i) => inData.set(id, h.sector_names[i] ?? String(id)))
    for (const s of sectorsQ.data ?? []) if (!inData.has(s.id)) inData.set(s.id, s.name)
    return [...inData.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'))
  }, [all, sectorsQ.data])
  const top = useMemo(() => [...rows].sort((a, b) => b.total_minutes - a.total_minutes).slice(0, 30), [rows])
  const set = (patch: Partial<WasteMapFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <div className="space-y-3" dir="rtl" data-testid="ops-waste-map-page">
      <ExecPageHeader icon="map-pin"
        title="خريطة النفايات — بقع التوقف"
        subtitle={<>أين تتوقف الكابسات فعلاً؟ بقع مجمَّعة من توقفات الشهر كاملاً (10 دقائق – ساعتين) تُنسخ من مستودع GPS كل ليلة. {shownMonth ? <b>الشهر المعروض: {monthLabel(shownMonth)}</b> : null}{q.data?.sync ? <span className="text-blue-100/80"> · آخر نسخ {new Date(q.data.sync.synced_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false })}</span> : null}</>}
        stats={[
          { label: 'بقع معروضة', value: n(sum.spots) },
          { label: 'توقفات', value: n(sum.stops) },
          { label: 'إجمالي التوقف', value: fmtMinutes(sum.totalMinutes) },
          { label: 'بقع بأكثر من آلية', value: n(sum.multi) },
        ]}
      />
      <div className="grid gap-2 rounded-2xl border bg-white p-3 text-xs" data-testid="waste-map-filters">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 font-bold text-slate-600">الشهر
            <select value={shownMonth ?? ''} onChange={(e) => { setMonth(e.target.value || null); setSelected(null) }} className="rounded-xl border px-2 py-1.5 text-xs" data-testid="waste-map-month">
              {months.length === 0 && <option value="">— لا أشهر منسوخة بعد —</option>}
              {months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)} ({n(m.rows)} بقعة)</option>)}
            </select>
          </label>
          <span className="font-bold text-slate-600">الصنف:</span>
          {HOTSPOT_CLASSES.map((c) => <button key={c} type="button" aria-pressed={filters.classes.includes(c)} data-testid={`waste-filter-class-${c}`} onClick={() => set({ classes: toggleIn(filters.classes, c) })} className={chip(filters.classes.includes(c), CLASS_COLOR[c])} style={filters.classes.includes(c) ? { background: CLASS_COLOR[c] } : undefined}>{CLASS_LABEL[c]} ({n(all.filter((h) => h.dominant_class === c).length)})</button>)}
          <span className="font-bold text-slate-600">التكرار:</span>
          {HOTSPOT_RECURRENCES.map((r) => <button key={r} type="button" aria-pressed={filters.recurrence.includes(r)} data-testid={`waste-filter-rec-${r}`} onClick={() => set({ recurrence: toggleIn(filters.recurrence, r) })} className={chip(filters.recurrence.includes(r))}>{RECURRENCE_LABEL[r]} ({n(all.filter((h) => h.recurrence === r).length)})</button>)}
          <label className="flex items-center gap-1 font-bold text-slate-600">الآليات
            <select value={filters.minVehicles} onChange={(e) => set({ minVehicles: Number(e.target.value) })} className="rounded-xl border px-2 py-1.5 text-xs" data-testid="waste-filter-vehicles">
              {MIN_VEHICLES_OPTIONS.map((v) => <option key={v} value={v}>{v === 1 ? 'الكل' : `${v}+ آليات`}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { setFilters(DEFAULT_FILTERS); setSelected(null) }} className="rounded-xl border px-2.5 py-1.5 text-[11px] font-black text-slate-600" data-testid="waste-filter-reset">إعادة الضبط</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="waste-filter-sectors">
          <span className="font-bold text-slate-600">القاطع:</span>
          <button type="button" aria-pressed={filters.sectorIds.length === 0} onClick={() => set({ sectorIds: [] })} className={chip(filters.sectorIds.length === 0)}>الكل</button>
          {sectorOptions.map(([id, name]) => <button key={id} type="button" aria-pressed={filters.sectorIds.includes(id)} data-testid={`waste-filter-sector-${id}`} onClick={() => set({ sectorIds: toggleIn(filters.sectorIds, id) })} className={chip(filters.sectorIds.includes(id))}>{name}</button>)}
        </div>
        <p className="text-[10px] text-slate-500">{classThresholdLabel(thresholds)} · {recurrenceThresholdLabel(thresholds)} · الخفيف مخفي افتراضياً · مستبعد: أقل من 10 دقائق، أكثر من ساعتين، والمتوقف أكثر من يوم (عطل).</p>
      </div>
      {q.isError && <div className="rounded-xl bg-rose-50 p-2 text-center text-xs font-bold text-rose-900" data-testid="waste-map-error">{lvnErrorToast((q.error as Error).message)}</div>}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <WasteMap allRows={all} rows={rows} fitKey={shownMonth ?? ''} selectedId={selected} onSelect={(h) => setSelected(h?.id ?? null)} />
        <aside className="max-h-[72vh] overflow-auto rounded-2xl border bg-white" data-testid="waste-map-list">
          <div className="sticky top-0 border-b bg-white px-3 py-2 text-xs font-black text-slate-800">أعلى البقع ({n(Math.min(30, rows.length))} من {n(rows.length)}) — بإجمالي التوقف</div>
          {q.isLoading && <div className="p-3 text-center text-xs text-slate-500">يُحمَّل…</div>}
          {!q.isLoading && top.length === 0 && <div className="p-3 text-center text-xs text-slate-500">لا بقع بهذه الفلاتر.</div>}
          <ul className="divide-y text-[11px]">
            {top.map((h, i) => (
              <li key={h.id}>
                <button type="button" onClick={() => setSelected(h.id)} data-testid={`waste-list-${h.id}`} className={clsx('flex w-full items-center gap-2 px-3 py-2 text-right hover:bg-slate-50', selected === h.id && 'bg-cyan-50')}>
                  <span className="w-5 text-center text-[10px] font-black text-slate-400">{i + 1}</span>
                  <span className="size-3 shrink-0 rounded-full" style={{ background: CLASS_COLOR[h.dominant_class] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black text-slate-800">{h.sector_names?.join('، ') || 'خارج القواطع'}</span>
                    <span className="block text-[10px] text-slate-500">{RECURRENCE_LABEL[h.recurrence]} · {h.stops_count} توقف · {h.days_count} يوم · {h.vehicles_count} آلية</span>
                  </span>
                  <b className="shrink-0 text-slate-900">{fmtMinutes(h.total_minutes)}</b>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}

/**
 * جدول الشوارع والأزقة (المرحلة ④) — عرض جدولي كامل مع فلاتر وتصدير CSV.
 *
 * لماذا جدول مستقل عن المحرّر: المحرّر للتصحيح البصري على الخريطة؛ الجدول
 * للمراجعة السريعة والفرز والتصدير. المشرف يحتاجهما معاً لا أحدهما.
 */
import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import {
  KIND_LABEL_AR,
  STATUS_LABEL_AR,
  type MapAlley,
  type MapStreet,
  type StreetKind,
} from '@sdk/map-planning.sdk'
import { useMapAlleys, useMapMahallas, useMapStreets, useMapZones } from '@features/map-planning/hooks/useMapPlanning'

type Row =
  | { kind: 'street'; code: string; name: string | null; cls: string; length_m: number; width_m: number | null; mahalla: string; status: string }
  | { kind: 'alley'; code: string; name: string | null; cls: string; length_m: number; width_m: number | null; mahalla: string; status: string }

type SortKey = 'code' | 'length_m' | 'width_m' | 'name'
type Tab = 'all' | 'streets' | 'alleys' | 'unassigned'

const CSV_HEADERS = ['النوع', 'الكود', 'الاسم', 'التصنيف', 'الطول (م)', 'العرض (م)', 'المحلة', 'الحالة']

export default function MapPlanningTablePage() {
  const { data: zones = [] } = useMapZones()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const activeZoneId = zoneId ?? zones[0]?.id ?? null
  const { data: streets = [], isLoading: ls } = useMapStreets(activeZoneId)
  const { data: alleys = [], isLoading: la } = useMapAlleys(activeZoneId)
  const { data: mahallas = [] } = useMapMahallas(activeZoneId)

  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [kinds, setKinds] = useState<Set<StreetKind>>(new Set(['primary', 'secondary', 'tertiary', 'local']))
  const [minLen, setMinLen] = useState('')
  const [noWidth, setNoWidth] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [asc, setAsc] = useState(true)

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    if (tab !== 'alleys') {
      for (const s of streets as MapStreet[]) {
        if (s.status === 'archived' || !kinds.has(s.kind)) continue
        out.push({
          kind: 'street', code: s.code, name: s.name, cls: KIND_LABEL_AR[s.kind],
          length_m: s.length_m, width_m: s.width_m, mahalla: '—',
          status: STATUS_LABEL_AR[s.status],
        })
      }
    }
    if (tab !== 'streets') {
      for (const a of alleys as MapAlley[]) {
        if (a.status === 'archived') continue
        if (tab === 'unassigned' && a.mahalla_code !== 'MHL-0000') continue
        out.push({
          kind: 'alley', code: a.code, name: a.name, cls: 'زقاق',
          length_m: a.length_m, width_m: a.width_m,
          mahalla: a.mahalla_name ?? 'بلا محلة',
          status: STATUS_LABEL_AR[a.status],
        })
      }
    }
    const q = query.trim().toLowerCase()
    const minV = Number(minLen) || 0
    const filtered = out.filter(
      (r) =>
        (!q || r.code.toLowerCase().includes(q) || (r.name ?? '').toLowerCase().includes(q)) &&
        r.length_m >= minV &&
        (!noWidth || r.width_m === null),
    )
    filtered.sort((a, b) => {
      let c = 0
      if (sortKey === 'length_m') c = a.length_m - b.length_m
      else if (sortKey === 'width_m') c = (a.width_m ?? -1) - (b.width_m ?? -1)
      else if (sortKey === 'name') c = (a.name ?? '').localeCompare(b.name ?? '', 'ar')
      else c = a.code.localeCompare(b.code, 'ar')
      return asc ? c : -c
    })
    return filtered
  }, [streets, alleys, tab, kinds, query, minLen, noWidth, sortKey, asc])

  const toggleKind = (k: StreetKind) =>
    setKinds((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v)
    else {
      setSortKey(k)
      setAsc(true)
    }
  }

  const exportCsv = () => {
    const lines = [CSV_HEADERS.join(',')]
    for (const r of rows) {
      const cells = [
        r.kind === 'street' ? 'شارع' : 'زقاق', r.code, r.name ?? '', r.cls,
        r.length_m.toFixed(1), r.width_m === null ? '' : String(r.width_m), r.mahalla, r.status,
      ]
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }
    // BOM حتى يفتح Excel العربية بترميز صحيح
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `map-${zones.find((z) => z.id === activeZoneId)?.code ?? 'zone'}-${tab}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loading = ls || la
  const missingWidth = rows.filter((r) => r.width_m === null).length

  return (
    <div className="space-y-4" dir="rtl">
      <ExecPageHeader icon="file-spreadsheet"

        title="جدول الشوارع والأزقة"
        subtitle={`${rows.length} صفاً · ${missingWidth} بلا عرض مقيس`}
        actions={
          <button type="button" onClick={exportCsv}
            className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white ring-1 ring-white/25">
            <Download size={14} /> تصدير CSV
          </button>
        }
        links={[{ to: '/ops-room/map-planning/visits', label: 'الزيارات والتغطية', icon: 'activity' }]}
      />

      <div className="flex flex-wrap gap-2">
        {zones.map((z) => (
          <button key={z.id} type="button" onClick={() => setZoneId(z.id)} aria-pressed={z.id === activeZoneId}
            className={`rounded-xl px-3 py-2 text-xs font-black ${z.id === activeZoneId ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {z.name}
          </button>
        ))}
      </div>

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        {(['all', 'streets', 'alleys', 'unassigned'] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
            className={`rounded-xl px-3 py-2 text-[11px] font-black ${tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {t === 'all' ? 'الكل' : t === 'streets' ? 'شوارع' : t === 'alleys' ? 'أزقة' : 'بلا محلة'}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {(['primary', 'secondary', 'tertiary', 'local'] as StreetKind[]).map((k) => (
          <button key={k} type="button" onClick={() => toggleKind(k)} aria-pressed={kinds.has(k)}
            className={`rounded-xl px-2.5 py-2 text-[11px] font-black ${kinds.has(k) ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'}`}>
            {KIND_LABEL_AR[k]}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <label className="flex items-center gap-1 rounded-xl bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
          <Search size={13} />
          <input aria-label="بحث" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="كود أو اسم"
            className="w-32 bg-transparent outline-none" />
        </label>
        <label className="flex items-center gap-1 rounded-xl bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
          طول ≥
          <input aria-label="أدنى طول" value={minLen} onChange={(e) => setMinLen(e.target.value)} inputMode="numeric" placeholder="0"
            className="w-14 bg-transparent outline-none" />
          م
        </label>
        <label className="flex items-center gap-1 rounded-xl bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
          <input type="checkbox" checked={noWidth} onChange={(e) => setNoWidth(e.target.checked)} />
          بلا عرض
        </label>
      </section>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-[11px] font-black text-slate-600">
              <tr>
                <th className="px-3 py-2">النوع</th>
                <th className="cursor-pointer px-3 py-2" onClick={() => sortBy('code')}>
                  الكود {sortKey === 'code' ? (asc ? '▲' : '▼') : ''}
                </th>
                <th className="cursor-pointer px-3 py-2" onClick={() => sortBy('name')}>
                  الاسم {sortKey === 'name' ? (asc ? '▲' : '▼') : ''}
                </th>
                <th className="px-3 py-2">التصنيف</th>
                <th className="cursor-pointer px-3 py-2" onClick={() => sortBy('length_m')}>
                  الطول {sortKey === 'length_m' ? (asc ? '▲' : '▼') : ''}
                </th>
                <th className="cursor-pointer px-3 py-2" onClick={() => sortBy('width_m')}>
                  العرض {sortKey === 'width_m' ? (asc ? '▲' : '▼') : ''}
                </th>
                <th className="px-3 py-2">المحلة</th>
                <th className="px-3 py-2">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 400).map((r) => (
                <tr key={`${r.kind}-${r.code}`} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-bold text-slate-500">{r.kind === 'street' ? 'شارع' : 'زقاق'}</td>
                  <td className="px-3 py-1.5 font-black text-slate-900">{r.code}</td>
                  <td className="px-3 py-1.5 text-slate-700">{r.name ?? '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600">{r.cls}</td>
                  <td className="px-3 py-1.5 tabular-nums text-slate-700">{Math.round(r.length_m)} م</td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {r.width_m === null ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">غير مقيس</span> : `${r.width_m} م`}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{r.mahalla}</td>
                  <td className="px-3 py-1.5 text-slate-500">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 400 && (
            <p className="border-t bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-500">
              يُعرض ٤٠٠ من {rows.length} — صدّر CSV للكل
            </p>
          )}
          {!rows.length && (
            <p className="px-3 py-8 text-center text-xs font-bold text-slate-400">لا صفوف تطابق الفلاتر</p>
          )}
        </div>
      )}

      <p className="text-center text-[10px] font-bold text-slate-400">
        المحلات: {mahallas.length} · 「غير محدّدة」 {mahallas.find((m) => m.code === 'MHL-0000') ? 'موجودة' : 'غير موجودة'}
      </p>
    </div>
  )
}

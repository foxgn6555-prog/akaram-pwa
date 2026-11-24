/**
 * محرّر التخطيط الجغرافي (المرحلة ③ من الجولة ٢).
 *
 * يعرض شوارع وأزقة كل زون على الخريطة، ويسمح بـ:
 *   ① اختيار زون من الأربعة
 *   ② تصفية بالتصنيف والحالة والبحث بالكود/الاسم
 *   ③ اختيار عنصر لعرض تفاصيله (الكود، الطول، العرض، المحلة)
 *   ④ ربط زقاق بمحلته من قائمة «غير محدّدة» (MHL-0000)
 *   ⑤ مراجعة التقاطعات المسجّلة (قرار المشرف)
 *
 * الحرّاس في القاعدة هي المرجع: أي خطأ يعود بنصّه العربي (MAP_OVERLAP …)
 * ويُعرض كما هو بدل رسالة عامة.
 */
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Polyline, Marker, Tooltip, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Filter, Link2, Pencil, Route, TriangleAlert } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import MapTiles, { MapThemeToggle, useInjectMapThemeStyle } from '@features/map-theme/MapTiles'
import { MAP_MAX_ZOOM, zoneBorderColor } from '@features/map-theme/map-theme'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import {
  KIND_LABEL_AR,
  STATUS_LABEL_AR,
  type MapAlley,
  type MapPoint,
  type MapStreet,
  type StreetKind,
} from '@sdk/map-planning.sdk'
import { mapImportSdk } from '@sdk/map-import.sdk'
import { useUiStore } from '@stores/ui.store'
import { parseZonePolygonText } from '@features/map-import/lib/zone-polygon'
import type { LatLng } from '@features/map-import/lib/geometry'
import { EditPanel } from '@features/map-import/components/EditPanel'
import { useMapEdit } from '@features/map-import/hooks/useMapEdit'
import {
  useDecideReview,
  useLinkAlleyMahalla,
  useSaveAlley,
  useSaveStreet,
  useMapAlleys,
  useMapMahallas,
  useMapReviews,
  useMapSkips,
  useMapStreets,
  useMapZones,
} from '@features/map-planning/hooks/useMapPlanning'

/** ألوان التصنيف — ثابتة عبر الخريطة والجدول ووسيلة الإيضاح */
const KIND_COLOR: Record<StreetKind, string> = {
  primary: '#dc2626',
  secondary: '#ea580c',
  tertiary: '#ca8a04',
  local: '#0d9488',
}
const ALLEY_COLOR = '#7c3aed'

/**
 * أيقونة نقطة السحب — `CircleMarker` يرث `Path` ولا يدعم السحب في Leaflet،
 * لذا نستخدم `Marker` مع `divIcon` دائري: يبدو كنقطة ويُسحب فعلاً.
 */
const VERTEX_ICON = divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#0b3d6b;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

type Layer = 'streets' | 'alleys' | 'both'
type Selected = { kind: 'street'; row: MapStreet } | { kind: 'alley'; row: MapAlley } | null

/** يضبط الخريطة على حدود العناصر عند تغيير الزون */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useMemo(() => {
    if (!points.length) return
    try {
      map.fitBounds(points as [number, number][], { padding: [24, 24] })
    } catch {
      /* نقاط غير صالحة — لا نكسر الخريطة */
    }
  }, [points, map])
  return null
}

export default function MapPlanningEditorPage() {
  useInjectMapThemeStyle()
  const [theme, , toggleTheme] = useMapTheme()
  const { data: zones = [], isLoading: zonesLoading } = useMapZones()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const activeZoneId = zoneId ?? zones[0]?.id ?? null

  const { data: streets = [], isLoading: streetsLoading } = useMapStreets(activeZoneId)
  const { data: alleys = [], isLoading: alleysLoading } = useMapAlleys(activeZoneId)
  const { data: mahallas = [] } = useMapMahallas(activeZoneId)
  const { data: reviews = [] } = useMapReviews(activeZoneId)
  const { data: skips = [] } = useMapSkips(activeZoneId)

  const [layer, setLayer] = useState<Layer>('both')
  const [kinds, setKinds] = useState<Set<StreetKind>>(new Set(['primary', 'secondary', 'tertiary', 'local']))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Selected>(null)
  const [linkTo, setLinkTo] = useState<string>('')

  const decide = useDecideReview()
  const linkAlley = useLinkAlleyMahalla()
  const saveStreet = useSaveStreet()
  const saveAlley = useSaveAlley()
  const addToast = useUiStore((s) => s.addToast)

  // ── مضلّع الزون: مصدر التحقق قبل الحفظ ──
  const [zonePolygon, setZonePolygon] = useState<LatLng[]>([])
  useEffect(() => {
    if (!activeZoneId) return
    let alive = true
    void (async () => {
      try {
        const text = await mapImportSdk.zonePolygonText(activeZoneId)
        if (alive) setZonePolygon(parseZonePolygonText(text))
      } catch {
        if (alive) setZonePolygon([])
      }
    })()
    return () => {
      alive = false
    }
  }, [activeZoneId])

  const editor = useMapEdit(zonePolygon)

  const activeZone = zones.find((z) => z.id === activeZoneId)
  const unassigned = mahallas.find((m) => m.code === 'MHL-0000')

  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

  const shownStreets = useMemo(() => {
    if (layer === 'alleys') return []
    const q = norm(query)
    return streets.filter(
      (s) =>
        s.status !== 'archived' &&
        kinds.has(s.kind) &&
        (!q || norm(s.code).includes(q) || norm(s.name).includes(q)),
    )
  }, [streets, layer, kinds, query])

  const shownAlleys = useMemo(() => {
    if (layer === 'streets') return []
    const q = norm(query)
    return alleys.filter(
      (a) => a.status !== 'archived' && (!q || norm(a.code).includes(q) || norm(a.name).includes(q)),
    )
  }, [alleys, layer, query])

  const boundsPoints = useMemo(() => {
    const out: [number, number][] = []
    for (const s of shownStreets) for (const p of s.path) out.push(p)
    for (const a of shownAlleys) for (const p of a.path) out.push(p)
    return out
  }, [shownStreets, shownAlleys])

  const totalStreets = streets.filter((s) => s.status !== 'archived').length
  const totalAlleys = alleys.filter((a) => a.status !== 'archived').length
  const totalStreetsKm = streets.reduce((acc, s) => acc + s.length_m, 0) / 1000
  const totalAlleysKm = alleys.reduce((acc, a) => acc + a.length_m, 0) / 1000
  const loading = zonesLoading || streetsLoading || alleysLoading

  const pickZone = (id: string) => {
    setZoneId(id)
    setSelected(null)
    setLinkTo('')
  }

  const toggleKind = (k: StreetKind) =>
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── الرأس الموحّد + شريط الزون ── */}
      <ExecPageHeader icon="map-pin"

        title="محرّر التخطيط الجغرافي"
        subtitle="شوارع وأزقة الزونات — التصنيف والطول والعرض من الاستيراد الحقيقي"
        stats={[
          { label: 'شوارع', value: totalStreets, tone: 'plain' },
          { label: 'أزقة', value: totalAlleys, tone: 'plain' },
          { label: 'تقاطعات للمراجعة', value: reviews.length, tone: reviews.length ? 'gold' : 'plain' },
        ]}
        actions={<MapThemeToggle theme={theme} onToggle={toggleTheme} />}
      />

      <div className="flex flex-wrap gap-2">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => pickZone(z.id)}
            aria-pressed={z.id === activeZoneId}
            className={`rounded-xl px-3 py-2 text-xs font-black transition ${
              z.id === activeZoneId ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {z.name}
          </button>
        ))}
      </div>

      {zonesLoading && <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}

      {!zonesLoading && !zones.length && (
        <p className="rounded-2xl bg-amber-50 p-5 text-sm font-bold text-amber-900">
          لا توجد زونات مخطَّطة بعد. طبّق هجرات التخطيط الجغرافي أولاً.
        </p>
      )}

      {activeZone && (
        <>
          {/* ── البطاقات ── */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="الشوارع" value={`${totalStreets}`} note={`${totalStreetsKm.toFixed(1)} كم`} />
            <Stat label="الأزقة" value={`${totalAlleys}`} note={`${totalAlleysKm.toFixed(1)} كم`} />
            <Stat label="المحلات" value={`${mahallas.length}`} note={`${unassigned ? 'منها ١ غير محدّدة' : 'كلها مربوطة'}`} />
            <Stat
              label="تقاطعات للمراجعة"
              value={`${reviews.length}`}
              note={skips.length ? `${skips.length} عنصراً متخطّى` : 'لا تخطيات'}
              warn={reviews.length > 0 || skips.length > 0}
            />
          </section>

          {/* ── الفلاتر ── */}
          <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <span className="flex items-center gap-1 text-xs font-black text-slate-500">
              <Filter size={14} /> تصفية
            </span>
            <input
              aria-label="بحث بالكود أو الاسم"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بكود أو اسم"
              className="min-w-[160px] flex-1 rounded-xl border px-3 py-2 text-sm"
            />
            {(['both', 'streets', 'alleys'] as Layer[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLayer(l)}
                aria-pressed={layer === l}
                className={`rounded-xl px-3 py-2 text-[11px] font-black ${
                  layer === l ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {l === 'both' ? 'الكل' : l === 'streets' ? 'شوارع' : 'أزقة'}
              </button>
            ))}
            {(['primary', 'secondary', 'tertiary', 'local'] as StreetKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                aria-pressed={kinds.has(k)}
                className={`rounded-xl px-3 py-2 text-[11px] font-black ${
                  kinds.has(k) ? 'text-white' : 'bg-slate-100 text-slate-500'
                }`}
                style={kinds.has(k) ? { backgroundColor: KIND_COLOR[k] } : undefined}
              >
                {KIND_LABEL_AR[k]}
              </button>
            ))}
          </section>

          {/* ── الخريطة + اللوحة ── */}
          <section className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <MapContainer
                center={[33.30, 44.42]}
                zoom={13}
                style={{ height: '520px' }}
                /* نفس سقف الاستيراد — Leaflet الافتراضي ١٨ وليس ١٩ */
                maxZoom={MAP_MAX_ZOOM}
                scrollWheelZoom
              >
                <MapTiles theme={theme} />
                <FitBounds points={boundsPoints} />
                {shownStreets.map((s) => (
                  <Polyline
                    key={s.id}
                    positions={s.path}
                    pathOptions={{
                      color: KIND_COLOR[s.kind],
                      weight: selected?.kind === 'street' && selected.row.id === s.id ? 7 : 4,
                      opacity: 0.9,
                    }}
                    eventHandlers={{ click: () => setSelected({ kind: 'street', row: s }) }}
                  >
                    <Tooltip>{`${s.code} · ${s.name ?? 'بلا اسم'} · ${Math.round(s.length_m)} م`}</Tooltip>
                  </Polyline>
                ))}
                {shownAlleys.map((a) => (
                  <Polyline
                    key={a.id}
                    positions={a.path}
                    pathOptions={{
                      color: ALLEY_COLOR,
                      weight: selected?.kind === 'alley' && selected.row.id === a.id ? 6 : 2,
                      opacity: 0.75,
                      dashArray: '4 3',
                    }}
                    eventHandlers={{ click: () => setSelected({ kind: 'alley', row: a }) }}
                  >
                    <Tooltip>{`${a.code} · ${a.name ?? 'بلا اسم'} · ${Math.round(a.length_m)} م`}</Tooltip>
                  </Polyline>
                ))}

                {/* ── وضع التعديل: المسودة + نقاط السحب ── */}
                {editor.draft && (
                  <>
                    <Polyline
                      positions={editor.draft.pts as [number, number][]}
                      pathOptions={{ color: zoneBorderColor(theme), weight: 6, opacity: 0.95 }}
                    />
                    {editor.draft.pts.map((pt, i) => (
                      <Marker
                        key={`v-${i}-${pt[0]}-${pt[1]}`}
                        position={pt as [number, number]}
                        icon={VERTEX_ICON}
                        draggable
                        eventHandlers={{
                          dragend: (e) => {
                            const { lat, lng } = e.target.getLatLng()
                            const next = editor.draft!.pts.map((p, k) =>
                              k === i ? ([lat, lng] as LatLng) : p,
                            )
                            editor.apply({ pts: next })
                          },
                        }}
                      />
                    ))}
                  </>
                )}
              </MapContainer>
              <Legend theme={theme} shownLineCount={shownStreets.length + shownAlleys.length} />
            </div>

            <aside className="space-y-3">
              {editor.draft ? (
                <EditPanel
                  draft={editor.draft}
                  errors={editor.errors}
                  canUndo={editor.canUndo}
                  canRedo={editor.canRedo}
                  valid={editor.valid}
                  saving={saveStreet.isPending || saveAlley.isPending}
                  onName={(v) => editor.apply({ name: v })}
                  onKind={(v) => editor.apply({ kind: v })}
                  onUndo={editor.undo}
                  onRedo={editor.redo}
                  onCancel={() => {
                    editor.cancel()
                    setSelected(null)
                  }}
                  onSave={() => {
                    const d = editor.prepareSave()
                    if (!d || !activeZoneId) return
                    const done = () => {
                      editor.cancel()
                      setSelected(null)
                    }
                    if (d.target.kind === 'street') {
                      /**
                       * ⚠ الحقول غير المعروضة في المحرّر تُمرَّر كما هي.
                       *   عدم تمريرها كان يعني إمّا `null` للعرض (فترفضه القاعدة
                       *   NOT NULL) أو كسر صفة الجسر؛ وتمريرها بالقيمة الحالية
                       *   هو الوحيد الذي «يعدّل ما طلبه المشرف فقط».
                       */
                      const street = streets.find((x) => x.id === d.target.id)
                      saveStreet.mutate(
                        {
                          id: d.target.id,
                          zone_id: activeZoneId,
                          code: d.target.code,
                          name: d.name?.trim() || null,
                          kind: d.kind as StreetKind,
                          path: d.pts as MapPoint[],
                          width_m: street?.width_m ?? undefined,
                          is_bridge: street?.is_bridge,
                        },
                        { onSuccess: done },
                      )
                    } else {
                      const alley = alleys.find((a) => a.id === d.target.id)
                      /**
                       * الزقاق يحمل محلةً إلزامية في القاعدة. غيابها هنا ليس
                       * «لا شيء يحدث» — كان `return` صامتاً بلا رسالة، فيظنّ
                       * المشرف أن الحفظ جرى. الآن يُبلَّغ صراحةً.
                       */
                      if (!alley?.mahalla_id) {
                        addToast({
                          type: 'error',
                          message: 'هذا الزقاق بلا محلة في القاعدة — لا يمكن حفظه. اربطه بمحلة من الجدول أولاً.',
                        })
                        return
                      }
                      saveAlley.mutate(
                        {
                          id: d.target.id,
                          zone_id: activeZoneId,
                          mahalla_id: alley.mahalla_id,
                          code: d.target.code,
                          name: d.name?.trim() || null,
                          path: d.pts as MapPoint[],
                          width_m: alley.width_m ?? undefined,
                        },
                        { onSuccess: done },
                      )
                    }
                  }}
                />
              ) : selected ? (
                <DetailsCard
                  selected={selected}
                  mahallas={mahallas}
                  linkTo={linkTo}
                  setLinkTo={setLinkTo}
                  onEdit={() => {
                    const r = selected.row
                    editor.begin({
                      kind: selected.kind,
                      id: r.id,
                      code: r.code,
                      pts: r.path.map((p) => [p[0], p[1]] as LatLng),
                      name: r.name,
                      kindValue: selected.kind === 'street' ? (selected.row as MapStreet).kind : 'alley',
                    })
                  }}
                  onLink={(mahallaId) => {
                    if (!activeZoneId || selected.kind !== 'alley') return
                    linkAlley.mutate(
                      { alleyId: selected.row.id, mahallaId, zoneId: activeZoneId },
                      { onSuccess: () => setSelected(null) },
                    )
                  }}
                  onClose={() => setSelected(null)}
                  linking={linkAlley.isPending}
                />
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs font-bold text-slate-500">
                  اختر شارعاً أو زقاقاً من الخريطة لعرض تفاصيله
                </p>
              )}

              {reviews.length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <h2 className="flex items-center gap-1 text-xs font-black text-amber-900">
                    <TriangleAlert size={14} /> تقاطعات تنتظر المراجعة ({reviews.length})
                  </h2>
                  <ul className="mt-2 space-y-1">
                    {reviews.slice(0, 6).map((r) => (
                      <li key={r.id} className="rounded-xl bg-white/70 p-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-slate-800">
                            {r.record_code} ↔ {r.other_code}
                          </span>
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() =>
                              activeZoneId &&
                              decide.mutate({ id: r.id, zoneId: activeZoneId, decision: 'ok' })
                            }
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white disabled:opacity-40"
                          >
                            {decide.isPending ? '…' : 'مقبول'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {reviews.length > 6 && (
                    <p className="mt-1 text-[10px] font-bold text-amber-800">
                      و{reviews.length - 6} أخرى…
                    </p>
                  )}
                </section>
              )}
            </aside>
          </section>
        </>
      )}

      {loading && !zonesLoading && (
        <p className="text-center text-xs font-bold text-slate-400">جارٍ تحميل عناصر الزون…</p>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  note,
  warn,
}: {
  label: string
  value: string
  note: string
  warn?: boolean
}) {
  return (
    <article
      className={`rounded-2xl border p-4 ${
        warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
      <p className={`text-[11px] font-bold ${warn ? 'text-amber-800' : 'text-slate-500'}`}>{note}</p>
    </article>
  )
}

function Legend({ theme, shownLineCount }: { theme: 'light' | 'dark'; shownLineCount: number }) {
  const base =
    theme === 'dark'
      ? 'bg-slate-900/85 text-white border-white/10'
      : 'bg-white/95 text-slate-800 border-slate-200'
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t px-3 py-2 text-[11px] font-bold ${base}`}>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1 w-5 rounded" style={{ backgroundColor: KIND_COLOR.primary }} />
        رئيسي
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1 w-5 rounded" style={{ backgroundColor: KIND_COLOR.secondary }} />
        ثانوي
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1 w-5 rounded" style={{ backgroundColor: KIND_COLOR.tertiary }} />
        ثالثة
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1 w-5 rounded" style={{ backgroundColor: KIND_COLOR.local }} />
        محلي
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: ALLEY_COLOR }} />
        زقاق
      </span>
      <span className="mr-auto flex items-center gap-1 opacity-70">
        <Route size={12} /> {shownLineCount} خطاً معروضاً
      </span>
    </div>
  )
}

function DetailsCard({
  selected,
  mahallas,
  linkTo,
  setLinkTo,
  onLink,
  onEdit,
  onClose,
  linking,
}: {
  selected: NonNullable<Selected>
  mahallas: { id: string; code: string; name: string }[]
  linkTo: string
  setLinkTo: (v: string) => void
  onLink: (mahallaId: string) => void
  onEdit: () => void
  onClose: () => void
  linking: boolean
}) {
  const isStreet = selected.kind === 'street'
  const row = selected.row
  const needsLink = !isStreet && (selected.row as MapAlley).mahalla_code === 'MHL-0000'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-black text-slate-500">
            {isStreet ? 'شارع' : 'زقاق'}
          </p>
          <h2 className="text-lg font-black text-slate-900">{row.code}</h2>
          <p className="text-xs font-bold text-slate-600">{row.name ?? 'بلا اسم'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            data-testid="edit-start"
            className="inline-flex items-center gap-1 rounded-lg bg-[#0b3d6b] px-2 py-1 text-[10px] font-black text-white hover:bg-[#0b4f8a]"
          >
            <Pencil size={11} />
            تعديل
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600"
          >
            إغلاق
          </button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-slate-50 p-2">
          <dt className="font-bold text-slate-500">الطول</dt>
          <dd className="font-black text-slate-900">{Math.round(row.length_m)} م</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <dt className="font-bold text-slate-500">العرض</dt>
          <dd className="font-black text-slate-900">
            {row.width_m === null ? 'غير مقيس' : `${row.width_m} م`}
          </dd>
        </div>
        {isStreet ? (
          <>
            <div className="rounded-xl bg-slate-50 p-2">
              <dt className="font-bold text-slate-500">التصنيف</dt>
              <dd className="font-black text-slate-900">
                {KIND_LABEL_AR[(selected.row as MapStreet).kind]}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <dt className="font-bold text-slate-500">الحالة</dt>
              <dd className="font-black text-slate-900">
                {STATUS_LABEL_AR[(selected.row as MapStreet).status]}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 p-2">
              <dt className="font-bold text-slate-500">المحلة</dt>
              <dd className="font-black text-slate-900">
                {(selected.row as MapAlley).mahalla_code ?? '—'}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-2">
              <dt className="font-bold text-slate-500">الحالة</dt>
              <dd className="font-black text-slate-900">
                {STATUS_LABEL_AR[(selected.row as MapAlley).status]}
              </dd>
            </div>
          </>
        )}
      </dl>

      {needsLink && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1 text-[11px] font-black text-amber-900">
            <Link2 size={13} /> زقاق بلا محلة — اربطه
          </p>
          <select
            aria-label="اختر المحلة"
            value={linkTo}
            onChange={(e) => setLinkTo(e.target.value)}
            className="mt-2 w-full rounded-lg border px-2 py-1 text-[11px] font-bold"
          >
            <option value="">— اختر محلة —</option>
            {mahallas
              .filter((m) => m.code !== 'MHL-0000')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!linkTo || linking}
            onClick={() => onLink(linkTo)}
            className="mt-2 w-full rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40"
          >
            {linking ? 'جارٍ الربط…' : 'ربط'}
          </button>
        </div>
      )}
    </section>
  )
}

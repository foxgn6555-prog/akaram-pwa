/**
 * استيراد خريطة زون — الجولة ① من مسار «الشوارع على الخريطة».
 *
 * أربع خطوات مرئية للمشرف، وكل خطوة تُظهر أدلتها:
 *   ① **سكربت الزون** — يُنسخ من القاعدة (`app.map_osm_script`) ثم يُشغَّل على overpass-turbo
 *   ② **إسقاط ملف** — .osm/.xml يُقرأ **في المتصفح** ولا يُرسل للخادم (١٠٠+ م.ب مدعومة)
 *   ③ **معاينة** — شوارع/أزقة/محلات · الطول · الكثافة مقارنةً بـ٢١.٣ · المستبعدات بالسبب · عيّنة ٥٠
 *   ④ **إدراج على دفعات** — شريط تقدّم، آمن للتكرار، والاسم اليدوي لا يُطغى
 *
 * لا نشر ولا كتابة في هذه الصفحة إلا بزر «ابدأ الإدراج» بعد معاينة صريحة.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Polyline, Polygon, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ClipboardCheck, FileUp, Layers, MapPin, Play, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'
import MapTiles, { MapThemeToggle, useInjectMapThemeStyle } from '@features/map-theme/MapTiles'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import { useMapImport } from '@features/map-import/hooks/useMapImport'
import { useMapZones } from '@features/map-planning/hooks/useMapPlanning'
import { DENSITY_REFERENCE, mapImportSdk } from '@sdk/map-import.sdk'
import type { LatLng } from '@features/map-import/lib/geometry'
import { polygonAreaM2 } from '@features/map-import/lib/geometry'
import type { StreetKind } from '@sdk/map-planning.sdk'

const KIND_COLOR: Record<StreetKind, string> = {
  primary: '#dc2626',
  secondary: '#ea580c',
  tertiary: '#ca8a04',
  local: '#0d9488',
}
const ALLEY_COLOR = '#7c3aed'
/** حجم العيّنة المعروضة على الخريطة المصغّرة */
const SAMPLE_SIZE = 50

/** يحوّل مضلّع Overpass النصي «lat lon lat lon …» إلى نقاط */
function parsePolygonText(text: string): LatLng[] {
  const nums = text
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  const out: LatLng[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const lat = nums[i]
    const lng = nums[i + 1]
    if (lat !== undefined && lng !== undefined) out.push([lat, lng])
  }
  return out
}

/** بطاقة إحصاء واحدة — الرقم ثم معناه */
function Stat({ label, value, hint, tone = 'plain' }: {
  label: string
  value: string
  hint?: string
  tone?: 'plain' | 'gold' | 'green' | 'red'
}) {
  const color =
    tone === 'gold' ? 'text-[#a67c00]' : tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-black tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight text-slate-400">{hint}</div>}
    </div>
  )
}

/** مقارنة الكثافة بالمرجع — الفرق والاتجاه، بلا تجميل */
function DensityBar({ density }: { density: number }) {
  const delta = density - DENSITY_REFERENCE
  const pct = DENSITY_REFERENCE > 0 ? (delta / DENSITY_REFERENCE) * 100 : 0
  const ok = Math.abs(pct) <= 15
  const color = ok ? 'bg-emerald-500' : Math.abs(pct) <= 35 ? 'bg-amber-500' : 'bg-red-500'
  const width = Math.max(2, Math.min(100, (density / (DENSITY_REFERENCE * 2)) * 100))
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-slate-500">الكثافة كم/كم²</span>
        <span className="text-sm font-black tabular-nums text-slate-900">
          {density.toFixed(1)}
          <span className="ms-1 text-[10px] font-bold text-slate-400">/ المرجع {DENSITY_REFERENCE}</span>
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
        {/* علامة المرجع — ٥٠٪ دائماً لأن المقياس مضاعف */}
        <div className="absolute inset-y-0 start-1/2 w-px bg-slate-900/40" />
      </div>
      <div className={`mt-1 text-[10px] font-bold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
        {delta >= 0 ? '+' : ''}
        {pct.toFixed(0)}٪ عن المرجع {ok ? '— ضمن المدى الطبيعي' : '— يستحق مراجعة الحدود أو الملف'}
      </div>
    </div>
  )
}

export default function OpsMapImportPage() {
  useInjectMapThemeStyle()
  const [theme, , toggleTheme] = useMapTheme()
  const { data: zones = [], isLoading: zonesLoading } = useMapZones()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const activeZoneId = zoneId ?? zones[0]?.id ?? null
  const activeZone = zones.find((z) => z.id === activeZoneId)

  const { phase, analyze, insert, reset } = useMapImport()
  const [script, setScript] = useState<string>('')
  const [scriptCopied, setScriptCopied] = useState(false)
  const [polygon, setPolygon] = useState<LatLng[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showSkips, setShowSkips] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // نجلب مضلّع الزون والسكربت عند تغيير الزون — كلاهما من القاعدة لا من نسخة محلية
  useEffect(() => {
    if (!activeZoneId) return
    let alive = true
    setScript('')
    setPolygon([])
    reset()
    void (async () => {
      try {
        const [s, polyText] = await Promise.all([
          mapImportSdk.zoneScript(activeZoneId),
          mapImportSdk.zonePolygonText(activeZoneId),
        ])
        if (!alive) return
        setScript(s.script)
        setPolygon(parsePolygonText(polyText))
      } catch {
        if (alive) setScript('')
      }
    })()
    return () => {
      alive = false
    }
  }, [activeZoneId, reset])

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setScriptCopied(true)
      window.setTimeout(() => setScriptCopied(false), 2000)
    } catch {
      setScriptCopied(false)
    }
  }

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return
    await analyze(file, polygon)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    await handleFile(file)
  }

  const preview = phase.kind === 'preview' ? phase.preview : phase.kind === 'done' ? phase.preview : null
  const areaKm2 = useMemo(
    () => (polygon.length >= 3 ? polygonAreaM2(polygon) / 1e6 : 0),
    [polygon],
  )

  /** عيّنة ٥٠ موزّعة على الصفوف — أول ٢٥ وآخر ٢٥ أو توزيع منتظم */
  const sample = useMemo(() => {
    if (!preview) return []
    const rows = preview.rows.filter((r) => r.pts.length >= 2)
    if (rows.length <= SAMPLE_SIZE) return rows
    const step = rows.length / SAMPLE_SIZE
    return Array.from({ length: SAMPLE_SIZE }, (_, i) => rows[Math.floor(i * step)]).filter(
      (r): r is (typeof rows)[number] => !!r,
    )
  }, [preview])

  const mapPoints = useMemo(() => {
    const out: LatLng[] = []
    for (const r of sample) out.push(...r.pts)
    if (out.length === 0) out.push(...polygon)
    return out
  }, [sample, polygon])

  const busy = phase.kind === 'parsing' || phase.kind === 'inserting'

  return (
    <div className="space-y-4" dir="rtl">
      <ExecPageHeader icon="map-pin"
        title="استيراد خريطة الزون"
        subtitle={`سكربت جاهز ← ملف .osm يُقرأ في جهازك ← معاينة ← إدراج على دفعات · المرجع ${DENSITY_REFERENCE} كم/كم²`}
        stats={
          preview
            ? [
                { label: 'شوارع', value: preview.stats.streets, tone: 'green' },
                { label: 'أزقة', value: preview.stats.alleys, tone: 'gold' },
                { label: 'كم', value: preview.stats.totalLengthKm.toFixed(1) },
                { label: 'كثافة', value: preview.stats.density.toFixed(1) },
              ]
            : [{ label: 'الزونات', value: zones.length }, { label: 'المرجع', value: DENSITY_REFERENCE }]
        }
        actions={
          <div className="flex items-center gap-2">
            <MapThemeToggle theme={theme} onToggle={toggleTheme} />
            {phase.kind !== 'idle' && (
              <HeaderButton icon="x" primary={false} onClick={reset}>
                إلغاء
              </HeaderButton>
            )}
          </div>
        }
      />

      {/* ── اختيار الزون ── */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-xs font-black text-slate-500">الزون:</span>
        {zonesLoading && <span className="text-xs text-slate-400">جارٍ التحميل…</span>}
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => setZoneId(z.id)}
            className={`h-8 rounded-xl px-3 text-xs font-black transition ${
              z.id === activeZoneId
                ? 'bg-gradient-to-l from-[#0b3d6b] to-[#0b4f8a] text-white shadow'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {z.name}
            <span className="ms-1 text-[10px] opacity-70">{z.code}</span>
          </button>
        ))}
        {activeZone && areaKm2 > 0 && (
          <span className="ms-auto text-[11px] font-bold text-slate-400">
            مساحة {areaKm2.toFixed(2)} كم² · {polygon.length} نقطة حدّ
          </span>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ══ ① السكربت ══ */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <span className="grid size-6 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">١</span>
            سكربت الزون
            <span className="text-[10px] font-bold text-slate-400">من مضلّعك الحقيقي</span>
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            انسخه والصقه في <span dir="ltr">overpass-turbo.eu</span> ← Run ← Export ← raw OSM data.
            الملف الناتج هو ما ستُسقطه في الخطوة ٢.
          </p>
          <div className="relative mt-2">
            <pre
              dir="ltr"
              className="max-h-52 overflow-auto rounded-xl bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-200"
            >
              {script || '— يُولَّد من القاعدة —'}
            </pre>
            <button
              type="button"
              onClick={copyScript}
              disabled={!script}
              className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-black text-slate-800 shadow hover:bg-white disabled:opacity-50"
            >
              <ClipboardCheck size={12} />
              {scriptCopied ? 'نُسخ ✓' : 'نسخ'}
            </button>
          </div>
        </section>

        {/* ══ ② إسقاط الملف ══ */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <span className="grid size-6 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">٢</span>
            إسقاط ملف .osm
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
              لا يُرسَل للخادم
            </span>
          </h2>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            className={`mt-2 grid min-h-36 cursor-pointer place-items-center rounded-xl border-2 border-dashed p-4 text-center transition ${
              dragOver ? 'border-[#0b3d6b] bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            } ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <div>
              <FileUp className="mx-auto text-slate-400" size={28} />
              <div className="mt-1 text-xs font-black text-slate-700">
                أفلت الملف هنا أو اضغط للاختيار
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                .osm أو .xml — ١٠٠ م.ب أو أكثر · يُقرأ تدفّقياً
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".osm,.xml,application/xml,text/xml"
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>

          {phase.kind === 'parsing' && (
            <div className="mt-2 text-[11px] font-bold text-slate-600">
              يقرأ… {phase.nodes.toLocaleString('ar-IQ-u-nu-latn')} عقدة ·{' '}
              {phase.ways.toLocaleString('ar-IQ-u-nu-latn')} شوط
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#0b3d6b] transition-all"
                  style={{ width: `${Math.min(100, (phase.bytesRead / Math.max(1, phase.totalBytes)) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ══ خطأ ══ */}
      {phase.kind === 'error' && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <div>تعذّر إكمال العملية</div>
            <div className="mt-0.5 text-[11px] font-normal opacity-80">{phase.message}</div>
          </div>
        </div>
      )}

      {/* ══ ③ المعاينة ══ */}
      {preview && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
              <span className="grid size-6 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">٣</span>
              المعاينة قبل الإدراج
              {phase.kind === 'preview' && (
                <span className="ms-auto text-[10px] font-bold text-slate-400">
                  {phase.fileName} · قُرئ في {(phase.ms / 1000).toFixed(1)} ثانية
                </span>
              )}
            </h2>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="شوارع" value={String(preview.stats.streets)} tone="green" />
              <Stat label="أزقة" value={String(preview.stats.alleys)} tone="gold" />
              <Stat label="محلات" value={String(preview.stats.mahallas)} hint="من أرقام OSM الرسمية" />
              <Stat label="الطول الكلي" value={`${preview.stats.totalLengthKm.toFixed(1)} كم`} />
              <Stat label="المساحة" value={`${preview.stats.areaKm2.toFixed(2)} كم²`} />
              <Stat
                label="الطول ≈ كثافة"
                value={preview.stats.density.toFixed(1)}
                hint="كم/كم²"
                tone={Math.abs(preview.stats.density - DENSITY_REFERENCE) / DENSITY_REFERENCE <= 0.15 ? 'green' : 'red'}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DensityBar density={preview.stats.density} />
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px]">
                {preview.stats.unnamedAlleys > 0 && (
                  <div className="font-bold text-amber-700">
                    ⚠ {preview.stats.unnamedAlleys} زقاق بلا اسم — سيُربط بـ MHL-0000 حتى يُصحَّح يدوياً
                  </div>
                )}
                {preview.stats.clipFallbacks > 0 && (
                  <div className="font-bold text-amber-700">
                    ⚠ {preview.stats.clipFallbacks} شوطاً لم يُقصّ كلياً — أُدرج كما هو
                  </div>
                )}
                {preview.stats.densityWarn && (
                  <div className="font-bold text-red-700">{preview.stats.densityWarn}</div>
                )}
                {preview.stats.unnamedAlleys === 0 && preview.stats.clipFallbacks === 0 && !preview.stats.densityWarn && (
                  <div className="font-bold text-emerald-700">✔ لا تحذيرات — الأرقام متسقة مع المرجع</div>
                )}
                <div className="mt-1 text-[10px] text-slate-500">
                  {preview.mahallas.__UNASSIGNED__ ? 'المحلات المربوطة بحدود OSM مفتوحة — الربط بالاسم فقط' : ''}
                </div>
              </div>
            </div>
          </section>

          {/* ── الخريطة المصغّرة + العيّنة ── */}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                  <Layers size={14} className="text-slate-400" />
                  عيّنة {sample.length} من {preview.rows.length}
                </h3>
                <span className="text-[10px] text-slate-400">الحدّ الأزرق · الشوارع ملوّنة بالتصنيف · الأزقة بنفسجي</span>
              </div>
              <div className="h-80">
                {mapPoints.length > 0 && (
                  <MapContainer
                    bounds={mapPoints as [number, number][]}
                    boundsOptions={{ padding: [16, 16] }}
                    className="h-full w-full"
                    scrollWheelZoom
                  >
                    <MapTiles theme={theme} />
                    {polygon.length >= 3 && (
                      <Polygon
                        positions={polygon as [number, number][]}
                        pathOptions={{ color: '#0b3d6b', weight: 2, fill: false, dashArray: '4 3' }}
                      />
                    )}
                    {sample.map((r) => (
                      <Polyline
                        key={`${r.code}-${r.osmWayId}`}
                        positions={r.pts as [number, number][]}
                        pathOptions={{
                          color: r.kind === 'alley' ? ALLEY_COLOR : KIND_COLOR[r.kind],
                          weight: r.kind === 'alley' ? 2 : 3,
                          opacity: 0.9,
                        }}
                      >
                        <Tooltip sticky>
                          {r.code} · {r.name ?? 'بلا اسم'} · {r.lengthM.toFixed(0)}م
                        </Tooltip>
                      </Polyline>
                    ))}
                  </MapContainer>
                )}
              </div>
            </section>

            {/* ── المستبعدات ── */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setShowSkips((v) => !v)}
                className="flex w-full items-center gap-2 border-b border-slate-100 p-3 text-start"
              >
                <X size={14} className={preview.skipped.length ? 'text-red-500' : 'text-slate-300'} />
                <span className="text-xs font-black text-slate-800">
                  المستبعدات ({preview.skipped.length})
                </span>
                <span className="ms-auto text-[10px] text-slate-400">
                  {preview.skipped.length ? 'اضغط لعرض السبب' : 'لا شيء استُبعد'}
                </span>
              </button>
              {showSkips && (
                <div className="max-h-72 overflow-auto">
                  {preview.skipped.length === 0 && (
                    <p className="p-3 text-[11px] text-slate-500">كل الأشواط صالحة للإدراج.</p>
                  )}
                  {preview.skipped.map((s) => (
                    <div key={`${s.osmWayId}-${s.reason}`} className="border-b border-slate-50 px-3 py-2 last:border-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-mono text-slate-400">#{s.osmWayId}</span>
                        <span className="text-[11px] font-black text-slate-700">{s.name ?? 'بلا اسم'}</span>
                      </div>
                      <div className="text-[10px] leading-tight text-red-600">{s.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {/* ══ ④ الإدراج ══ */}
      {preview && phase.kind !== 'done' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <span className="grid size-6 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">٤</span>
            الإدراج على دفعات
            <span className="text-[10px] font-bold text-slate-400">
              {Math.ceil(preview.rows.length / 200)} دفعة × ٢٠٠ صف
            </span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !activeZoneId}
              onClick={() => {
                if (activeZoneId) void insert(activeZoneId, preview)
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play size={14} />
              ابدأ الإدراج
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw size={14} />
              ملف آخر
            </button>
            <p className="text-[10px] leading-tight text-slate-500">
              آمن للتكرار: إعادة نفس الملف لا تُضاعف العناصر، والاسم الذي عدّلته يدوياً لا يُطغى.
            </p>
          </div>

          {phase.kind === 'inserting' && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[11px] font-bold text-slate-600">
                <span>
                  {phase.done} / {phase.total} صف
                </span>
                <span className="tabular-nums">
                  أُدرج {phase.result.inserted} · حُدِّث {phase.result.updated}
                  {phase.result.skipped > 0 && ` · استُبعد ${phase.result.skipped}`}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(phase.done / Math.max(1, phase.total)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══ النتيجة ══ */}
      {phase.kind === 'done' && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-emerald-900">
            <MapPin size={16} />
            اكتمل الإدراج
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/70 p-2">
              <div className="text-lg font-black tabular-nums text-emerald-700">{phase.result.inserted}</div>
              <div className="text-[10px] font-bold text-slate-500">جديد</div>
            </div>
            <div className="rounded-xl bg-white/70 p-2">
              <div className="text-lg font-black tabular-nums text-slate-700">{phase.result.updated}</div>
              <div className="text-[10px] font-bold text-slate-500">مُحدَّث</div>
            </div>
            <div className="rounded-xl bg-white/70 p-2">
              <div className={`text-lg font-black tabular-nums ${phase.result.skipped ? 'text-red-600' : 'text-slate-400'}`}>
                {phase.result.skipped}
              </div>
              <div className="text-[10px] font-bold text-slate-500">مستبعد</div>
            </div>
          </div>
          {phase.result.errors.length > 0 && (
            <details className="mt-2 rounded-xl bg-white/70 p-2">
              <summary className="cursor-pointer text-[11px] font-black text-red-700">
                {phase.result.errors.length} سبباً — اضغط للتفصيل
              </summary>
              <ul className="mt-1 space-y-0.5 text-[10px] text-red-700" dir="ltr">
                {phase.result.errors.slice(0, 50).map((e) => (
                  <li key={`${e.code}-${e.error}`} className="font-mono">
                    {e.code}: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-black text-emerald-800 shadow hover:bg-emerald-100"
            >
              <RotateCcw size={14} />
              استيراد ملف آخر
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

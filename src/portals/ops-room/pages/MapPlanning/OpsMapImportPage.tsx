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
import { MAP_MAX_ZOOM, zoneBorderColor } from '@features/map-theme/map-theme'
import { useMapTheme } from '@features/map-theme/useMapTheme'
import { useMapImport } from '@features/map-import/hooks/useMapImport'
import { useMapZones } from '@features/map-planning/hooks/useMapPlanning'
import { DENSITY_REFERENCE, mapImportSdk } from '@sdk/map-import.sdk'
import type { LatLng } from '@features/map-import/lib/geometry'
import { polygonAreaM2 } from '@features/map-import/lib/geometry'
import { leafletPath, strokeFor, type PreviewStyle } from '@features/map-import/lib/osm-colors'
// حدّ العيّنة — يُعرض به «و N فوق الحدّ» في تقرير المسقَط
import { MAX_SKIP_SAMPLES } from '@features/map-import/lib/osm-stream'
import { SPARSE_SEGMENT_M } from '@features/map-import/lib/geometry'

/**
 * أقصى عدد مسارات تُرسم على الخريطة المصغّرة.
 *
 * كان ٥٠ — ورقم «٥» أُخذ من مثال في الخطة لا من حدود الأداء، فكانت المعاينة
 * ترسم **١٦٪** من العناصر (٥٠ من ٣٠٨). المشغّل يرى خريطة مبعثرة فيظنّ أن
 * الاستيراد ناقص، والبيانات كاملة في القاعدة.
 *
 * ٣٠٠٠ سقف حقيقي: Leaflet يرسم SVG لكل مسار، و٤٠٠٠+ مسار تُبطئ التمرير على
 * الهاتف. الزون الأكبر في ساحة العمل (الجادرية) = ٦٥٣، فأي زون واقعي يُرسم
 * كاملاً ولا يُقتطع شيء. والزيادة عن السقف تُعلَن صراحةً في الترويسة.
 */
const MAX_RENDERED_WAYS = 3000

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
  /**
   * نمط عرض المسارات على المعاينة.
   *
   * `'overpass'` افتراضياً (قرار المشغّل): الغرض من المعاينة **التحقق من
   * المطابقة**، فتُعرض بألوان Overpass القياسية كي تُقارن بالخريطة المرجعية نفسها.
   * `'brand'` يبقى متاحاً بزر لمن اعتاد ألوان المنصة.
   *
   * ملاحظة: هذا محور مستقلّ عن `theme` (سِمة البلاطات) — قد تكون الخلفية
   * داكنة والخطوط بألوان OSM أو العكس. لا يتصادمان.
   */
  const [previewStyle, setPreviewStyle] = useState<PreviewStyle>('overpass')
  const { data: zones = [], isLoading: zonesLoading } = useMapZones()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const activeZoneId = zoneId ?? zones[0]?.id ?? null
  const activeZone = zones.find((z) => z.id === activeZoneId)

  const { phase, analyze, insert, reset } = useMapImport()
  const [script, setScript] = useState<string>('')
  const [scriptCopied, setScriptCopied] = useState(false)
  /**
   * الربع المختار لتصدير الأرباع (1..4). `null` = السكربت الكامل.
   *
   * السبب: استعلام الزون كاملاً قد يُقتطع عند `maxsize` فيُعطي ملفاً ناقصاً
   * **بصمت** — وهو أصل «الشكل لا يطابق Overpass» المقيس في المرحلة ①.
   * الربع بحجم رُبع الزون لا يبلغ الحدّ عملياً.
   */
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4 | null>(null)
  const [quarterBusy, setQuarterBusy] = useState(false)
  const [polygon, setPolygon] = useState<LatLng[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showSkips, setShowSkips] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  /**
   * نجلب مضلّع الزون والسكربت عند تغيير الزون — كلاهما من القاعدة لا محلياً.
   *
   * ⚠ العيب الذي يمنعه `confirm()`: كان `reset()` يُنفَّذ بلا سؤال عند كل
   * تغيير زون. فالمشغّل يرفع ملفاً ويحلّله، ثم يضغط زوناً آخر ليرى الفرق ⇒
   * **يُمحى التحليل كله** ويعود للخطوة صفر. والأسوأ: لو نجا التحليل لكان
   * قُصَّ بمضلّع الزون الجديد على ملف بحدود زون قديم — بيانات خاطئة بصمت.
   *
   * السلوك الجديد: تحليل قائم + زون مختلف ⇒ سؤال صريح. الإلغاء يعني عدم
   * تغيير الزون أصلاً (نُعيد الحالة للزر السابق).
   */
  useEffect(() => {
    if (!activeZoneId) return
    let alive = true
    setScript('')
    setPolygon([])
    /*
     * ⚠ `quarter` كان **يبقى مختاراً** بعد تبديل الزون.
     *
     * الأثر: نختار «الربع ٣» لزون أ، ثم ننتقل لزون ب. هذا الـeffect يجلب
     * سكربت الزون **كاملاً** ويضع `script`، لكنه لا يمسّ `quarter` — فتبقى
     * الواجهة تعرض «الربع ٣» مضيئاً وملاحظة «هذا الربع 3 من 4» بينما
     * السكربت المعروض هو الزون ب كاملاً. المشغّل ينسخه ظنّاً أنه ربع،
     * فيستورد أربعة أضعاف الحجم المتوقع — أو يستورد ربعاً واحداً من زون
     * ويظن أن الأرباع الأربعة اكتملت.
     *
     * التصفير هنا لا في معالج النقر: الـeffect هو المسؤول عن «زون جديد ⇒
     * حالة جديدة»، وأي مسار تبديل زون مستقبلي يحصل على التصفير مجاناً.
     */
    setQuarter(null)
    setQuarterBusy(false)
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
    // reset ليست تبعية: تُستدعى من معالج النقر لا هنا. إدراجها كان يُعيد الجلب
    // من القاعدة عند كل إعادة تصيير تُغيّر هويّة reset.
  }, [activeZoneId])

  /**
   * يُبدّل السكربت بين «الزون كاملاً» وأرباعه.
   *
   * لا نُعيد الجلب عند العودة للكامل: السكربت موجود في الحالة من effect الزون.
   * نجلب فقط عند اختيار ربع (أربعة نصوص مختلفة تُولَّد في القاعدة).
   */
  const pickQuarter = async (q: 1 | 2 | 3 | 4 | null) => {
    if (q === quarter || quarterBusy) return
    if (q === null) {
      setQuarter(null)
      if (activeZoneId) {
        try {
          const s = await mapImportSdk.zoneScript(activeZoneId)
          setScript(s.script)
          setScriptCopied(false)
        } catch {
          setScript('')
        }
      }
      return
    }
    if (!activeZoneId) return
    setQuarterBusy(true)
    try {
      const s = await mapImportSdk.zoneScriptQuarter(activeZoneId, q)
      setScript(s.script)
      setQuarter(q)
      setScriptCopied(false)
    } catch {
      // فشل جلب الربع (مهاجرة غير مطبَّقة؟) — نبقى على السكربت الحالي
      setQuarter(null)
    } finally {
      setQuarterBusy(false)
    }
  }

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setScriptCopied(true)
      window.setTimeout(() => setScriptCopied(false), 2000)
    } catch {
      setScriptCopied(false)
    }
  }

  /**
   * إظهار روابط الطرق (`primary_link`…) على المعاينة.
   *
   * لماذا خيار لا افتراضي: الروابط **تُعرض ولا تُستورد** — تُرسم للمقارنة
   * البصرية مع Overpass، لكن الإدراج يستثنيها (تُفلتر في `sendBatch`).
   * جعلها افتراضية كان سيوهم المشغّل بأنها ستُستورد.
   */
  const [showLinks, setShowLinks] = useState(false)
  /**
   * آخر ملف حُلِّل. نحتاجه لإعادة التحليل عند تبديل خيار «وصلات الطرق»:
   * الخيار يؤثر في **القراءة والتصنيف** لا في الرسم وحده، فلا بدّ من إعادة
   * المرور على الملف. الاحتفاظ بالكائن في الذاكرة لا يعني قراءته — الملف
   * يُقرأ من القرص عند الطلب فقط، ولا يُرفع لأي خادم.
   */
  const lastFileRef = useRef<File | null>(null)

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return
    lastFileRef.current = file
    await analyze(file, polygon, { includeLinks: showLinks })
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    await handleFile(file)
  }

  const preview = phase.kind === 'preview' ? phase.preview : phase.kind === 'done' ? phase.preview : null

  /** عدد الصفوف التي لا نعرف وسمها الأصلي (للإعلان لا للإخفاء) */
  const osmMatched = useMemo(() => {
    if (!preview) return { matched: 0, total: 0 }
    const total = preview.rows.length
    const matched = preview.rows.filter((r) => r.osmHighway).length
    return { matched, total }
  }, [preview])

  const areaKm2 = useMemo(
    () => (polygon.length >= 3 ? polygonAreaM2(polygon) / 1e6 : 0),
    [polygon],
  )

  /**
   * المسارات المعروضة: **كل شيء** حتى السقف، وتوزيع منتظم فوقه.
   *
   * القصّ عند السقف بتوزيع منتظم (لا أوّل N) لأن أول الصفوف مرتّبة بـ(y,x):
   * أخذ أوّلها يعرض شريطاً واحداً من الزون ويُخفي بقيتها.
   */
  const sample = useMemo(() => {
    if (!preview) return []
    const rows = preview.rows.filter((r) => r.pts.length >= 2)
    if (rows.length <= MAX_RENDERED_WAYS) return rows
    const step = rows.length / MAX_RENDERED_WAYS
    return Array.from({ length: MAX_RENDERED_WAYS }, (_, i) => rows[Math.floor(i * step)]).filter(
      (r): r is (typeof rows)[number] => !!r,
    )
  }, [preview])

  /** هل قُصَّ شيء؟ (يُعلَن، لا يُخفى) */
  const truncatedForMap = preview ? preview.rows.length - sample.length : 0

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
      <section className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-xs font-black text-slate-500">الزون:</span>
        {zonesLoading && <span className="text-xs text-slate-400">جارٍ التحميل…</span>}
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => {
              if (z.id === activeZoneId) return
              // تحليل جاهز؟ التغيير يمسحه — نسأل أولاً بدل الإتلاف الصامت
              if (phase.kind !== 'idle') {
                const ok = window.confirm(
                  'تغيير الزون سيُلغي تحليل الملف الحالي ويبدأ من جديد.\n' +
                    'الملف المقروء يخصّ حدود الزون السابق — المتابعة عليه تعطي نتائج خاطئة.\n\n' +
                    'هل تريد المتابعة؟',
                )
                if (!ok) return
              }
              reset()
              setZoneId(z.id)
            }}
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

      {/* min-w-0 على الأبناء: عنصر grid لا ينكمش تحت أصغر محتوى له افتراضياً
          (min-width: auto). سكربت Overpass سطر واحد طويل جداً — بدونه يفرض
          عرضه على العمود فيفيض على شاشة الهاتف ويخرج النص من الحدود. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {/* ══ ① السكربت ══ */}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-slate-800">
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">١</span>
            <span className="min-w-0">سكربت الزون</span>
            <span className="shrink-0 text-[10px] font-bold text-slate-400">من مضلّعك الحقيقي</span>
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            انسخه والصقه في <span dir="ltr">overpass-turbo.eu</span> ← Run ← Export ← raw OSM data.
            الملف الناتج هو ما ستُسقطه في الخطوة ٢.
          </p>
          <div className="relative mt-2 min-w-0">
            {/* whitespace-pre-wrap: <pre> الافتراضي white-space:pre فلا يلتفّ أبداً،
                وسكربت Overpass سطر واحد ⇒ يتمدّد أفقياً ويعبر الحدود.
                break-anywhere: التنسيق (مسافات/أسطر) يبقى، والمعرّفات الطويلة تُقصّ.
                pt-8: مساحة لزر النسخ فلا يغطّي أول سطر على الشاشات الضيقة. */}
            <pre
              dir="ltr"
              className="max-h-52 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-anywhere rounded-xl bg-slate-900 p-3 pt-9 text-[10px] leading-relaxed text-emerald-200"
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

          {/* ── تصدير الأرباع: الحلّ الجذري لاقتطاع Overpass ──
              الزون الكامل قد يبلغ maxsize فيُقتطع الملف **بصمت** (XML صالح،
              بيانات ناقصة) ⇒ شكل زاوي لا يطابق Overpass. الربع لا يبلغ الحدّ. */}
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
            <p className="text-[11px] font-bold leading-relaxed text-amber-900">
              هل خرج الملف أقل من المتوقّع؟ صدّر <span className="underline">أربعة أرباع</span> بدل
              الكل — كل ربع صغير فلا يُقتطع.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {([1, 2, 3, 4] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={quarterBusy || !activeZoneId}
                  onClick={() => void pickQuarter(q)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-black transition disabled:opacity-50 ${
                    quarter === q
                      ? 'bg-amber-600 text-white shadow'
                      : 'bg-white text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100'
                  }`}
                >
                  ربع {q}
                </button>
              ))}
              <button
                type="button"
                disabled={quarterBusy || !activeZoneId}
                onClick={() => void pickQuarter(null)}
                className={`rounded-lg px-2 py-1 text-[11px] font-black transition disabled:opacity-50 ${
                  quarter === null
                    ? 'bg-slate-700 text-white shadow'
                    : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100'
                }`}
              >
                الزون كاملاً
              </button>
              {quarterBusy && <span className="text-[10px] text-amber-700">…يُولَّد</span>}
            </div>
            {quarter !== null && (
              /*
               * نصّ هذه الملاحظة كان مضلّلاً: «الإدراج يدمج تلقائياً ولا يتكرّر».
               * الشقّ الثاني صحيح والأول كاذب — كان **يستبدل**: أكواد الملف
               * تبدأ من 0001 في كل ربع، فربعٌ يطغى على ربع. أُصلح في الهجرة
               * 20261124000100 (المطابقة بـosm_way_id)، لكن الملاحظة كانت
               * تُشجّع على الخطأ قبل الإصلاح — فتُصحَّح لتصف السلوك الفعلي.
               */
              <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
                هذا الربع <b>{quarter}</b> من 4. استورد الأربعة <b>في أي ترتيب</b> داخل نفس
                الزون — كل شوط يُطابق بمعرّف OSM فلا يستبدل ربعٌ ربعاً، وإعادة الاستيراد لا
                تُضاعف.
              </p>
            )}
          </div>
        </section>

        {/* ══ ② إسقاط الملف ══ */}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* flex-wrap: الشارتان (العنوان + «لا يُرسَل للخادم») لا تتّسعان معاً
              على شاشة ٣٦٠px فتتجاوزان الحاوية. على الهاتف تنزل الشارة سطراً. */}
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-slate-800">
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">٢</span>
            <span className="min-w-0">إسقاط ملف .osm</span>
            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
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
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInput.current?.click()
              }
            }}
            className={`mt-2 grid min-h-36 w-full cursor-pointer place-items-center rounded-xl border-2 border-dashed px-3 py-6 text-center transition ${
              dragOver ? 'border-[#0b3d6b] bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            } ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <div className="min-w-0 max-w-full">
              <FileUp className="mx-auto text-slate-400" size={28} />
              <div className="mt-1 text-xs font-black text-slate-700">
                أفلت الملف هنا أو اضغط للاختيار
              </div>
              <div className="mt-0.5 text-balance text-[10px] leading-relaxed text-slate-400">
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
            <div className="mt-0.5 break-anywhere text-[11px] font-normal opacity-80">{phase.message}</div>
          </div>
        </div>
      )}

      {/* ══ ③ المعاينة ══ */}
      {preview && (
        <>
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* flex-wrap + min-w-0/truncate: اسم الملف قد يكون طويلاً
                فيدفع الشارة خارج الحاوية على شاشة الهاتف. */}
            <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-slate-800">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">٣</span>
              <span className="min-w-0">المعاينة قبل الإدراج</span>
              {phase.kind === 'preview' && (
                <span className="min-w-0 max-w-full truncate text-[10px] font-bold text-slate-400 sm:ms-auto">
                  {phase.fileName} · قُرئ في {(phase.ms / 1000).toFixed(1)} ثانية
                </span>
              )}
            </h2>

            <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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

            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
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
                {/*
                  ── تحذير الشكل التقريبي ──
                  لا يُخفي الإدراج ولا يمنعه: البيانات **صالحة**، لكن الشكل
                  المرسوم ليس الشارع الحقيقي. المشغّل يحتاج أن يعرف قبل أن
                  يُدرج، لا أن يكتشف لاحقاً أن الخريطة زاويّة.

                  الرقم بالطول لا بعدد الصفوف: ٤٣٪ من طول الشبكة في زون rth
                  الحقيقي مرسوم بمقاطع أطول من ١٥٠ متراً، مع أن عدد الصفوف
                  المتأثرة ٢٠٪ فقط. الطول هو ما يحدّد كيف تبدو الخريطة.
                */}
                {preview.stats.sparse.pct > 0 && (
                  <div className="mt-1 font-bold text-amber-700">
                    ⚠ الشكل تقريبي: {preview.stats.sparse.pct.toFixed(0)}٪ من الطول (
                    {preview.stats.sparse.km.toFixed(1)} كم في {preview.stats.sparse.rows} مساراً)
                    مرسوم بمقاطع مستقيمة أطول من ١٥٠م — أطولها{' '}
                    {preview.stats.sparse.worstM.toFixed(0)}م. الشوارع المنحنية ستبدو زاويّة.
                    <span className="font-normal text-slate-500">
                      {' '}
                      الحلّ: أعد التصدير بلا اقتطاع، أو قسّم الزون إلى أرباع.
                    </span>
                  </div>
                )}
                {preview.stats.unnamedAlleys === 0 &&
                  preview.stats.clipFallbacks === 0 &&
                  !preview.stats.densityWarn &&
                  preview.stats.sparse.pct === 0 && (
                    <div className="font-bold text-emerald-700">✔ لا تحذيرات — الأرقام متسقة مع المرجع</div>
                  )}
                {/*
                  ── المسقَط عند القراءة ──
                  هذا **ليس** قسم «المستبعدات» أدناه. ذاك يعرض ما أسقطه القصّ
                  والتصنيف **بعد** قراءة الشوط. أما هنا فما لم يُقرأ أصلاً:
                  وسم `highway` خارج قائمة المرور (انظر ROUTE_HIGHWAY_TAGS).

                  كان `waysSkippedNoHighway` عدّاداً لا يُعرض في الواجهة إطلاقاً
                  ⇒ مشغّل يرى «٢٩٧ صفاً» ولا يعلم أن ٣٥ شوطاً في ملفه لم تُقرأ،
                  ولا ما هي. اختفاء صامت يبدو نجاحاً — وهو أسوأ من تحذير.
                */}
                {phase.kind === 'preview' && phase.parse.waysSkippedNoHighway > 0 && (
                  <details className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <summary className="cursor-pointer font-bold text-slate-700">
                      أُسقط عند القراءة: {phase.parse.waysSkippedNoHighway} شوط — لم يُقرأ أصلاً
                    </summary>
                    <div className="mt-1.5 space-y-1 text-[10px] leading-relaxed">
                      <p className="text-slate-600">
                        وسم <code dir="ltr">highway</code> خارج قائمة المرور. هذه أشواط
                        موجودة في ملف Overpass ولا تدخل المعاينة ولا القاعدة.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {phase.parse.skippedByTag.map((t) => (
                          <span
                            key={t.highway ?? 'none'}
                            className="rounded-md bg-white px-1.5 py-0.5 font-bold text-slate-700 ring-1 ring-slate-200"
                          >
                            <span dir="ltr">{t.highway ?? '(بلا highway)'}</span> · {t.ways}
                          </span>
                        ))}
                      </div>
                      {phase.parse.skippedSamples.length > 0 && (
                        <div className="mt-1">
                          <div className="font-bold text-slate-600">عيّنة:</div>
                          <ul className="mt-0.5 space-y-0.5">
                            {phase.parse.skippedSamples.slice(0, 10).map((s) => (
                              <li key={s.osmWayId} className="text-slate-600">
                                <span dir="ltr" className="text-slate-400">#{s.osmWayId}</span>{' '}
                                <span dir="ltr" className="font-bold">{s.highway ?? '—'}</span>
                                {s.name ? <> — «{s.name}»</> : null}
                              </li>
                            ))}
                          </ul>
                          {phase.parse.skippedSamples.length > 10 && (
                            <div className="mt-0.5 text-slate-500">
                              … و{phase.parse.skippedSamples.length - 10} أخرى في العيّنة
                              {phase.parse.skippedSamplesOverflow > 0 &&
                                ` (و${phase.parse.skippedSamplesOverflow} فوق حدّ ${MAX_SKIP_SAMPLES})`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                )}
                <div className="mt-1 text-[10px] text-slate-500">
                  {preview.mahallas.__UNASSIGNED__ ? 'المحلات المربوطة بحدود OSM مفتوحة — الربط بالاسم فقط' : ''}
                </div>
              </div>
            </div>
          </section>

          {/* ── الخريطة المصغّرة + العيّنة ── */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-slate-100 p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                  <Layers size={14} className="text-slate-400" />
                  {truncatedForMap > 0
                    ? `عرض ${sample.length} من ${preview.rows.length} — البقية تُدرَج كاملة`
                    : `${sample.length} مساراً — كل عناصر الملف`}
                </h3>
                {/* ── محوّل النمط: Overpass ↔ المنصة ──
                    مستقلّ عن سِمة البلاطات: الأول ألوان الخطوط، الثاني الخلفية. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* روابط الطرق: عرض فقط — الإدراج يستثنيها */}
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={showLinks}
                      onChange={(e) => {
                        setShowLinks(e.target.checked)
                        // نُعيد التحليل كي تُقرأ/تُحذف روابط الطرق فعلاً —
                        // الخيار يؤثر في القراءة لا في الرسم وحده.
                        const f = lastFileRef.current
                        if (f) void analyze(f, polygon, { includeLinks: e.target.checked })
                      }}
                      className="size-3 accent-slate-700"
                    />
                    وصلات الطرق
                  </label>
                  <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
                    <button
                      type="button"
                      onClick={() => setPreviewStyle('overpass')}
                      aria-pressed={previewStyle === 'overpass'}
                      className={`px-2 py-1 text-[10px] font-black transition ${
                        previewStyle === 'overpass'
                          ? 'bg-slate-800 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ألوان Overpass
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewStyle('brand')}
                      aria-pressed={previewStyle === 'brand'}
                      className={`px-2 py-1 text-[10px] font-black transition ${
                        previewStyle === 'brand'
                          ? 'bg-slate-800 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ألوان المنصة
                    </button>
                  </div>
                </div>
              </div>
              {/*
                ── النص كان مضلّلاً في الوضع الليلي ──
                «نفس ما تراه في overpass-turbo» صحيحة **بالنهاري فقط**: هناك
                بلاط OSM فاتح وألوان osm-carto تنطبق عليه بالحرف. أما بالليلي
                فالبلاط Esri داكن و`strokeFor` يقلب الإضاءة (أبيض ⇒ رمادي
                فاتح، وردي ⇒ وردي مشبع) — فالمقارنة البصرية مع overpass-turbo
                **غير صالحة**. نقولها صراحةً بدل ترك المشغّل يقارن ويشكّ.

                وكذلك «الحدّ الأزرق»: صار سماوياً بالليلي ليكون مرئياً
                (`zoneBorderColor`)، فوصفه بالأزرق كان سيصير كذباً.
              */}
              <p className="border-b border-slate-100 px-3 py-1.5 text-[10px] leading-relaxed text-slate-500">
                الحدّ {theme === 'dark' ? 'السماوي' : 'الأزرق'} المتقطّع ·{' '}
                {previewStyle === 'overpass'
                  ? theme === 'light'
                    ? 'ألوان OSM القياسية — نفس ما تراه في overpass-turbo.eu'
                    : 'ألوان OSM معكوسة الإضاءة لتبقى مرئية — للمقارنة، لكن لا تطابق overpass-turbo (قارِن بالوضع النهاري)'
                  : 'ألوان المنصة (الشوارع حمراء/برتقالية والأزقة بنفسجية)'}
                {osmMatched.total > 0 && osmMatched.matched < osmMatched.total && (
                  <>
                    {' · '}
                    <span className="text-amber-700">
                      {osmMatched.total - osmMatched.matched} صفاً بلا وسم أصلي (يُرسم بتصنيفنا)
                    </span>
                  </>
                )}
              </p>
              <div className="h-80">
                {mapPoints.length > 0 && (
                  <MapContainer
                    bounds={mapPoints as [number, number][]}
                    boundsOptions={{ padding: [16, 16] }}
                    className="h-full w-full"
                    /* Leaflet الافتراضي ١٨ — فلا يبلغ النهاري ١٩ أصلاً، بينما
                     * LIGHT_TILES.maxZoom يقول ١٩. رقم صريح واحد يمنع الانحراف. */
                    maxZoom={MAP_MAX_ZOOM}
                    scrollWheelZoom
                  >
                    <MapTiles theme={theme} />
                    {polygon.length >= 3 && (
                      <Polygon
                        positions={polygon as [number, number][]}
                        pathOptions={{ color: zoneBorderColor(theme), weight: 2, fill: false, dashArray: '4 3' }}
                      />
                    )}
                    {/*
                      ── طبقتان لكل مسار: إطار ثم خط ──
                      في osm-carto الشارع المحلي أبيض على خلفية فاتحة، ويُرسم
                      تحته إطار رمادي رفيع (casing) وإلا اختفى. بلاه تظهر
                      الخريطة شبه فارغة — وهو ما ظهر فعلاً في أول رسم.

                      الإطار يسبق الخط في DOM كي يُرسم تحته. مفتاحه مسبوق
                      بـ`casing-` لتفادي تكرار المفتاح.
                    */}
                    {sample.flatMap((r) => {
                      const st = strokeFor(previewStyle, r, theme)
                      const core = (
                        <Polyline
                          key={`${r.code}-${r.osmWayId}`}
                          positions={r.pts as [number, number][]}
                          pathOptions={leafletPath(st)}
                        >
                          <Tooltip sticky>
                            {r.code} · {r.name ?? 'بلا اسم'} · {r.lengthM.toFixed(0)}م
                            {r.osmHighway ? ` · ${r.osmHighway}` : ''}
                            {/*
                              التباعد في التلميح لا في اللون: تلوين المسارات
                              الزاويّة كان سيُفسد مطابقة ألوان Overpass التي
                              هي غرض المعاينة (المرحلة ②). المشغّل يرى الشكل
                              الزاوي بعينه، ويقرأ الرقم هنا عند الحاجة.
                            */}
                            {(r.maxSegmentM ?? 0) > SPARSE_SEGMENT_M && (
                              <>
                                {' · '}
                                <span className="font-bold text-amber-600">
                                  ⚠ أطول مقطع {r.maxSegmentM!.toFixed(0)}م
                                </span>
                              </>
                            )}
                          </Tooltip>
                        </Polyline>
                      )
                      if (!st.casing) return [core]
                      return [
                        <Polyline
                          key={`casing-${r.code}-${r.osmWayId}`}
                          positions={r.pts as [number, number][]}
                          pathOptions={{
                            color: st.casing.color,
                            weight: st.casing.weight,
                            opacity: st.opacity,
                            interactive: false,
                          }}
                        />,
                        core,
                      ]
                    })}
                  </MapContainer>
                )}
              </div>
            </section>

            {/* ── المستبعدات ── */}
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setShowSkips((v) => !v)}
                className="flex w-full items-center gap-2 border-b border-slate-100 p-3 text-start"
              >
                <X size={14} className={preview.skipped.length ? 'text-red-500' : 'text-slate-300'} />
                <span className="text-xs font-black text-slate-800">
                  المستبعدات ({preview.skipped.length})
                </span>
                <span className="ms-auto shrink-0 text-[10px] text-slate-400">
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
                      <div className="break-anywhere text-[10px] leading-tight text-red-600">{s.reason}</div>
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
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-slate-800">
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#0b3d6b] text-[11px] text-white">٤</span>
            <span className="min-w-0">الإدراج على دفعات</span>
            <span className="shrink-0 text-[10px] font-bold text-slate-400">
              {Math.ceil(preview.rows.length / 200)} دفعة × ٢٠٠ صف
            </span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !activeZoneId}
              onClick={() => {
                if (!activeZoneId) return
                /*
                 * تأكيد عند الشكل التقريبي فقط — لا سؤال عند البيانات النظيفة.
                 * التحذير في بطاقة الإحصاء قد يُمرَّر عليه، أما هذا فيتوقّف
                 * أمامه المشغّل. ولا يمنع الإدراج: البيانات صالحة، والشكل
                 * مسألة جودة لا مسألة صحّة.
                 */
                const sp = preview.stats.sparse
                if (sp.pct > 0) {
                  const ok = window.confirm(
                    `الشكل تقريبي: ${sp.pct.toFixed(0)}٪ من طول الشبكة (${sp.km.toFixed(1)} كم) ` +
                      `مرسوم بمقاطع مستقيمة أطول من ١٥٠ متراً، أطولها ${sp.worstM.toFixed(0)}م.\n\n` +
                      'الشوارع المنحنية ستبدو زاويّة على الخريطة.\n' +
                      'الحلّ: أعد تصدير الملف بلا اقتطاع، أو قسّم الزون إلى أرباع.\n\n' +
                      'البيانات نفسها صالحة — المتابعة تُدرج الشوارع بشكلها التقريبي.\n\n' +
                      'هل تريد المتابعة؟',
                  )
                  if (!ok) return
                }
                /* اسم الملف يُمرَّر ليُحفظ في map_import_batches.file_name — كان يضيع */
                void insert(activeZoneId, preview, {
                  fileName: phase.kind === 'preview' ? phase.fileName : undefined,
                })
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
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[11px] font-bold text-slate-600">
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
        <section className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-emerald-900">
            <MapPin size={16} />
            اكتمل الإدراج
          </h2>
          <div className="mt-2 grid min-w-0 grid-cols-3 gap-2 text-center">
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
                  <li key={`${e.code}-${e.error}`} className="break-anywhere font-mono">
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

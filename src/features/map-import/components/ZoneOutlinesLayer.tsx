/**
 * طبقة «عرض جميع الزونات» — حدود الأزونات الثمانية على خريطة المحرّر.
 *
 * ## المشكلة التي تحلّها
 * المحرّر كان يعرض **زوناً واحداً** في المرّة: تختار زوناً فتُحمَّل شوارعه
 * وأزقته، ولا ترى أين ينتهي هو ويبدأ جاره. فتصحيح مسار على الحدّ كان يجري
 * بلا مرجع بصري — وقد رُفضت مسارات لأنها خرجت من الزون (قاعدة
 * `app.map_guard_path_in_zone`) بلا أن يرى المستخدم أين الحدّ أصلاً.
 *
 * ## القرارات التصميمية (مقصودة، لا سهو)
 * ① **الحدود فقط** — لا شوارع ولا أزقة لأزونات أخرى. رسم ٢٧ ألف عنصر دفعة
 *    واحدة يجمّد الخريطة، وهو عكس الغرض: نحتاج مرجعاً خفيفاً لا خريطة ثانية.
 * ② **نقر الزون يختاره** — الحدّ نفسه صار مدخلاً، فاختيار الزون من الخريطة
 *    بدل شريط الأزرار أعلى الصفحة.
 * ③ **الاختيار يبقى عند الإطفاء/التشغيل** — لا يُصفَّر `zoneId`، وإلا فقد
 *    المستخدم موضعه عند مجرّد إلقاء نظرة على الجوار.
 * ④ **الزون النشط يُبرَز** ولا يُخفى بين الثمانية: سماكة أعلى وتعبئة خفيفة.
 *
 * ## ما لا تفعله
 * لا تحمّل أي بيانات بنفسها — تستقبل المضلّعات جاهزة. التحميل مسؤولية
 * الصفحة حتى يبقى هذا المكوّن قابلاً للاختبار بلا شبكة (انظر ملف الاختبار).
 */
import { Polygon, Tooltip } from 'react-leaflet'
import type { LatLng } from '../lib/geometry'
import { zoneColorAt } from '../lib/zone-polygon'
import type { MapZone } from '@sdk/map-planning.sdk'

export type ZoneOutline = {
  zone: MapZone
  /** ترتيب الزون في القائمة — يحدّد لونه (انظر `zoneColorAt`) */
  index: number
  /** مضلّع الزون، أو فارغ إن لم يُخطَّط بعد */
  points: LatLng[]
}

type Props = {
  outlines: readonly ZoneOutline[]
  /** الزون المعروض حالياً — يُبرَز ولا يُعطَّل النقر عليه */
  activeZoneId: string | null
  onPick: (zoneId: string) => void
  /** وضع الخريطة — يرفع تباين التسمية على البلاط المعتم */
  theme: 'light' | 'dark'
}

/** حدود الزونات كطبقة واحدة — بلا عناصر داخلية */
export function ZoneOutlinesLayer({ outlines, activeZoneId, onPick, theme }: Props) {
  return (
    <>
      {outlines.map(({ zone, index, points }) => {
        if (points.length < 3) return null
        const isActive = zone.id === activeZoneId
        const color = zoneColorAt(index)
        return (
          <Polygon
            key={zone.id}
            positions={points as [number, number][]}
            // النقر على الحدّ يختار الزون: الطبقة نفسها مدخل، لا مجرّد رسم
            eventHandlers={{ click: () => onPick(zone.id) }}
            pathOptions={{
              color,
              weight: isActive ? 4 : 2,
              opacity: isActive ? 0.95 : 0.7,
              // تعبئة خفيفة للزون النشط فقط — الباقي حدود بلا حجب للخريطة
              fillColor: color,
              fillOpacity: isActive ? 0.08 : 0.02,
              // الزون النشط خطّ متصل، والبقية متقطّعة: يُقرأ الفرق بلا لون
              dashArray: isActive ? undefined : '6 5',
              interactive: true,
            }}
          >
            <Tooltip sticky>
              <span style={{ fontWeight: 800 }}>{zone.name}</span>
              {!isActive && (
                <span style={{ opacity: 0.75 }}> — اضغط للتحويل إليه</span>
              )}
            </Tooltip>
          </Polygon>
        )
      })}
      {/* التسمية الدائمة لكل زون: تُعين على القراءة بلا مرور الفأرة */}
      {outlines.map(({ zone, index, points }) => {
        if (points.length < 3) return null
        const center = centroid(points)
        const isActive = zone.id === activeZoneId
        return (
          <Polygon
            key={`lbl-${zone.id}`}
            positions={[[center[0], center[1]]] as [number, number][]}
            pathOptions={{ opacity: 0, fillOpacity: 0 }}
            interactive={false}
          >
            <Tooltip permanent direction="center" className="zone-outline-label">
              <span
                style={{
                  color: zoneColorAt(index),
                  fontWeight: 900,
                  fontSize: isActive ? 13 : 11,
                  textShadow: theme === 'dark' ? '0 1px 3px #000' : '0 1px 3px #fff',
                  whiteSpace: 'nowrap',
                }}
              >
                {zone.name}
              </span>
            </Tooltip>
          </Polygon>
        )
      })}
    </>
  )
}

/**
 * مركز تقريبي للمضلّع = متوسّط القمم.
 *
 * لا نستخدم مركز الثقل الحقيقي للمضلّع: الزونات مخطَّطة يدوياً على الخريطة
 * وقد تكون مقعّرة، فمتوسّط القمم يقع دائماً داخل حدود مقبولة بصرياً، وهو
 * حساب لا يحتاج مكتبة هندسية إضافية.
 */
export function centroid(points: readonly LatLng[]): LatLng {
  if (!points.length) return [0, 0]
  let lat = 0
  let lng = 0
  for (const p of points) {
    lat += p[0]
    lng += p[1]
  }
  return [lat / points.length, lng / points.length]
}

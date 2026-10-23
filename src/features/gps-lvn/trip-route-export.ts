/**
 * 00345 — تصدير مسار الانطلاقية: Excel (ملخص + مراحل + توقفات + انقطاعات + نقاط)، KML، GPX،
 * PDF بصورة الخريطة وترويسة (تُلتقط ورقة التقرير كما يرسمها المتصفح ⇒ عربية صحيحة)، وطباعة.
 */
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import { downloadBlob } from '@features/media/lib/design-export'
import type { TripRouteDetail, TripRouteTripInfo } from '@sdk/gps-lvn.sdk'

const tz = 'Asia/Baghdad'
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: tz }).format(new Date(iso)) : '—')
export const fmtTime = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeStyle: 'short', timeZone: tz }).format(new Date(iso)) : '—')
export const fmtDur = (s: number | null | undefined) => { if (s == null) return '—'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} س ${m} د` : `${m} د` }
const DEST_AR: Record<string, string> = { work_site: 'موقع العمل', transfer_station: 'المحطة التحويلية', maintenance: 'الصيانة', garage: 'الكراج' }
const SHIFT_AR: Record<string, string> = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' }
const STATE_AR: Record<string, string> = { moving: 'متحركة', stopped: 'ساكنة', gap: 'بعد انقطاع' }
const STATUS_AR: Record<string, string> = { pending: 'بانتظار السحب', no_device: 'بلا جهاز', partial: 'جارٍ', complete: 'مكتمل', empty: 'بلا نقاط', failed: 'فشل السحب' }
const dayStamp = (iso: string | null | undefined) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(iso ? new Date(iso) : new Date())
export const tripFileBase = (d: TripRouteDetail) => `مسار-انطلاقية-${d.trip?.db_number ? `DB${d.trip.db_number}-` : ''}${dayStamp(d.trip?.departed_at ?? d.first_fix)}`
const legName = (d: TripRouteDetail, legId: string | null) => {
  if (!legId) return '0 · الكراج ← موقع العمل'
  const l = (d.legs ?? []).find((x) => x.leg_id === legId)
  return l ? `${l.sequence_no} · ${DEST_AR[l.origin_type] ?? l.origin_type} ← ${DEST_AR[l.destination_type] ?? l.destination_type}` : '—'
}
export const tripTitle = (t: TripRouteTripInfo | null | undefined) => t ? `${t.db_number ? `DB ${t.db_number} — ` : ''}${t.vehicle_name} · ${t.driver_name}` : 'انطلاقية'

/** صفوف الملخص (تُستخدم في Excel والتقرير المطبوع) */
export function summaryRows(d: TripRouteDetail): { metric: string; value: string }[] {
  const t = d.trip
  return [
    { metric: 'المركبة', value: t ? `${t.vehicle_name}${t.db_number ? ` (DB ${t.db_number})` : ''}${t.plate_number ? ` · ${t.plate_number}` : ''}` : '—' },
    { metric: 'السائق', value: t?.driver_name ?? '—' },
    { metric: 'القاطع / الشفت', value: `${t?.sector_name ?? '—'} / ${SHIFT_AR[t?.shift ?? ''] ?? t?.shift ?? '—'}` },
    { metric: 'جهاز GPS', value: t?.device_name ? `${t.device_name} (${t.device_external_id ?? ''})` : '—' },
    { metric: 'المغادرة من الكراج', value: fmtDateTime(t?.departed_at) },
    { metric: 'الوصول لموقع العمل', value: fmtDateTime(t?.site_arrived_at) },
    { metric: 'العودة للكراج', value: t?.returned_at ? fmtDateTime(t.returned_at) : 'لم تعد بعد' },
    { metric: 'حالة المسار', value: `${STATUS_AR[d.status] ?? d.status}${d.is_final ? ' (نهائي)' : ''}` },
    { metric: 'أول/آخر إشارة', value: `${fmtDateTime(d.first_fix)} ← ${fmtDateTime(d.last_fix)}` },
    { metric: 'المسافة المقطوعة (كم)', value: (d.distance_m / 1000).toFixed(2) },
    { metric: 'زمن الحركة', value: fmtDur(d.moving_seconds) },
    { metric: 'زمن التوقف', value: fmtDur(d.stopped_seconds) },
    { metric: 'عدد التوقفات', value: String(d.stops_count) },
    { metric: 'انقطاعات الإشارة', value: `${d.gaps_count} (${fmtDur(d.gap_seconds)})` },
    { metric: 'السرعة القصوى / المتوسطة (كم/س)', value: `${Math.round(d.max_speed_kmh)} / ${Math.round(d.avg_speed_kmh)}` },
    { metric: 'النقاط (محفوظة / مرفوضة بالتنظيف)', value: `${d.points_kept} / ${d.points_rejected}` },
    { metric: 'آخر سحب من LVN', value: `${fmtDateTime(d.pulled_at)} · ${d.pull_count} سحبة` },
  ]
}

export async function exportTripRouteExcel(d: TripRouteDetail) {
  const t = d.trip
  const meta = `${tripTitle(t)} · المغادرة ${fmtDateTime(t?.departed_at ?? d.first_fix)} · ${t?.returned_at ? `العودة ${fmtDateTime(t.returned_at)}` : 'مفتوحة'} · أُنتج ${fmtDateTime(new Date().toISOString())}`
  const num = (w = 12): Partial<ReportColumn> => ({ width: w, align: 'center' })
  await buildExcelReport({
    sheetName: 'الملخص', title: 'تقرير مسار انطلاقية', meta, fileName: `${tripFileBase(d)}.xlsx`, orientation: 'portrait',
    columns: [{ key: 'metric', header: 'البند', width: 34 }, { key: 'value', header: 'القيمة', width: 50 }],
    rows: summaryRows(d),
    extraSheets: [
      { sheetName: 'المراحل', title: 'مراحل الانطلاقية', meta, orientation: 'landscape',
        columns: [{ key: 'n', header: '#', ...num(5) }, { key: 'name', header: 'المرحلة', width: 30 }, { key: 'dep', header: 'الانطلاق', width: 18 }, { key: 'arr', header: 'تأكيد الوصول', width: 18 }, { key: 'km', header: 'المسافة (كم)', ...num() }, { key: 'mov', header: 'زمن الحركة', ...num(14) }, { key: 'stp', header: 'زمن التوقف', ...num(14) }, { key: 'stops', header: 'توقفات', ...num(9) }, { key: 'gaps', header: 'انقطاعات', ...num(9) }, { key: 'vmax', header: 'أقصى سرعة', ...num() }, { key: 'vavg', header: 'متوسط السرعة', ...num() }, { key: 'pts', header: 'نقاط', ...num(8) }],
        rows: [
          { n: 0, name: 'الكراج ← موقع العمل', dep: fmtTime(t?.departed_at ?? d.first_fix), arr: fmtTime(t?.site_arrived_at), km: '', mov: '', stp: '', stops: (d.stops ?? []).filter((s) => !s.leg_id).length, gaps: (d.gaps ?? []).filter((g) => !g.leg_id).length, vmax: '', vavg: '', pts: d.points.filter((p) => !p.leg_id).length },
          ...(d.legs ?? []).map((l) => ({ n: l.sequence_no, name: `${DEST_AR[l.origin_type] ?? l.origin_type} ← ${DEST_AR[l.destination_type] ?? l.destination_type}`, dep: fmtTime(l.departed_at), arr: l.arrived_at ? fmtTime(l.arrived_at) : 'لم يؤكَّد', km: Number((l.distance_m / 1000).toFixed(2)), mov: fmtDur(l.moving_seconds), stp: fmtDur(l.stopped_seconds), stops: l.stops_count, gaps: l.gaps_count, vmax: l.max_speed_kmh ? Math.round(l.max_speed_kmh) : '', vavg: l.avg_speed_kmh ? Math.round(l.avg_speed_kmh) : '', pts: l.points })),
        ] },
      { sheetName: 'التوقفات', title: 'التوقفات المرقّمة', meta, orientation: 'landscape',
        columns: [{ key: 'seq', header: '#', ...num(5) }, { key: 'leg', header: 'المرحلة', width: 26 }, { key: 'from', header: 'من', width: 16 }, { key: 'to', header: 'إلى', width: 16 }, { key: 'dur', header: 'المدة', ...num(12) }, { key: 'address', header: 'العنوان', width: 44 }, { key: 'zone', header: 'الزون', width: 20 }, { key: 'src', header: 'مصدر العنوان', ...num(14) }, { key: 'lat', header: 'خط العرض', ...num(12) }, { key: 'lng', header: 'خط الطول', ...num(12) }],
        rows: (d.stops ?? []).map((s) => ({ seq: s.seq, leg: legName(d, s.leg_id), from: fmtTime(s.started_at), to: fmtTime(s.ended_at), dur: fmtDur(s.duration_seconds), address: s.address ?? '', zone: s.geofence_name ?? '', src: s.address_source === 'lvn' ? 'LVN' : s.address_source === 'osm' ? 'OpenStreetMap' : s.address_source === 'zone' ? 'زون' : '', lat: Number(s.lat.toFixed(6)), lng: Number(s.lng.toFixed(6)) })) },
      { sheetName: 'الانقطاعات', title: 'انقطاعات الإشارة', meta,
        columns: [{ key: 'seq', header: '#', ...num(5) }, { key: 'leg', header: 'المرحلة', width: 26 }, { key: 'from', header: 'من', width: 16 }, { key: 'to', header: 'إلى', width: 16 }, { key: 'dur', header: 'المدة', ...num(12) }, { key: 'fl', header: 'آخر موقع', width: 22 }, { key: 'tl', header: 'أول موقع بعده', width: 22 }],
        rows: (d.gaps ?? []).map((g) => ({ seq: g.seq, leg: legName(d, g.leg_id), from: fmtTime(g.started_at), to: fmtTime(g.ended_at), dur: fmtDur(g.seconds), fl: `${g.from_lat.toFixed(5)}, ${g.from_lng.toFixed(5)}`, tl: `${g.to_lat.toFixed(5)}, ${g.to_lng.toFixed(5)}` })) },
      { sheetName: 'النقاط', title: 'نقاط المسار (بعد التنظيف)', meta: `${meta} · ${d.points.length} نقطة`, orientation: 'landscape',
        columns: [{ key: 'seq', header: '#', ...num(6) }, { key: 't', header: 'الوقت', width: 18 }, { key: 'state', header: 'الحالة', ...num(10) }, { key: 'leg', header: 'المرحلة', width: 24 }, { key: 'lat', header: 'خط العرض', ...num(12) }, { key: 'lng', header: 'خط الطول', ...num(12) }, { key: 'speed', header: 'السرعة', ...num(9) }, { key: 'course', header: 'الاتجاه°', ...num(9) }, { key: 'dist', header: 'مسافة من السابقة (م)', ...num(16) }, { key: 'secs', header: 'ثوانٍ من السابقة', ...num(14) }, { key: 'address', header: 'العنوان (LVN)', width: 36 }],
        rows: d.points.map((p) => ({ seq: p.seq, t: fmtDateTime(p.t), state: STATE_AR[p.state] ?? p.state, leg: legName(d, p.leg_id), lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), speed: p.speed == null ? '' : Math.round(p.speed), course: p.course == null ? '' : Math.round(p.course), dist: Math.round(p.dist_m), secs: p.seconds, address: p.address ?? '' })) },
    ],
  })
}

const xml = (v: unknown) => String(v ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c)
/** KML: خط المسار + توقفات مرقّمة + نقاط البداية/النهاية + علامات المراحل */
export function buildTripRouteKml(d: TripRouteDetail): string {
  const name = `مسار انطلاقية ${tripTitle(d.trip)} ${dayStamp(d.trip?.departed_at ?? d.first_fix)}`
  const coords = d.points.map((p) => `${p.lng},${p.lat},0`).join(' ')
  const first = d.points[0], last = d.points[d.points.length - 1]
  const pm = (n: string, desc: string, lat: number, lng: number, style: string) => `<Placemark><name>${xml(n)}</name><description>${xml(desc)}</description><styleUrl>#${style}</styleUrl><Point><coordinates>${lng},${lat},0</coordinates></Point></Placemark>`
  const stops = (d.stops ?? []).map((s) => pm(`توقف ${s.seq} · ${fmtDur(s.duration_seconds)}`, `${fmtTime(s.started_at)} ← ${fmtTime(s.ended_at)}\n${s.address ?? ''}${s.geofence_name ? `\nزون: ${s.geofence_name}` : ''}`, s.lat, s.lng, 'stop')).join('')
  const stages = (d.legs ?? []).flatMap((l) => {
    const lp = d.points.filter((p) => p.leg_id === l.leg_id), a = lp[0], b = lp[lp.length - 1]
    return [a ? pm(`${l.sequence_no} ↗ ${DEST_AR[l.destination_type] ?? l.destination_type}`, `انطلاق ${fmtDateTime(l.departed_at)}`, a.lat, a.lng, 'stage') : '', b && l.arrived_at ? pm(`${l.sequence_no} ✓ ${DEST_AR[l.destination_type] ?? ''}`, `تأكيد الوصول ${fmtDateTime(l.arrived_at)}`, b.lat, b.lng, 'stage') : '']
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name>
<Style id="track"><LineStyle><color>ff2563eb</color><width>4</width></LineStyle></Style>
<Style id="stop"><IconStyle><color>ff2626dc</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle></Style>
<Style id="stage"><IconStyle><color>ffc78207</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/blu-blank.png</href></Icon></IconStyle></Style>
<Style id="end"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/go.png</href></Icon></IconStyle></Style>
<Placemark><name>${xml(name)}</name><description>${xml(summaryRows(d).map((r) => `${r.metric}: ${r.value}`).join('\n'))}</description><styleUrl>#track</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>
${first ? pm(`الانطلاق ${fmtTime(first.t)}`, fmtDateTime(first.t), first.lat, first.lng, 'end') : ''}${last && d.is_final ? pm(`النهاية ${fmtTime(last.t)}`, fmtDateTime(last.t), last.lat, last.lng, 'end') : ''}
<Folder><name>التوقفات</name>${stops}</Folder><Folder><name>المراحل</name>${stages}</Folder>
</Document></kml>`
}
/** GPX: مسار بنقاط موقّتة + السرعة في extensions + التوقفات كنقاط طريق */
export function buildTripRouteGpx(d: TripRouteDetail): string {
  const name = `مسار انطلاقية ${tripTitle(d.trip)} ${dayStamp(d.trip?.departed_at ?? d.first_fix)}`
  const trkpts = d.points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.t).toISOString()}</time>${p.course != null ? `<course>${p.course}</course>` : ''}<extensions><speed_kmh>${p.speed ?? 0}</speed_kmh><state>${p.state}</state></extensions></trkpt>`).join('')
  const wpts = (d.stops ?? []).map((s) => `<wpt lat="${s.lat}" lon="${s.lng}"><time>${new Date(s.started_at).toISOString()}</time><name>${xml(`توقف ${s.seq} · ${fmtDur(s.duration_seconds)}`)}</name><desc>${xml(s.address ?? '')}</desc><sym>Flag</sym></wpt>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Akaram PWA" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(name)}</name><time>${new Date().toISOString()}</time></metadata>${wpts}<trk><name>${xml(name)}</name><trkseg>${trkpts}</trkseg></trk></gpx>`
}
export function downloadTripRouteKml(d: TripRouteDetail) { downloadBlob(new Blob([buildTripRouteKml(d)], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' }), `${tripFileBase(d)}.kml`) }
export function downloadTripRouteGpx(d: TripRouteDetail) { downloadBlob(new Blob([buildTripRouteGpx(d)], { type: 'application/gpx+xml;charset=utf-8' }), `${tripFileBase(d)}.gpx`) }

/** يلتقط عنصر الخريطة (Leaflet) كصورة PNG — بلاطات OpenStreetMap تسمح بـ CORS فتُضمَّن */
export async function captureElementPng(el: HTMLElement, pixelRatio = 2): Promise<string> {
  const { toPng } = await import('html-to-image')
  const opts = { pixelRatio, cacheBust: false, backgroundColor: '#ffffff', filter: (n: Node) => !(n instanceof Element && (n.classList.contains('no-print') || n.classList.contains('leaflet-control-container'))) }
  try { return await toPng(el, { ...opts, skipFonts: false }) } catch { return await toPng(el, { ...opts, skipFonts: true, pixelRatio: 1 }) }
}
/** PDF: تُلتقط ورقة التقرير (A4) كصورة وتُوزَّع على صفحات بارتفاع A4 */
export async function exportTripRoutePdf(sheet: HTMLElement, d: TripRouteDetail) {
  const png = await captureElementPng(sheet, 2)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('PDF_IMAGE_FAILED')); i.src = png })
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageW = 190, pageH = 277, ratio = pageW / img.width, totalH = img.height * ratio
  const sliceH = pageH / ratio   // ارتفاع الشريحة بالبكسل
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('PDF_CANVAS_FAILED')
  const pages = Math.max(1, Math.ceil(totalH / pageH))
  for (let i = 0; i < pages; i++) {
    const y = i * sliceH, h = Math.min(sliceH, img.height - y)
    canvas.width = img.width; canvas.height = Math.ceil(h)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h)
    if (i > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, pageW, h * ratio, undefined, 'FAST')
  }
  pdf.setProperties({ title: `تقرير مسار انطلاقية — ${tripTitle(d.trip)}`, creator: 'شركة جزيرة الأكارم' })
  downloadBlob(pdf.output('blob'), `${tripFileBase(d)}.pdf`)
}
/** طباعة: نافذة مستقلة تحوي ورقة التقرير فقط (بلا قائمة/رأس التطبيق)، ورقة لكل صفحة، ألوان مطبوعة */
export function printTripRoute(sheet: HTMLElement, title: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) throw new Error('POPUP_BLOCKED')
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => n.outerHTML).join('\n')
  w.document.open()
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${xml(title)}</title>${styles}<style>@page{size:A4;margin:10mm}html,body{background:#fff;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.trip-sheet{box-shadow:none!important;margin:0 auto!important}.trip-sheet table{break-inside:auto}.trip-sheet tr{break-inside:avoid}.trip-sheet thead{display:table-header-group}.trip-sheet section{break-inside:avoid}</style></head><body>${sheet.outerHTML}</body></html>`)
  w.document.close()
  w.focus()
  w.setTimeout(() => { w.print() }, 400)
}

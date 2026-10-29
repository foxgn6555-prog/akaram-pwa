/**
 * 00374 — تقرير «الأماكن التي تحتاج دعماً» من بقع التوقف: HTML مستقل قابل للطباعة/الحفظ PDF (ورقة A4، ألوان مطبوعة).
 * مرتّب بترتيب «تحتاج دعماً» (زمن التوقف × تنوّع الأنواع × عدد الآليات × الأيام المتكررة).
 */
import type { GpsStopHotspot, GpsStopHotspotsResult } from '@sdk/gps-lvn.sdk'
import {
  HOTSPOT_CLASS_COLORS,
  HOTSPOT_CLASS_LABELS,
  countByClass,
  formatPeakHour,
  formatStopDuration,
  hotspotClass,
  recurrenceLabel,
  recurrenceStars,
  typesSummary,
} from './stopHotspots'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const n = (v: number) => v.toLocaleString('en-US')
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export const supportSorted = (spots: GpsStopHotspot[]) =>
  [...spots].sort((a, b) => (a.support_rank ?? 1e9) - (b.support_rank ?? 1e9) || b.total_seconds - a.total_seconds)

/** يبني HTML كاملاً للتقرير (بلا اعتماد على أنماط التطبيق) */
export function stopHotspotsReportHtml(data: GpsStopHotspotsResult, opts: { limit?: number; includeLight?: boolean; generatedAt?: Date } = {}) {
  const limit = opts.limit ?? 30
  const all = opts.includeLight ? data.spots : data.spots.filter((s) => hotspotClass(s) !== 'light')
  const list = supportSorted(all).slice(0, limit)
  const byClass = countByClass(data.spots)
  const days = data.meta.max_days
  const generated = opts.generatedAt ?? new Date()
  const rows = list
    .map((s, i) => {
      const cls = hotspotClass(s)
      const types = typesSummary(s) || '—'
      const rec = s.recurrence_tier ? `${recurrenceStars(s.recurrence_tier)} ${recurrenceLabel(s.recurrence_tier)}` : '—'
      const top = s.top_recurring && s.recurrence_tier ? `${s.top_recurring.db_number ? `DB ${s.top_recurring.db_number}` : s.top_recurring.vehicle_name ?? ''} (${s.top_recurring.stops} توقف / ${s.top_recurring.days} أيام)` : ''
      return `<tr>
  <td class="c">${i + 1}</td>
  <td><b>${esc(s.address ?? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`)}</b><div class="muted">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</div></td>
  <td class="c"><span class="pill" style="background:${HOTSPOT_CLASS_COLORS[cls]}">${HOTSPOT_CLASS_LABELS[cls]}</span></td>
  <td class="c"><b>${esc(formatStopDuration(s.total_seconds))}</b><div class="muted">أطول ${esc(formatStopDuration(s.max_seconds))} · وسيط ${esc(formatStopDuration(s.median_seconds ?? s.avg_seconds))}</div></td>
  <td class="c">${n(s.stops)}</td>
  <td class="c">${n(s.vehicles)}${(s.type_count ?? 0) >= 2 ? `<div class="multi">${s.type_count} أنواع</div>` : ''}</td>
  <td>${esc(types)}</td>
  <td>${esc(rec)}${top ? `<div class="muted">${esc(top)}</div>` : ''}</td>
  <td class="c">${n(s.days_active ?? 0)}</td>
  <td class="c">${esc(formatPeakHour(s.peak_hour))}</td>
</tr>`
    })
    .join('\n')
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير بقع التوقف — الأماكن التي تحتاج دعماً</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,"Segoe UI",Tahoma,Arial,sans-serif;color:#0f172a;margin:0;background:#fff;font-size:11px}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #be123c;padding-bottom:6px;margin-bottom:8px}
h1{margin:0;font-size:18px;color:#be123c}
.sub{color:#475569;font-size:11px;margin-top:2px}
.stats{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin:8px 0}
.stat{border:1px solid #e2e8f0;border-radius:8px;padding:6px;text-align:center}
.stat b{display:block;font-size:14px}
.stat span{color:#64748b;font-size:10px}
table{width:100%;border-collapse:collapse}
th{background:#1e293b;color:#fff;padding:5px 4px;font-size:10px}
td{border-bottom:1px solid #e2e8f0;padding:4px;vertical-align:top}
tr{break-inside:avoid}
thead{display:table-header-group}
.c{text-align:center}
.muted{color:#64748b;font-size:9px}
.pill{display:inline-block;color:#fff;border-radius:999px;padding:2px 7px;font-weight:800;font-size:9px;white-space:nowrap}
.multi{color:#0e7490;font-weight:800;font-size:9px}
.legend{margin-top:8px;color:#475569;font-size:9.5px;line-height:1.6}
footer{margin-top:8px;display:flex;justify-content:space-between;color:#64748b;font-size:9px}
</style></head><body>
<header>
  <div><h1>تقرير بقع التوقف — الأماكن التي تحتاج دعماً</h1>
  <div class="sub">شركة جزيرة الأكارم · غرفة العمليات · آخر ${n(days)} ${days === 1 ? 'يوم' : 'أيام'} · أُعدّ في ${esc(when(generated.toISOString()))} · البيانات حتى ${esc(when(data.meta.last_refresh_at))}</div></div>
  <div class="sub">الترتيب: زمن التوقف × تنوّع الأنواع × عدد الآليات × الأيام المتكررة</div>
</header>
<div class="stats">
  <div class="stat"><b>${n(data.spots.length)}</b><span>بقعة</span></div>
  <div class="stat"><b>${n(data.totals.stops)}</b><span>توقف</span></div>
  <div class="stat"><b>${n(data.totals.vehicles)}</b><span>آلية</span></div>
  <div class="stat"><b>${esc(formatStopDuration(data.totals.total_seconds))}</b><span>إجمالي التوقف</span></div>
  <div class="stat"><b style="color:${HOTSPOT_CLASS_COLORS.long}">${n(byClass.long)}</b><span>توقف طويل</span></div>
  <div class="stat"><b style="color:${HOTSPOT_CLASS_COLORS.loiter}">${n(byClass.loiter)}</b><span>تلكؤ / نفايات</span></div>
  <div class="stat"><b style="color:#0e7490">${n(data.totals.multi_type_spots ?? 0)}</b><span>متعددة الأنواع</span></div>
  <div class="stat"><b style="color:#b45309">${n(data.totals.recurring_spots ?? 0)}</b><span>متكررة</span></div>
</div>
<table>
<thead><tr><th>#</th><th>الموقع</th><th>الصنف</th><th>زمن التوقف</th><th>توقفات</th><th>آليات</th><th>أنواع الآليات</th><th>التكرار</th><th>أيام</th><th>الذروة</th></tr></thead>
<tbody>${rows || '<tr><td colspan="10" class="c">لا بقع ضمن النافذة</td></tr>'}</tbody>
</table>
<div class="legend">
<b>الأصناف:</b> توقف طويل = أغلب زمن التوقف من توقفات ≥ 60 د · تلكؤ / موقع نفايات = 10–60 د · خفيف / ازدحام = أقل من 10 د${opts.includeLight ? '' : ' (غير مشمول في هذا التقرير)'}.<br>
<b>التكرار:</b> ⭐ نفس الآلية 3 مرات أو أكثر · ⭐⭐ 5 مرات أو أكثر · ⭐⭐⭐ في 3 أيام مختلفة (عادة يومية). <b>متعددة الأنواع</b> = أكثر من نوع آلية (كابسة، قلاب، حوضية…) يتوقف في المكان نفسه — مؤشر على موقع يحتاج معالجة أو دعماً.
</div>
<footer><span>المصدر: أجهزة GPS للآليات — تجميع تلقائي كل دقيقة، باستبعاد الزونات والمعالم المحددة</span><span>عدد الصفوف: ${n(list.length)} من ${n(all.length)}</span></footer>
</body></html>`
}

/** يفتح التقرير في نافذة مستقلة ويطبعه (حفظ PDF من حوار الطباعة) */
export function printStopHotspotsReport(data: GpsStopHotspotsResult, opts?: Parameters<typeof stopHotspotsReportHtml>[1]) {
  const w = window.open('', '_blank', 'width=1200,height=900')
  if (!w) throw new Error('POPUP_BLOCKED')
  w.document.open()
  w.document.write(stopHotspotsReportHtml(data, opts))
  w.document.close()
  w.focus()
  w.setTimeout(() => { w.print() }, 400)
}

/** 00385 — تصدير خريطة النفايات: Excel (ورقة البقع + ورقة الآليات + ملخص) وتقرير HTML مستقل للطباعة/حفظ PDF */
import type { GpsHotspot, GpsHotspotsMonthStats } from '@sdk/gps-hotspots.sdk'
import { downloadWorkbook } from '@features/gbs/gbs-excel'
import { CLASS_COLOR, CLASS_LABEL, RECURRENCE_LABEL, compareMonths, deltaLabel, fmtMinutes, monthLabel, peakHours, spotPlace, summarize, type WasteMapFilters } from './hotspots.logic'

const n = (v: number) => v.toLocaleString('en-US')
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const when = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false })
export const sortedForExport = (rows: GpsHotspot[]) => [...rows].sort((a, b) => b.total_minutes - a.total_minutes || b.stops_count - a.stops_count)
export const filtersLabel = (f: WasteMapFilters, sectorNames: Map<number, string>): string => [
  `الصنف: ${f.classes.length ? f.classes.map((c) => CLASS_LABEL[c]).join('/') : 'الكل'}`,
  `التكرار: ${f.recurrence.length === 3 || f.recurrence.length === 0 ? 'الكل' : f.recurrence.map((r) => RECURRENCE_LABEL[r]).join('/')}`,
  `الآليات: ${f.minVehicles > 1 ? `${f.minVehicles}+` : 'الكل'}`,
  `القاطع: ${f.sectorIds.length ? f.sectorIds.map((id) => sectorNames.get(id) ?? id).join('/') : 'الكل'}`,
].join(' · ')

export const HOTSPOT_COLUMNS = ['#', 'القاطع', 'الصنف الغالب', 'التكرار', 'التوقفات', 'الأيام', 'الآليات', 'إجمالي (دقيقة)', 'متوسط (دقيقة)', 'أقصى (دقيقة)', 'ثقيل', 'متوسط', 'خفيف', 'ذروة الساعات', 'خط العرض', 'خط الطول', 'رابط الخريطة'] as const
export const hotspotRowValues = (h: GpsHotspot, i: number): (string | number)[] => [i + 1, spotPlace(h), CLASS_LABEL[h.dominant_class], RECURRENCE_LABEL[h.recurrence], h.stops_count, h.days_count, h.vehicles_count, h.total_minutes, h.avg_minutes, h.max_minutes, h.heavy_count, h.medium_count, h.light_count, peakHours(h.hours), Number(h.lat.toFixed(6)), Number(h.lng.toFixed(6)), `https://www.google.com/maps?q=${h.lat.toFixed(6)},${h.lng.toFixed(6)}`]

export async function buildHotspotsWorkbook(rows: GpsHotspot[], month: string, filtersText: string, stats: GpsHotspotsMonthStats[] = []) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook(); wb.creator = 'شركة جزيرة الأكارم — غرفة العمليات'; wb.created = new Date()
  const list = sortedForExport(rows)
  const ws = wb.addWorksheet('البقع', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] })
  ws.addRow([`خريطة النفايات — بقع التوقف — ${monthLabel(month)}`]).font = { bold: true, size: 14 }
  ws.addRow([`الفلاتر: ${filtersText} · ${n(list.length)} بقعة · أُنشئ ${when(new Date())}`]).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }
  const head = ws.addRow([...HOTSPOT_COLUMNS])
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; c.alignment = { horizontal: 'center' } })
  list.forEach((h, i) => { const r = ws.addRow(hotspotRowValues(h, i)); r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + CLASS_COLOR[h.dominant_class].slice(1) } }; r.getCell(3).font = { color: { argb: 'FFFFFFFF' }, bold: true } })
  ;[5, 26, 12, 12, 10, 8, 8, 14, 14, 12, 8, 8, 8, 14, 12, 12, 40].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + list.length, column: HOTSPOT_COLUMNS.length } }
  const vs = wb.addWorksheet('الآليات لكل بقعة', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
  vs.addRow(['# البقعة', 'القاطع', 'الآلية', 'رقم DB', 'قاطع الآلية', 'الجهاز', 'التوقفات', 'الدقائق']).font = { bold: true }
  list.forEach((h, i) => (h.vehicles ?? []).forEach((v) => vs.addRow([i + 1, spotPlace(h), v.name ?? '—', v.db_number ?? '—', v.sector ?? '—', v.device, v.stops, v.minutes])))
  ;[9, 24, 22, 10, 16, 16, 10, 10].forEach((w, i) => { vs.getColumn(i + 1).width = w })
  const s = summarize(list), sum = wb.addWorksheet('ملخص', { views: [{ rightToLeft: true }] })
  sum.addRow(['البند', 'القيمة']).font = { bold: true }
  ;[['بقع', s.spots], ['توقفات', s.stops], ['إجمالي التوقف (دقيقة)', s.totalMinutes], ['آليات مميزة', s.vehicles], ['بقع بأكثر من آلية', s.multi], ['ثقيلة', s.byClass.heavy], ['متوسطة', s.byClass.medium], ['خفيفة', s.byClass.light], ['شبه يومية', s.byRecurrence.frequent], ['متكررة', s.byRecurrence.recurring], ['مرة واحدة', s.byRecurrence.once]].forEach((r) => sum.addRow(r))
  const cmp = compareMonths(stats, month)
  if (cmp.available) { sum.addRow([]); sum.addRow([`مقارنة ${monthLabel(month)} مع ${monthLabel(cmp.previous)}`, 'الحالي', 'السابق', 'الفرق']).font = { bold: true }; cmp.rows.forEach((d) => sum.addRow([d.label, d.current, d.previous ?? '', deltaLabel(d)])) }
  ;[30, 12, 12, 20].forEach((w, i) => { sum.getColumn(i + 1).width = w })
  return wb
}
export async function downloadHotspotsExcel(rows: GpsHotspot[], month: string, filtersText: string, stats?: GpsHotspotsMonthStats[]) {
  await downloadWorkbook(await buildHotspotsWorkbook(rows, month, filtersText, stats), `waste-map-${month}.xlsx`)
}

/** HTML مستقل (A4 أفقي، ألوان مطبوعة) */
export function hotspotsReportHtml(rows: GpsHotspot[], month: string, filtersText: string, stats: GpsHotspotsMonthStats[] = [], generatedAt = new Date()) {
  const list = sortedForExport(rows), s = summarize(list), cmp = compareMonths(stats, month)
  const tr = list.map((h, i) => `<tr><td class="c">${i + 1}</td><td>${esc(spotPlace(h))}</td><td class="c"><span class="pill" style="background:${CLASS_COLOR[h.dominant_class]}">${CLASS_LABEL[h.dominant_class]}</span></td><td class="c">${RECURRENCE_LABEL[h.recurrence]}</td><td class="c">${n(h.stops_count)}</td><td class="c">${n(h.days_count)}</td><td class="c">${n(h.vehicles_count)}</td><td class="c"><b>${esc(fmtMinutes(h.total_minutes))}</b></td><td class="c">${h.avg_minutes} / ${h.max_minutes}</td><td class="c">${h.heavy_count} / ${h.medium_count} / ${h.light_count}</td><td class="c">${esc(peakHours(h.hours))}</td><td class="c mono">${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}</td></tr>`).join('\n')
  const cmpHtml = cmp.available ? `<section><h2>مقارنة مع ${esc(monthLabel(cmp.previous))}</h2><div class="stats">${cmp.rows.map((d) => `<div class="stat"><b>${n(d.current)}</b><span>${esc(d.label)}</span><em class="${(d.delta ?? 0) > 0 ? 'up' : (d.delta ?? 0) < 0 ? 'down' : ''}">${esc(deltaLabel(d))}</em></div>`).join('')}</div></section>` : '<p class="sub">لا تتوفر بيانات الشهر السابق للمقارنة.</p>'
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>خريطة النفايات — بقع التوقف — ${esc(monthLabel(month))}</title>
<style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:system-ui,"Segoe UI",Tahoma,Arial,sans-serif;color:#0f172a;margin:0;background:#fff;font-size:11px}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f766e;padding-bottom:6px;margin-bottom:8px}h1{margin:0;font-size:18px;color:#0f766e}h2{font-size:13px;margin:10px 0 4px}
.sub{color:#475569;font-size:10px;margin-top:2px}.stats{display:grid;grid-template-columns:repeat(9,1fr);gap:6px;margin:6px 0}.stat{border:1px solid #e2e8f0;border-radius:8px;padding:6px;text-align:center}.stat b{display:block;font-size:14px}.stat span{color:#64748b;font-size:9px;display:block}.stat em{font-style:normal;font-size:9px;color:#64748b}.stat em.up{color:#b91c1c}.stat em.down{color:#047857}
table{width:100%;border-collapse:collapse}th{background:#1e293b;color:#fff;padding:5px 4px;font-size:10px}td{border-bottom:1px solid #e2e8f0;padding:4px;vertical-align:top}td.c{text-align:center}.mono{font-family:monospace;font-size:9px}.pill{color:#fff;border-radius:999px;padding:1px 7px;font-weight:700}tr{break-inside:avoid}thead{display:table-header-group}section{break-inside:avoid}
footer{display:flex;justify-content:space-between;color:#64748b;font-size:9px;border-top:1px solid #e2e8f0;margin-top:8px;padding-top:4px}</style></head><body>
<header><div><h1>خريطة النفايات — بقع التوقف — ${esc(monthLabel(month))}</h1><div class="sub">شركة جزيرة الأكارم — غرفة العمليات · ${esc(filtersText)} · أُنشئ ${esc(when(generatedAt))}</div></div><div class="sub">المصدر: مستودع GPS التحليلي (توقفات 10 د – ساعتين، باستبعاد الأعطال)</div></header>
<div class="stats"><div class="stat"><b>${n(s.spots)}</b><span>بقع</span></div><div class="stat"><b>${n(s.stops)}</b><span>توقفات</span></div><div class="stat"><b>${esc(fmtMinutes(s.totalMinutes))}</b><span>إجمالي التوقف</span></div><div class="stat"><b>${n(s.vehicles)}</b><span>آليات</span></div><div class="stat"><b>${n(s.multi)}</b><span>بأكثر من آلية</span></div><div class="stat"><b style="color:${CLASS_COLOR.heavy}">${n(s.byClass.heavy)}</b><span>ثقيلة</span></div><div class="stat"><b style="color:${CLASS_COLOR.medium}">${n(s.byClass.medium)}</b><span>متوسطة</span></div><div class="stat"><b style="color:${CLASS_COLOR.light}">${n(s.byClass.light)}</b><span>خفيفة</span></div><div class="stat"><b>${n(s.byRecurrence.frequent)}</b><span>شبه يومية</span></div></div>
${cmpHtml}
<table><thead><tr><th>#</th><th>القاطع</th><th>الصنف</th><th>التكرار</th><th>توقفات</th><th>أيام</th><th>آليات</th><th>إجمالي</th><th>متوسط/أقصى (د)</th><th>ث/م/خ</th><th>ذروة</th><th>الإحداثيات</th></tr></thead><tbody>${tr}</tbody></table>
<footer><span>الخفيف = أقل من حد الخفيف؛ الثقيل = أكثر من حد المتوسط (الحدود في بوابة IT)</span><span>عدد الصفوف: ${n(list.length)}</span></footer></body></html>`
}
export function printHotspotsReport(rows: GpsHotspot[], month: string, filtersText: string, stats?: GpsHotspotsMonthStats[]) {
  const w = window.open('', '_blank', 'width=1200,height=900')
  if (!w) throw new Error('POPUP_BLOCKED')
  w.document.open(); w.document.write(hotspotsReportHtml(rows, month, filtersText, stats)); w.document.close(); w.focus()
  w.setTimeout(() => { w.print() }, 400)
}

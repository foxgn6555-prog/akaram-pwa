/**
 * تصدير/طباعة وحدة الكشوفات (00170 — الجولة B)
 *  · disclosuresToExcel: مصنف Excel مؤسسي (ورقة السجل + ورقة ملخص حسب النوع/الحالة/المُعدّ + رسوم) مع وصف المرشّحات المطبّقة
 *  · printDisclosuresReport: تقرير جماعي A4 أفقي (ترويسة الشركة · المرشّحات · مؤشرات · جدول · إجمالي · مصادقات)
 *  · printDisclosureForm: نموذج الكشف الرسمي (A4 عمودي — بيانات الهدف · المخالفة · القرار · مسار الموافقة · التواقيع)
 *  كل الطباعة: @page بلا هوامش متصفح + print-color-adjust:exact حتى تُطبع الألوان.
 */
import type ExcelJS from 'exceljs'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import { DISCLOSURE_STATUS_LABEL, EVENT_LABEL, PENALTY_LABEL, SHIFT_LABEL, type DisclosureStatusV2, type DisclosureV2 } from '@sdk/disclosures-unit.sdk'

export const COMPANY = 'شركة جزيرة الأكارم'
const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const num = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('en-US').format(n))
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('ar-IQ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const d10 = (s: string | null | undefined) => (s ? s.slice(0, 10) : '—')
const pen = (k: string | null) => (k ? PENALTY_LABEL[k as keyof typeof PENALTY_LABEL] ?? k : '—')
const sh = (k: string | null) => (k ? SHIFT_LABEL[k] ?? k : '—')
const st = (s: DisclosureStatusV2) => DISCLOSURE_STATUS_LABEL[s]
function logoUrl(): string {
  const env = (typeof import.meta !== 'undefined' ? import.meta : {}) as { env?: { BASE_URL?: string } }
  return `${env.env?.BASE_URL ?? '/'}icons/logo.png`
}
const STATUS_COLOR: Record<DisclosureStatusV2, string> = { draft: '#94a3b8', pending: '#f59e0b', returned: '#ef4444', approved: '#10b981', cancelled: '#64748b' }

/** وصف المرشّحات المطبّقة (يظهر في Excel والطباعة) */
export interface ExportContext { title?: string; scopeLabel?: string; filtersSummary?: string[]; preparedBy?: string | null }

const COLUMNS: ReportColumn[] = [
  { header: 'م', key: '#', width: 5, align: 'center' },
  { header: 'رقم الكشف', key: 'ref', width: 15, align: 'center' },
  { header: 'الهدف', key: 'kind', width: 8, align: 'center' },
  { header: 'الاسم', key: 'name', width: 24 },
  { header: 'الرقم الوظيفي', key: 'emp_no', width: 12, align: 'center' },
  { header: 'DB', key: 'db', width: 10, align: 'center' },
  { header: 'نوع الآلية', key: 'vehicle_type', width: 14 },
  { header: 'المتعهد', key: 'contractor', width: 14 },
  { header: 'القاطع/القسم', key: 'sector', width: 14 },
  { header: 'الشفت', key: 'shift', width: 9, align: 'center' },
  { header: 'تاريخ المخالفة', key: 'log_date', width: 12, align: 'center' },
  { header: 'نوع الكشف', key: 'type', width: 18 },
  { header: 'العقوبة', key: 'penalty', width: 11, align: 'center' },
  { header: 'المبلغ (د.ع)', key: 'amount', width: 13, align: 'center', numFmt: '#,##0' },
  { header: 'الحالة', key: 'status', width: 13, align: 'center' },
  { header: 'عند', key: 'step', width: 16 },
  { header: 'مُعدّ الكشف', key: 'prepared_by', width: 16 },
  { header: 'تاريخ الرفع', key: 'submitted_at', width: 16, align: 'center' },
  { header: 'المعتمِد النهائي', key: 'approved_by', width: 16 },
  { header: 'شهر الاستقطاع', key: 'deduction_month', width: 12, align: 'center' },
  { header: 'استقطاع مُسجَّل', key: 'deducted', width: 10, align: 'center' },
  { header: 'سبب الإعادة/الإلغاء', key: 'reason', width: 24, wrap: true },
  { header: 'التفاصيل', key: 'details', width: 44, wrap: true },
]
const rowOf = (d: DisclosureV2, i: number): Record<string, unknown> => ({
  '#': i + 1, ref: d.ref_no ?? '—', kind: d.target_kind === 'vehicle' ? 'آلية' : 'موظف', name: d.target_kind === 'vehicle' ? d.driver_name : d.employee_name ?? '—', emp_no: d.employee_number ?? '—',
  db: d.target_kind === 'vehicle' ? d.db_number : '—', vehicle_type: d.vehicle_type ?? '—', contractor: d.contractor_name ?? '—', sector: d.sector ?? d.department_name ?? '—', shift: sh(d.shift), log_date: d10(d.log_date),
  type: d.type_label, penalty: pen(d.penalty_type), amount: d.amount ?? null, status: st(d.status), step: d.status === 'pending' ? d.current_step ?? '—' : '—', prepared_by: d.prepared_by_name ?? '—',
  submitted_at: dt(d.submitted_at), approved_by: d.approved_by_name ? `${d.approved_by_name} · ${dt(d.approved_at)}` : '—', deduction_month: d.deduction_month ? d.deduction_month.slice(0, 7) : '—', deducted: d.deduction_posted ? 'نعم' : d.amount ? 'لا' : '—',
  reason: d.status === 'returned' ? d.return_reason ?? '' : d.status === 'cancelled' ? d.cancel_reason ?? '' : '', details: d.details,
})

/** تجميعات جاهزة لورقة الملخص والرسوم والتقرير المطبوع */
export function summarize(list: DisclosureV2[]) {
  const by = <K extends string>(f: (d: DisclosureV2) => K) => { const m = new Map<K, { count: number; amount: number }>(); for (const d of list) { const k = f(d); const c = m.get(k) ?? { count: 0, amount: 0 }; c.count++; c.amount += d.amount ?? 0; m.set(k, c) } return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.count - a.count) }
  const total = list.length
  const amountAll = list.reduce((a, d) => a + (d.amount ?? 0), 0)
  const amountApproved = list.filter((d) => d.status === 'approved').reduce((a, d) => a + (d.amount ?? 0), 0)
  return {
    total, amountAll, amountApproved,
    approved: list.filter((d) => d.status === 'approved').length, pending: list.filter((d) => d.status === 'pending').length, returned: list.filter((d) => d.status === 'returned').length, cancelled: list.filter((d) => d.status === 'cancelled').length, draft: list.filter((d) => d.status === 'draft').length,
    deducted: list.filter((d) => d.deduction_posted).length, people: new Set(list.map((d) => d.employee_id ?? `${d.target_kind}:${d.db_number}:${d.driver_name}`)).size,
    byType: by((d) => d.type_label), byStatus: by((d) => d.status), byPreparer: by((d) => d.prepared_by_name ?? '—'), bySector: by((d) => d.sector ?? d.department_name ?? '—'), byKind: by((d) => (d.target_kind === 'vehicle' ? 'آلية' : 'موظف')),
  }
}

export async function disclosuresToExcel(list: DisclosureV2[], ctx: ExportContext = {}): Promise<ExcelJS.Workbook> {
  const today = new Date().toISOString().slice(0, 10)
  const s = summarize(list)
  const metaParts = [ctx.scopeLabel ? `النطاق: ${ctx.scopeLabel}` : '', ...(ctx.filtersSummary ?? []), `تاريخ التصدير: ${today}`, `عدد الكشوفات: ${s.total}`, `مجموع المبالغ: ${num(s.amountAll)} د.ع`].filter(Boolean)
  const sumCols: ReportColumn[] = [{ header: 'البند', key: 'k', width: 30 }, { header: 'العدد', key: 'count', width: 10, align: 'center' }, { header: 'النسبة', key: 'pct', width: 10, align: 'center' }, { header: 'مجموع المبالغ (د.ع)', key: 'amount', width: 18, align: 'center', numFmt: '#,##0' }]
  const sumRows = (title: string, arr: { key: string; count: number; amount: number }[], label: (k: string) => string = (k) => k) => [{ k: `— ${title} —`, count: '', pct: '', amount: '' }, ...arr.map((x) => ({ k: label(x.key), count: x.count, pct: s.total ? `${Math.round((x.count / s.total) * 100)}%` : '0%', amount: x.amount }))]
  return buildExcelReport({
    sheetName: 'سجل الكشوفات', company: COMPANY, companySub: 'غرفة العمليات — وحدة الكشوفات', title: ctx.title ?? 'سجل الكشوفات', meta: metaParts.join('   •   '),
    columns: COLUMNS, rows: list.map(rowOf), fileName: `كشوفات-${today}.xlsx`, orientation: 'landscape',
    totalRow: { ref: 'الإجمالي', name: `${s.total} كشف`, amount: s.amountAll, deducted: `${s.deducted} مُسجَّل` },
    extraSheets: [{
      sheetName: 'الملخص', title: 'ملخص الكشوفات', meta: metaParts.join('   •   '), columns: sumCols,
      rows: [...sumRows('حسب الحالة', s.byStatus, (k) => st(k as DisclosureStatusV2)), ...sumRows('حسب نوع الكشف', s.byType), ...sumRows('حسب الهدف', s.byKind), ...sumRows('حسب القاطع/القسم', s.bySector), ...sumRows('حسب مُعدّ الكشف', s.byPreparer)],
      totalRow: { k: 'الإجمالي', count: s.total, pct: '100%', amount: s.amountAll },
    }],
    charts: [
      { title: 'توزيع الكشوفات حسب النوع', kind: 'bar', valueLabel: 'عدد الكشوفات', data: s.byType.slice(0, 12).map((x, i) => ({ label: x.key, value: x.count, color: ['#075985', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#22c55e', '#64748b', '#e11d48', '#0891b2', '#a16207'][i % 12] })) },
      { title: 'حالة الكشوفات', kind: 'donut', valueLabel: 'كشف', data: s.byStatus.map((x) => ({ label: st(x.key as DisclosureStatusV2), value: x.count, color: STATUS_COLOR[x.key as DisclosureStatusV2] })) },
    ],
  })
}

const PRINT_CSS = `@page{size:A4 landscape;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;background:#e9eef3;color:#0f172a;font-family:Tahoma,Arial,sans-serif;font-size:11px}
.sheet{width:297mm;min-height:210mm;margin:0 auto;background:#fff;padding:12mm 12mm 14mm}.head{display:flex;align-items:center;gap:12px;border-bottom:4px solid #075985;padding-bottom:10px}.head img{width:58px;height:58px;object-fit:contain}
.head h1{margin:0;font-size:20px;color:#083344}.head .sub{color:#475569;font-size:12px;margin-top:3px}.head .meta{margin-right:auto;text-align:left;font-size:10px;color:#475569;line-height:1.7}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.chip{border:1px solid #cbd5e1;border-radius:999px;padding:3px 10px;background:#f8fafc;font-size:10px}
.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:10px 0}.card{border:1px solid #d6e1e8;border-radius:12px;padding:9px 10px;background:#f8fafc}.card b{display:block;font-size:19px;color:#075985;margin-top:3px}.card.g b{color:#059669}.card.r b{color:#dc2626}.card.a b{color:#d97706}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:8px 0}.box{border:1px solid #d6e1e8;border-radius:12px;padding:10px}.box h2{font-size:12px;margin:0 0 8px;color:#083344}.bar{display:grid;grid-template-columns:92px 1fr 56px;gap:6px;align-items:center;font-size:10px;margin:5px 0}.track{height:9px;background:#e5edf2;border-radius:99px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#14b8a6,#075985)}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:9.5px}thead{display:table-header-group}th{background:#083344;color:#fff;font-weight:700}th,td{padding:5px 6px;border:1px solid #d7e1e7;text-align:right;vertical-align:top}tbody tr:nth-child(even){background:#f5f8fa}tr{break-inside:avoid}td.c,th.c{text-align:center}td.n{text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
.st{display:inline-block;border-radius:999px;padding:1px 7px;font-size:9px;color:#fff;font-weight:700}tfoot td{background:#e0f2fe;font-weight:800}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:22px;break-inside:avoid}.sign div{border-top:1px solid #0f172a;padding-top:6px;text-align:center;font-size:10px}.sign b{display:block;font-size:11px;margin-bottom:26px}
.footer{margin-top:10px;border-top:1px solid #d7e1e7;padding-top:6px;font-size:9px;color:#64748b;display:flex;justify-content:space-between}
@media print{body{background:#fff}.sheet{margin:0;width:auto;min-height:0;padding:10mm 10mm 12mm}}`

function openWin(html: string, w = 1200, h = 850): void {
  const win = window.open('', '_blank', `width=${w},height=${h}`)
  if (!win) throw new Error('تعذّر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة')
  win.opener = null; win.document.open(); win.document.write(html); win.document.close()
}
const statusPill = (s: DisclosureStatusV2) => `<span class="st" style="background:${STATUS_COLOR[s]}">${st(s)}</span>`

export function buildReportHtml(list: DisclosureV2[], ctx: ExportContext = {}): string {
  const s = summarize(list); const title = ctx.title ?? 'تقرير الكشوفات'
  const maxT = Math.max(1, ...s.byType.map((x) => x.count))
  const bars = (arr: { key: string; count: number; amount: number }[], label: (k: string) => string = (k) => k, max = maxT) => arr.slice(0, 8).map((x) => `<div class="bar"><span>${esc(label(x.key))}</span><div class="track"><div class="fill" style="width:${(x.count / max) * 100}%"></div></div><b>${x.count}${x.amount ? ` · ${num(x.amount)}` : ''}</b></div>`).join('') || '<div style="color:#94a3b8">لا بيانات</div>'
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><main class="sheet">
<header class="head"><img src="${logoUrl()}" alt=""><div><h1>${COMPANY}</h1><div class="sub">غرفة العمليات — وحدة الكشوفات · ${esc(title)}</div></div><div class="meta">${ctx.scopeLabel ? `النطاق: ${esc(ctx.scopeLabel)}<br>` : ''}تاريخ الإصدار: ${new Date().toLocaleString('ar-IQ')}<br>${ctx.preparedBy ? `أصدره: ${esc(ctx.preparedBy)}` : ''}</div></header>
${ctx.filtersSummary?.length ? `<div class="filters">${ctx.filtersSummary.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
<section class="cards"><div class="card">إجمالي الكشوفات<b>${s.total}</b></div><div class="card a">قيد الموافقة<b>${s.pending}</b></div><div class="card r">مُعادة<b>${s.returned}</b></div><div class="card g">معتمدة<b>${s.approved}</b></div><div class="card">مجموع المبالغ (د.ع)<b>${num(s.amountAll)}</b></div><div class="card g">مبالغ معتمدة (د.ع)<b>${num(s.amountApproved)}</b></div></section>
<section class="grid"><div class="box"><h2>حسب نوع الكشف</h2>${bars(s.byType)}</div><div class="box"><h2>حسب الحالة</h2>${bars(s.byStatus, (k) => st(k as DisclosureStatusV2), Math.max(1, ...s.byStatus.map((x) => x.count)))}</div><div class="box"><h2>حسب مُعدّ الكشف</h2>${bars(s.byPreparer, (k) => k, Math.max(1, ...s.byPreparer.map((x) => x.count)))}</div></section>
<table><thead><tr><th class="c">#</th><th>رقم الكشف</th><th class="c">الهدف</th><th>الاسم</th><th class="c">DB / الرقم الوظيفي</th><th>القاطع/القسم</th><th class="c">التاريخ</th><th>النوع</th><th class="c">العقوبة</th><th class="c">المبلغ</th><th class="c">الحالة</th><th>مُعدّه</th><th>المعتمِد</th><th class="c">شهر الاستقطاع</th><th>التفاصيل</th></tr></thead>
<tbody>${list.map((d, i) => `<tr><td class="c">${i + 1}</td><td class="n">${esc(d.ref_no ?? '—')}</td><td class="c">${d.target_kind === 'vehicle' ? 'آلية' : 'موظف'}</td><td><b>${esc(d.target_kind === 'vehicle' ? d.driver_name : d.employee_name)}</b></td><td class="n">${esc(d.target_kind === 'vehicle' ? d.db_number : d.employee_number ?? '—')}</td><td>${esc(d.sector ?? d.department_name ?? '—')}</td><td class="n">${d10(d.log_date)}</td><td>${esc(d.type_label)}</td><td class="c">${pen(d.penalty_type)}</td><td class="n">${num(d.amount)}</td><td class="c">${statusPill(d.status)}${d.status === 'pending' && d.current_step ? `<div style="font-size:8px;color:#64748b">${esc(d.current_step)}</div>` : ''}</td><td>${esc(d.prepared_by_name ?? '—')}</td><td>${esc(d.approved_by_name ?? '—')}</td><td class="n">${d.deduction_month ? d.deduction_month.slice(0, 7) : '—'}</td><td>${esc(d.details)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="9">الإجمالي: ${s.total} كشف · ${s.people} شخص/آلية · ${s.deducted} استقطاع مُسجَّل</td><td class="n">${num(s.amountAll)}</td><td colspan="5"></td></tr></tfoot></table>
<section class="sign"><div><b>مُعدّ التقرير</b>الاسم والتوقيع</div><div><b>معاون المدير المفوض</b>الاسم والتوقيع</div><div><b>المدير المفوض</b>الاسم والتوقيع</div></section>
<footer class="footer"><span>تقرير إلكتروني صادر من نظام ${COMPANY} — وحدة الكشوفات</span><span>${esc(title)}</span></footer></main>
<script>addEventListener('load',()=>setTimeout(()=>print(),350))</script></body></html>`
}
export function printDisclosuresReport(list: DisclosureV2[], ctx: ExportContext = {}): void { openWin(buildReportHtml(list, ctx)) }

const FORM_CSS = `@page{size:A4 portrait;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;background:#e9eef3;color:#0f172a;font-family:Tahoma,Arial,sans-serif;font-size:12px}
.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:14mm 14mm 16mm;position:relative}.head{display:flex;align-items:center;gap:12px;border-bottom:4px solid #075985;padding-bottom:10px}.head img{width:62px;height:62px;object-fit:contain}.head h1{margin:0;font-size:20px;color:#083344}.head .sub{color:#475569;font-size:12px;margin-top:3px}.ref{margin-right:auto;text-align:left;font-size:11px;line-height:1.8}.ref b{font-size:14px;color:#075985}
h2.t{text-align:center;font-size:18px;margin:14px 0 4px;color:#083344}.st{display:inline-block;border-radius:999px;padding:2px 12px;font-size:11px;color:#fff;font-weight:700}.center{text-align:center}
.sec{border:1px solid #cbd5e1;border-radius:12px;margin-top:12px;overflow:hidden;break-inside:avoid}.sec h3{margin:0;background:#083344;color:#fff;font-size:12px;padding:6px 10px}.kv{display:grid;grid-template-columns:repeat(3,1fr)}.kv div{padding:7px 10px;border-bottom:1px solid #e2e8f0;border-left:1px solid #e2e8f0}.kv div:nth-child(3n){border-left:0}.kv small{display:block;color:#64748b;font-size:9.5px}.kv b{font-size:12px}
.details{padding:10px;white-space:pre-wrap;line-height:1.8;min-height:70px}.amount{display:flex;align-items:center;gap:14px;padding:10px}.amount .big{font-size:22px;font-weight:900;color:#075985;border:2px dashed #075985;border-radius:12px;padding:6px 16px;background:#f0f9ff}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.steps div{padding:8px 10px;border-left:1px solid #e2e8f0;font-size:11px}.steps div:last-child{border-left:0}.steps .ok{background:#ecfdf5}.steps .wait{background:#fffbeb}.steps .rej{background:#fef2f2}.steps small{display:block;color:#64748b;font-size:9.5px;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:10.5px}td,th{padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right}th{background:#f1f5f9}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:26px;break-inside:avoid}.sign div{border-top:1px solid #0f172a;padding-top:6px;text-align:center;font-size:10.5px}.sign b{display:block;font-size:12px;margin-bottom:30px}.sign small{display:block;color:#475569}
.note{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;font-size:11px}.note.g{background:#ecfdf5;border-color:#a7f3d0}.note.r{background:#fef2f2;border-color:#fecaca}
.footer{position:absolute;bottom:8mm;left:14mm;right:14mm;border-top:1px solid #d7e1e7;padding-top:5px;font-size:9px;color:#64748b;display:flex;justify-content:space-between}
@media print{body{background:#fff}.sheet{margin:0;width:auto;min-height:0;padding:12mm 12mm 14mm}.footer{position:fixed}}`

export function buildFormHtml(d: DisclosureV2): string {
  const kv = (k: string, v: unknown) => `<div><small>${k}</small><b>${esc(v ?? '—')}</b></div>`
  const target = d.target_kind === 'vehicle'
    ? [kv('نوع الهدف', 'آلية'), kv('رقم DB', d.db_number), kv('السائق', d.driver_name), kv('نوع الآلية', d.vehicle_type), kv('المتعهد', d.contractor_name), kv('القاطع', d.sector), kv('سجل الموظف', d.employee_name ? `${d.employee_name} (${d.employee_number ?? ''})` : 'غير مرتبط — آلية مؤجّرة'), kv('العنوان الوظيفي', d.job_title), kv('الشفت', sh(d.shift))]
    : [kv('نوع الهدف', 'موظف'), kv('الاسم', d.employee_name), kv('الرقم الوظيفي', d.employee_number), kv('القسم', d.department_name), kv('العنوان الوظيفي', d.job_title), kv('الشفت', sh(d.shift))]
  const steps = (d.timeline ?? []).map((s) => `<div class="${s.status === 'approved' ? 'ok' : s.status === 'pending' ? 'wait' : s.status === 'rejected' ? 'rej' : ''}"><b>${s.step_no}. ${esc(s.label)}</b><small>${s.status === 'approved' ? `وافق: ${esc(s.decided_by ?? '')} · ${dt(s.decided_at)}` : s.status === 'pending' ? 'بانتظار القرار' : s.status === 'rejected' ? `أعاد: ${esc(s.decided_by ?? '')}` : 'لاحقاً'}</small></div>`).join('')
  const events = (d.events ?? []).map((e) => `<tr><td>${dt(e.at)}</td><td>${esc(e.actor_name ?? 'النظام')}</td><td>${esc(EVENT_LABEL[e.action] ?? e.action)}${e.amount != null ? ` · ${num(e.amount)} د.ع` : ''}</td><td>${esc(e.note ?? '')}</td></tr>`).join('')
  const decision = d.status === 'approved'
    ? `<div class="note g"><b>معتمد نهائياً</b> بواسطة ${esc(d.approved_by_name ?? '—')} · ${dt(d.approved_at)}${d.amount ? (d.deduction_posted ? ` — أُضيف استقطاع ${num(d.amount)} د.ع إلى حضورية الموظف لشهر ${d.deduction_month?.slice(0, 7) ?? ''}${d.deduction_note ? ` (${esc(d.deduction_note)})` : ''}` : ` — المبلغ مسجَّل فقط: ${esc(d.deduction_note ?? 'الهدف غير مرتبط بسجل موظف')}`) : ' — بدون مبلغ مالي'}</div>`
    : d.status === 'returned' ? `<div class="note r"><b>مُعاد للتصحيح</b> من ${esc(d.returned_by_name ?? '—')} · ${dt(d.returned_at)}<br>السبب: ${esc(d.return_reason ?? '')}</div>`
    : d.status === 'cancelled' ? `<div class="note r"><b>ملغى</b> بواسطة ${esc(d.cancelled_by_name ?? '—')} · ${dt(d.cancelled_at)}<br>السبب: ${esc(d.cancel_reason ?? '')}</div>`
    : d.status === 'pending' ? `<div class="note"><b>قيد الموافقة</b> — الخطوة الحالية: ${esc(d.current_step ?? '')}</div>` : `<div class="note">مسودة — لم يُرفع بعد</div>`
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>كشف ${esc(d.ref_no ?? '')}</title><style>${FORM_CSS}</style></head><body><main class="sheet">
<header class="head"><img src="${logoUrl()}" alt=""><div><h1>${COMPANY}</h1><div class="sub">غرفة العمليات — وحدة الكشوفات</div></div><div class="ref">رقم الكشف: <b>${esc(d.ref_no ?? '—')}</b><br>تاريخ المخالفة: ${d10(d.log_date)}<br>تاريخ الإنشاء: ${dt(d.created_at)}</div></header>
<h2 class="t">كشف ${esc(d.type_label)}</h2><div class="center"><span class="st" style="background:${STATUS_COLOR[d.status]}">${st(d.status)}</span></div>
<section class="sec"><h3>بيانات الهدف</h3><div class="kv">${target.join('')}</div></section>
<section class="sec"><h3>بيانات المخالفة</h3><div class="kv">${kv('نوع الكشف', d.type_label)}${kv('العقوبة المقترحة', pen(d.penalty_type))}${kv('تاريخ المخالفة', d10(d.log_date))}${kv('مُعدّ الكشف', d.prepared_by_name)}${kv('تاريخ الرفع', dt(d.submitted_at))}${kv('مرات إعادة الرفع', d.resubmit_count)}</div><div class="details">${esc(d.details)}</div></section>
<section class="sec"><h3>المبلغ والقرار</h3><div class="amount"><span class="big">${d.amount != null ? `${num(d.amount)} د.ع` : 'بدون مبلغ'}</span><div>${d.amount_by_name ? `حدّده: ${esc(d.amount_by_name)}<br>` : ''}${d.amount_note ? `ملاحظة: ${esc(d.amount_note)}<br>` : ''}شهر الاستقطاع: ${(d.deduction_month ?? d.period_month).slice(0, 7)}</div></div>${decision}</section>
${steps ? `<section class="sec"><h3>مسار الموافقة</h3><div class="steps">${steps}</div></section>` : ''}
${events ? `<section class="sec"><h3>سجل الأحداث</h3><table><thead><tr><th>الوقت</th><th>الفاعل</th><th>الحدث</th><th>ملاحظة</th></tr></thead><tbody>${events}</tbody></table></section>` : ''}
<section class="sign"><div><b>مُعدّ الكشف</b><small>${esc(d.prepared_by_name ?? '')}</small></div><div><b>معاون المدير المفوض</b><small>${esc((d.timeline ?? []).find((s) => s.step_no === 1)?.decided_by ?? '')}</small></div><div><b>المدير المفوض</b><small>${esc(d.approved_by_name ?? '')}</small></div></section>
<footer class="footer"><span>وثيقة إلكترونية صادرة من نظام ${COMPANY}</span><span>${esc(d.ref_no ?? '')} · طُبعت ${new Date().toLocaleString('ar-IQ')}</span></footer></main>
<script>addEventListener('load',()=>setTimeout(()=>print(),350))</script></body></html>`
}
export function printDisclosureForm(d: DisclosureV2): void { openWin(buildFormHtml(d), 860, 1000) }

/** CSV سريع (UTF-8 مع BOM) للصق في أي برنامج */
export function disclosuresToCsv(list: DisclosureV2[]): string {
  const cols = COLUMNS.filter((c) => c.key !== '#')
  const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '\ufeff' + [cols.map((c) => c.header).join(','), ...list.map((d, i) => { const r = rowOf(d, i); return cols.map((c) => cell(r[c.key])).join(',') })].join('\n')
}
export function downloadCsv(list: DisclosureV2[]): void {
  const blob = new Blob([disclosuresToCsv(list)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `كشوفات-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 4000)
}

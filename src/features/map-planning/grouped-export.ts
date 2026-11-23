/**
 * أعمدة التقرير المعتمد (ورقة الشركة) — تعريف واحد، ثلاثة استعمالات:
 *   ① الجدول على الشاشة  ② ملف Excel  ③ الطباعة
 *
 * الشكل المعتمد من الشركة (صورة 2026-11-19):
 *    ت | رقم الآلية | اسم السائق | المركز البلدي | رقم المحلة | الازقة | الملاحظات
 * وصفّ لكل (آلية × محلة)، والأزقة أرقام مفصولة بفاصلة، والملاحظات تحمل
 * الشوارع التي مرّت بها الآلية في تلك المحلة.
 *
 * الفرق عن `export-columns.ts` (التقرير المسطَّح): ذاك صفٌّ لكل **زيارة**،
 * وهذا صفٌّ لكل **محلة**. كلاهما مطلوب، ولا يُغني أحدهما عن الآخر.
 *
 * ⚠ المبدأ الحاكم: لا نُخفي مصدر الرقم. محلة الشارع مشتقّة (الشوارع لا تحمل
 *   محلة في القاعدة) — فتُوسَم «مشتقّة» بدل تمريرها كأنها مؤكدة.
 */
import type { GroupedVisitRow, MahallaSource } from '@sdk/map-planning.sdk'
import { MAHALLA_SOURCE_LABEL_AR } from '@sdk/map-planning.sdk'
import type { ReportColumn } from '@lib/export/excel-report'

/** سياق الترجمة — أسماء الزون والشفت من مصدر واحد */
export interface GroupedContext {
  zoneName: string
  shiftLabel: (s: string | null | undefined) => string
  /** تاريخ اليوم المعروض للطباعة */
  day: string
}

export interface GroupedColumnDef {
  id: string
  header: string
  value: (row: GroupedVisitRow, ctx: GroupedContext) => string | number | null
  width?: number
  align?: 'center' | 'left' | 'right'
  numFmt?: string
  wrap?: boolean
  /** يُدرج في صف الإجمالي */
  summable?: boolean
}

/** المكوث بصيغة مقروءة «7 د 30 ث» — مطابق لدالة التقرير المسطَّح */
export function groupedDwellText(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} د ${s % 60} ث` : `${s} ث`
}

/**
 * الملاحظات المعتمدة: الشوارع + وسم المصدر.
 * الورقة الأصلية تكتب «ادامة شارع كرادة داخل من ساحة كهرمانة الى تقاطع
 * الاوزري ساديين» — تفصيل بشري لا يوجد في GPS. ما نملكه هو **أسماء
 * الشوارع** التي مرّت بها الآلية فعلاً، وهو الأساس الذي يُكتب عليه.
 */
export function notesOf(row: GroupedVisitRow): string {
  const parts: string[] = []
  if (row.street_names) parts.push(`شوارع: ${row.street_names}`)
  if (row.mahalla_code && row.street_mahalla_source === 'derived') {
    parts.push('(محلة الشارع مشتقّة)')
  }
  return parts.join(' — ')
}

/** وسم المصدر: يظهر فقط حين تكون المحلة مشتقّة أو مجهولة */
export function sourceBadge(row: GroupedVisitRow): string | null {
  const src = row.street_mahalla_source as MahallaSource
  if (src === 'actual') return null
  return MAHALLA_SOURCE_LABEL_AR[src] ?? null
}

// ── الأعمدة: ١٣ عموداً بترتيب الورقة المعتمدة ─────────────────────────────
export const GROUPED_COLUMNS: readonly GroupedColumnDef[] = [
  {
    id: 'seq', header: 'ت', width: 5, align: 'center',
    // رقم متسلسل يُحسب عند التصدير، لا يُخزَّن
    value: () => null,
  },
  {
    id: 'db_number', header: 'رقم الآلية', width: 14, align: 'center',
    value: (r) => r.db_number,
  },
  {
    id: 'plate_number', header: 'اللوحة', width: 13, align: 'center',
    value: (r) => r.plate_number,
  },
  {
    id: 'driver_name', header: 'اسم السائق', width: 22,
    value: (r) => r.driver_name,
  },
  {
    id: 'zone_name', header: 'المركز البلدي', width: 16, align: 'center',
    value: (r, c) => r.zone_name ?? c.zoneName,
  },
  {
    id: 'mahalla_number', header: 'رقم المحلة', width: 12, align: 'center',
    value: (r) => r.mahalla_number,
  },
  {
    id: 'mahalla_source', header: 'مصدر المحلة', width: 13, align: 'center',
    value: (r) => sourceBadge(r),
  },
  {
    id: 'alleys', header: 'الازقة', width: 42, wrap: true,
    value: (r) => r.alley_week_or_num,
  },
  {
    id: 'alley_names', header: 'أسماء الأزقة', width: 44, wrap: true,
    value: (r) => r.alley_names,
  },
  {
    id: 'streets', header: 'الشوارع', width: 40, wrap: true,
    value: (r) => r.street_names,
  },
  {
    id: 'notes', header: 'الملاحظات', width: 40, wrap: true,
    value: (r) => notesOf(r),
  },
  {
    id: 'visits', header: 'الزيارات', width: 9, align: 'center', numFmt: '0', summable: true,
    value: (r) => r.visits_count,
  },
  {
    id: 'dwell', header: 'إجمالي المكوث', width: 14, align: 'center',
    value: (r) => groupedDwellText(r.total_dwell_seconds),
  },
  {
    id: 'shift', header: 'الشفت', width: 10, align: 'center',
    value: (r, c) => (r.shift ? c.shiftLabel(r.shift) : null),
  },
]

/** أعمدة Excel من تعريفاتنا — نفس للمعاينة والملف */
export function groupedReportColumns(
  ids: readonly string[] = GROUPED_COLUMNS.map((c) => c.id),
): ReportColumn[] {
  const byId = new Map(GROUPED_COLUMNS.map((c) => [c.id, c]))
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is GroupedColumnDef => Boolean(c))
    .map((c) => ({
      header: c.header,
      key: c.id,
      width: c.width,
      align: c.align,
      numFmt: c.numFmt,
      wrap: c.wrap,
    }))
}

/**
 * صفوف جاهزة للتصدير — مع رقم متسلسل حقيقي.
 * `seq` يُملأ هنا لا في التعريف (الدالة لا تعرف موقع الصف).
 */
export function toGroupedRows(
  rows: GroupedVisitRow[],
  ctx: GroupedContext,
  ids: readonly string[] = GROUPED_COLUMNS.map((c) => c.id),
): Record<string, unknown>[] {
  const byId = new Map(GROUPED_COLUMNS.map((c) => [c.id, c]))
  return rows.map((r, i) => {
    const out: Record<string, unknown> = {}
    for (const id of ids) {
      if (id === 'seq') { out.seq = i + 1; continue }
      const def = byId.get(id)
      if (def) out[id] = def.value(r, ctx)
    }
    return out
  })
}

/** صف الإجمالي: مجموع الزيارات وعدد الأزقة */
export function groupedTotalRow(rows: GroupedVisitRow[]): Record<string, unknown> | undefined {
  if (rows.length === 0) return undefined
  return {
    seq: null,
    db_number: 'الإجمالي',
    visits: rows.reduce((a, r) => a + r.visits_count, 0),
    dwell: groupedDwellText(rows.reduce((a, r) => a + r.total_dwell_seconds, 0)),
  }
}

/**
 * نصّ الترويسة المعتمد (السطور الثلاثة أعلى الجدول في الورقة الأصلية):
 *   أمانة بغداد / دائرة البلدية الكرادة
 *   شركة جزيرة الاكرام وفيرست تريد
 *   العمليات الادارية / وحدة الـ GPS
 */
export const GROUPED_HEADER = {
  company: 'شركة جزيرة الاكرام وفيرست تريد',
  companySub: 'العمليات الادارية / وحدة الـ GPS',
  org: 'أمانة بغداد — دائرة البلدية الكرادة',
} as const

/** عنوان التقرير المعتمد مع اليوم */
export function groupedTitle(day: string, zoneName?: string | null): string {
  const base = 'الازقة المزارة لاليات شركة جزيرة الاكرام'
  const zone = zoneName ? ` — ${zoneName}` : ''
  return `${base}${zone} — ${day}`
}

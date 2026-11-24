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
 * ⚠ قرار المستخدم (2026-11-19): **لا محلة للشوارع — لا اشتقاق ولا تخمين.**
 *   الشوارع لا تحمل `mahalla_id` في الخريطة، والقرار أن يبقى كذلك. فالصفوف
 *   نوعان: صف أزقة (محلة حقيقية من الجدول) وصف شوارع **بلا محلة**، يُعرض
 *   في الورقة تحتها بلا رقم محلة وبوسم صريح «بلا محلة» — لا رقم مخترع.
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

/** التاريخ بصيغة ISO نظيفة — الشاشة والملف يتشاركانها */
export function dayText(v: string | null | undefined): string | null {
  if (!v) return null
  return v.slice(0, 10)
}

/** وقت بغداد بصيغة 24 ساعة — لا نعرض UTC خاماً في ورقة عراقية */
export function baghdadTime(v: string | null | undefined): string | null {
  if (!v) return null
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad',
  }).format(new Date(v))
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
  // صف الشوارع: نقولها صراحةً بدل ترك الخانة فارغة تُقرأ كخطأ
  if (row.street_mahalla_source === 'street') {
    parts.push('(شارع بلا محلة — الشوارع لا تُنسب إلى محلة)')
  }
  return parts.join(' — ')
}

/** وسم المصدر: يظهر فقط للصفوف التي ليست محلةً مؤكدة */
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

  // ── المرحلة ⑥: الأعمدة الاثنا عشر الإضافية ────────────────────────────
  // موجودة في البيانات منذ البداية وكانت تُهمَل في العرض والتصدير. لا حقل
  // جديد في القاعدة — فقط كشف ما كان محجوباً. وترتيبها بعد أعمدة الورقة
  // كي لا يتغيّر شكل الورقة المعتمدة حين تُختار «أعمدة الورقة».
  {
    id: 'placeday', header: 'التاريخ', width: 12, align: 'center',
    value: (r) => dayText(r.placeday),
  },
  {
    id: 'vehicle_name', header: 'نوع الآلية', width: 16, align: 'center',
    value: (r) => r.vehicle_name,
  },
  {
    id: 'mahalla_code', header: 'رمز المحلة', width: 14, align: 'center',
    value: (r) => r.mahalla_code,
  },
  {
    id: 'mahalla_name', header: 'اسم المحلة', width: 18, align: 'center',
    value: (r) => r.mahalla_name,
  },
  {
    id: 'alleys_count', header: 'عدد الأزقة', width: 10, align: 'center', numFmt: '0', summable: true,
    value: (r) => r.alleys_count,
  },
  {
    id: 'streets_count', header: 'عدد الشوارع', width: 11, align: 'center', numFmt: '0', summable: true,
    value: (r) => r.streets_count,
  },
  {
    id: 'confirmed_count', header: 'مؤكدة', width: 9, align: 'center', numFmt: '0', summable: true,
    value: (r) => r.confirmed_count,
  },
  {
    id: 'uncertain_count', header: 'غير مؤكدة', width: 10, align: 'center', numFmt: '0', summable: true,
    value: (r) => r.uncertain_count,
  },
  {
    id: 'first_entered', header: 'أول دخول', width: 10, align: 'center',
    value: (r) => baghdadTime(r.first_entered_at),
  },
  {
    id: 'last_exited', header: 'آخر خروج', width: 10, align: 'center',
    value: (r) => baghdadTime(r.last_exited_at),
  },
  {
    id: 'avg_dwell', header: 'متوسط المكوث', width: 12, align: 'center',
    value: (r) => groupedDwellText(r.avg_dwell_seconds),
  },
  {
    id: 'max_depth', header: 'أقصى عمق (م)', width: 12, align: 'center', numFmt: '0',
    value: (r) => r.max_depth_m,
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
  // كل عمود عليه `summable: true` يُجمع هنا آلياً — لا قائمة يدوية تُنسى
  const out: Record<string, unknown> = { seq: null, db_number: 'الإجمالي' }
  for (const col of GROUPED_COLUMNS) {
    if (!col.summable) continue
    out[col.id] = rows.reduce((a, r) => {
      const v = col.value(r, { zoneName: '', shiftLabel: () => '', day: '' })
      return a + (typeof v === 'number' ? v : 0)
    }, 0)
  }
  out.dwell = groupedDwellText(rows.reduce((a, r) => a + r.total_dwell_seconds, 0))
  return out
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

/**
 * عنوان التقرير المعتمد مع اليوم.
 *
 * ⚠ نسختان بقصد:
 *  · `groupedTitle`         — للشاشة والطباعة الورقية: تحمل اسم الشركة (كما في
 *    الورقة الأصلية التي اعتادتها غرفة العمليات).
 *  · `groupedTitleNeutral`  — **للملفات** (Excel والأرشيف): بلا اسم شركة.
 *    طلب صاحب المشروع: «نص الشركة داخل الملف غير احترافي — احذفه». ولأن
 *    عنوان الورقة يُكتب داخل الملف أيضاً، تنظيف الترويسة وحده لا يكفي.
 */
export function groupedTitle(day: string, zoneName?: string | null): string {
  const base = 'الازقة المزارة لاليات شركة جزيرة الاكرام'
  const zone = zoneName ? ` — ${zoneName}` : ''
  return `${base}${zone} — ${day}`
}

/** عنوان الملف المحايد: نفس المعلومة بلا أي اسم مؤسسة */
export function groupedTitleNeutral(day: string, zoneName?: string | null): string {
  const zone = zoneName ? `${zoneName} — ` : ''
  return `الأزقة المزارة — ${zone}${day}`
}

/**
 * اسم ورقة الملف المحايد.
 *
 * «ورقة الشركة» اسم داخلي يصف النوع، لكنه يظهر في تبويب Excel وفي اسم
 * الملف المُسلَّم. في الملفات الرسمية يُستبدل بـ«التقرير المعتمد».
 */
export function groupedSheetName(label: string): string {
  return label === 'ورقة الشركة' ? 'التقرير المعتمد' : label
}

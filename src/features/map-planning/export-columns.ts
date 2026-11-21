/**
 * أعمدة تقرير التخطيط — تعريف واحد، ثلاث استعمالات:
 *   ① معاينة على الشاشة  ② ملف Excel  ③ الطباعة
 *
 * المبدأ: العمود يُعرَّف مرة واحدة بـ`key` + `header` + دالة `value`
 * + إعدادات العرض. لا تكرار للترويسة في كل مكان، ولا انحراف بين ما تراه
 * على الشاشة وما تجده في الملف.
 *
 * الترتيب والاختيار **بيانات** لا كود: تُحفظ كـ(id, visible, order) في
 * القاعدة لكل مستخدم، فتُستعاد كما تركها.
 */
import type { ReportColumn } from '@lib/export/excel-report'

export type ExportKind = 'places' | 'visits'

/** سياق تُبنى منه القيم — الصف ومعه ما يحتاج ترجمة */
export interface ColumnContext {
  /** اسم الزون ليُكتب في ملف مُرسَل لجهة خارجية */
  zoneName: string
  /** تسمية الشفت من SHIFT_LABEL_AR */
  shiftLabel: (s: string | null | undefined) => string
}

export interface ExportColumnDef {
  /** ثابت لا يتغيّر — يُحفظ في القاعدة */
  id: string
  /** الترويسة العربية في الشاشة والملف والطباعة */
  header: string
  kind: ExportKind
  /** القيمة الخام للتصدير (رقم/نص/تاريخ) */
  value: (row: Row, ctx: ColumnContext) => string | number | null | undefined
  width?: number
  align?: 'center' | 'left' | 'right'
  numFmt?: string
  wrap?: boolean
  /** يُدرج في ورقة الملخص كرقم يُجمع */
  summable?: boolean
}

/** صف موحّد: حقول التخطيط + حقول الزيارة (أيٌّ منها قد يكون غائباً) */
export interface Row {
  place_kind: 'street' | 'alley'
  place_code: string
  place_name: string | null
  mahalla_code: string | null
  length_m: number | null
  width_m: number | null
  status_ar?: string | null
  visited?: boolean
  confirmed?: boolean
  visits_count?: number
  vehicles_count?: number
  total_dwell_seconds?: number
  first_entered_at?: string | null
  last_exited_at?: string | null
  vehicle_name?: string | null
  driver_name?: string | null
  shift?: string | null
  entered_at?: string | null
  exited_at?: string | null
  dwell_seconds?: number | null
  visit_status?: 'confirmed' | 'uncertain' | 'not_entered' | null
  reason?: string | null
}

/** الوقت بتوقيت بغداد بصيغة HH:MM — أرقام لاتينية (عقد المنصة) */
export function baghdadTime(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad',
  }).format(d)
}

/** اليوم البغدادي لطابع زمني */
export function baghdadDay(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(d)
}

/** المكوث بصيغة مقروءة «7 د 30 ث» */
export function dwellText(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} د ${s % 60} ث` : `${s} ث`
}

export const VISIT_STATE_AR = {
  confirmed: 'مؤكد',
  uncertain: 'غير مؤكد',
  not_entered: 'لم تُدخل',
} as const

const KIND_AR = { street: 'شارع', alley: 'زقاق' } as const

// ── الأعمدة: ١١ عموداً بترتيب افتراضي معلن (قابل للتعديل والحفظ) ──────────
export const EXPORT_COLUMNS: readonly ExportColumnDef[] = [
  {
    id: 'place_kind', header: 'النوع', kind: 'places', width: 9, align: 'center',
    value: (r) => KIND_AR[r.place_kind],
  },
  {
    id: 'place_code', header: 'الكود', kind: 'places', width: 12, align: 'center',
    value: (r) => r.place_code,
  },
  {
    id: 'place_name', header: 'الاسم', kind: 'places', width: 28, wrap: true,
    value: (r) => r.place_name,
  },
  {
    id: 'mahalla_code', header: 'المحلة', kind: 'places', width: 12, align: 'center',
    value: (r) => r.mahalla_code,
  },
  {
    id: 'length_m', header: 'الطول (م)', kind: 'places', width: 11, align: 'center', numFmt: '0.0', summable: true,
    value: (r) => r.length_m,
  },
  {
    id: 'width_m', header: 'العرض (م)', kind: 'places', width: 11, align: 'center', numFmt: '0.0',
    value: (r) => r.width_m,
  },
  {
    id: 'coverage_state', header: 'حالة التغطية', kind: 'places', width: 14, align: 'center',
    value: (r) => (r.confirmed ? VISIT_STATE_AR.confirmed : r.visited ? VISIT_STATE_AR.uncertain : VISIT_STATE_AR.not_entered),
  },
  {
    id: 'visits_count', header: 'عدد الزيارات', kind: 'places', width: 12, align: 'center', numFmt: '0', summable: true,
    value: (r) => r.visits_count ?? 0,
  },
  {
    id: 'vehicles_count', header: 'الآليات', kind: 'places', width: 10, align: 'center', numFmt: '0',
    value: (r) => r.vehicles_count ?? 0,
  },
  {
    id: 'total_dwell', header: 'إجمالي المكوث', kind: 'places', width: 16, align: 'center',
    value: (r) => dwellText(r.total_dwell_seconds),
  },
  {
    id: 'last_visit', header: 'آخر زيارة (بغداد)', kind: 'places', width: 20, align: 'center',
    value: (r) => {
      const t = baghdadTime(r.last_exited_at ?? r.first_entered_at)
      return t ? `${baghdadDay(r.first_entered_at) ?? ''} ${t}`.trim() : null
    },
  },

  // ── أعمدة سجل الزيارات (لتصدير كل زيارة صفاً) ─────────────────────────────
  {
    id: 'v_day', header: 'اليوم', kind: 'visits', width: 12, align: 'center',
    value: (r) => baghdadDay(r.entered_at),
  },
  {
    id: 'v_place', header: 'المكان', kind: 'visits', width: 30, wrap: true,
    value: (r) => `${r.place_code}${r.place_name ? ' — ' + r.place_name : ''}`,
  },
  {
    id: 'v_vehicle', header: 'الآلية', kind: 'visits', width: 20,
    value: (r) => r.vehicle_name,
  },
  {
    id: 'v_driver', header: 'السائق', kind: 'visits', width: 20,
    value: (r) => r.driver_name,
  },
  {
    id: 'v_shift', header: 'الشفت', kind: 'visits', width: 10, align: 'center',
    value: (r, c) => (r.shift ? c.shiftLabel(r.shift) : null),
  },
  {
    id: 'v_enter', header: 'الدخول (بغداد)', kind: 'visits', width: 12, align: 'center',
    value: (r) => baghdadTime(r.entered_at),
  },
  {
    id: 'v_exit', header: 'الخروج (بغداد)', kind: 'visits', width: 12, align: 'center',
    value: (r) => baghdadTime(r.exited_at),
  },
  {
    id: 'v_dwell', header: 'المكوث', kind: 'visits', width: 14, align: 'center',
    value: (r) => dwellText(r.dwell_seconds),
  },
  {
    id: 'v_status', header: 'الحالة', kind: 'visits', width: 12, align: 'center',
    value: (r) => (r.visit_status ? VISIT_STATE_AR[r.visit_status] : null),
  },
  {
    id: 'v_reason', header: 'سبب عدم التأكيد', kind: 'visits', width: 34, wrap: true,
    value: (r) => r.reason,
  },
]

/** أعمدة الصنف مرتّبة بالترتيب المطلوب */
export function columnsFor(kind: ExportKind): ExportColumnDef[] {
  return EXPORT_COLUMNS.filter((c) => c.kind === kind)
}

/** الافتراضي = كل الأعمدة بالترتيب المعلن */
export function defaultSelection(kind: ExportKind): ColumnSelection[] {
  return columnsFor(kind).map((c, i) => ({ id: c.id, visible: true, order: i }))
}

export interface ColumnSelection {
  id: string
  visible: boolean
  order: number
}

/**
 * المحدَّد فعلياً بالترتيب: نتجاهل المعرّفات المجهولة (عمود أُزيل من الكود
 * وبقي في تفضيل محفوظ) — لا انفجار، ولا عمود شبح بترويسة فارغة.
 */
export function resolveColumns(kind: ExportKind, selection: ColumnSelection[] | null | undefined): ExportColumnDef[] {
  const known = new Map(columnsFor(kind).map((c) => [c.id, c]))
  const src = selection && selection.length > 0 ? selection : defaultSelection(kind)
  const out: ExportColumnDef[] = []
  const seen = new Set<string>()
  for (const s of [...src].sort((a, b) => a.order - b.order)) {
    const def = known.get(s.id)
    if (!def || !s.visible || seen.has(s.id)) continue
    seen.add(s.id)
    out.push(def)
  }
  return out
}

/** إعادة الترتيب: نقل عمود من موضع إلى آخر (أرقام order تُعاد من ٠) */
export function moveColumn(selection: ColumnSelection[], id: string, toIndex: number): ColumnSelection[] {
  const sorted = [...selection].sort((a, b) => a.order - b.order)
  const from = sorted.findIndex((s) => s.id === id)
  if (from === -1) return selection
  const [moved] = sorted.splice(from, 1)
  if (!moved) return selection
  const target = Math.max(0, Math.min(toIndex, sorted.length))
  sorted.splice(target, 0, moved)
  return sorted.map((s, i) => ({ ...s, order: i }))
}

export function toggleColumn(selection: ColumnSelection[], id: string): ColumnSelection[] {
  const has = selection.some((s) => s.id === id)
  if (!has) {
    return [...selection, { id, visible: true, order: selection.length }]
  }
  // لا نسمح بإخفاء **الكل**: ملف بلا أعمدة ليس تقريراً
  const next: ColumnSelection[] = selection.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
  if (next.every((s) => !s.visible)) return selection
  return next
}

/** صفوف جاهزة للتصدير: key العمود ← قيمته المُنسَّقة */
export function toReportRows(rows: Row[], cols: ExportColumnDef[], ctx: ColumnContext): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const c of cols) out[c.id] = c.value(r, ctx)
    return out
  })
}

/** أعمدة Excel من تعريفاتنا */
export function toReportColumns(cols: ExportColumnDef[]): ReportColumn[] {
  return cols.map((c) => ({
    header: c.header,
    key: c.id,
    width: c.width,
    align: c.align,
    numFmt: c.numFmt,
    wrap: c.wrap,
  }))
}

/** صف إجمالي للأعمدة التي تُجمع (الطول · عدد الزيارات) */
export function totalRow(rows: Row[], cols: ExportColumnDef[], ctx: ColumnContext): Record<string, unknown> | undefined {
  const sums: Record<string, unknown> = {}
  let any = false
  for (const c of cols) {
    if (!c.summable) continue
    const total = rows.reduce((acc, r) => {
      const v = c.value(r, ctx)
      return acc + (typeof v === 'number' ? v : 0)
    }, 0)
    sums[c.id] = total
    any = true
  }
  return any ? sums : undefined
}

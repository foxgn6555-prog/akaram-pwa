/**
 * أنواع تصدير التقرير المعتمد — تعريف واحد، استعمالات متعددة.
 *
 * طلب المستخدم: «خيارات تصدير كثيرة عبر Excel». الإجابة ليست زراً واحداً
 * بإعدادات مخفية، بل **أنواع مسمّاة**: كل نوع ورقة جاهزة لاستخدام مختلف.
 *
 * المبدأ الحاكم: كل نوع يُبنى من **نفس الصفوف** التي على الشاشة. لا مسار
 * حساب ثانٍ في التصدير — وإلا اختلف ما يُطبع عمّا يُرى، وهو أسوأ عيب في
 * تقرير رسمي.
 *
 * ولذلك: أي نوع لا بيانات له (مثلاً «الأزقة غير المزارة» بلا فجوات) يُعطّل
 * بدل أن يُصدِّر ورقة فارغة تُوهم القارئ.
 */
import type { GroupedVisitRow } from '@sdk/map-planning.sdk'
import type { ChartSheet, ExtraDataSheet, ReportColumn } from '@lib/export/excel-report'

/** هوية سياق التقرير المشترك بين الأنواع */
export interface ExportContext {
  zoneName: string
  day: string
  /** عدد الفلاتر المطبَّقة — يُذكر في الترويسة ليعرف القارئ أن الورقة مفلترة */
  filterCount: number
}

export type ExportKindId =
  | 'sheet'        // ورقة الشركة (المعتمدة)
  | 'alley'        // الأزقة أرقاماً فقط — للنسخ إلى ورقة أخرى
  | 'street'       // الشوارع بلا محلة
  | 'driver'       // ملخّص لكل سائق
  | 'vehicle'      // ملخّص لكل آلية
  | 'mahalla'      // ملخّص لكل محلة
  | 'uncertain'    // الزيارات غير المؤكدة — للمراجعة الميدانية
  | 'full'         // كل الأعمدة الـ٢٦ — للتدقيق

export interface ExportKind {
  id: ExportKindId
  label: string
  hint: string
  /** عدد الأسطر المتوقّع — صفر يعني لا بيانات ⇒ تعطيل الزر */
  count: (rows: GroupedVisitRow[]) => number
}

// ── أدوات صغيرة مشتركة ────────────────────────────────────────────────────
const dwellText = (s: number): string => {
  const m = Math.round(s / 60)
  return m > 0 ? `${m} د` : `${s} ث`
}

const sum = (a: number, b: number) => a + b

/** ملخّص عام يُستخدم في الأنواع الأربعة الملخّصية */
interface Summary {
  key: string
  label: string
  vehicles: number
  rows: number
  alleys: number
  streets: number
  visits: number
  confirmed: number
  uncertain: number
  dwellSeconds: number
  days: number
}

const emptySummary = (key: string, label: string): Summary => ({
  key, label, vehicles: 0, rows: 0, alleys: 0, streets: 0,
  visits: 0, confirmed: 0, uncertain: 0, dwellSeconds: 0, days: 0,
})

const acc = (m: Summary, r: GroupedVisitRow): Summary => ({
  ...m,
  rows: m.rows + 1,
  alleys: m.alleys + r.alleys_count,
  streets: m.streets + r.streets_count,
  visits: m.visits + r.visits_count,
  confirmed: m.confirmed + r.confirmed_count,
  uncertain: m.uncertain + r.uncertain_count,
  dwellSeconds: m.dwellSeconds + r.total_dwell_seconds,
})

const vehiclesOf = (rows: GroupedVisitRow[]): Set<string> =>
  new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => Boolean(v)))

const daysOf = (rows: GroupedVisitRow[]): number =>
  new Set(rows.map((r) => r.placeday)).size

/**
 * التجميع الملخّصي — دالة واحدة، ثلاثة مفاتيح.
 * لماذا دالة واحدة؟ لأن أي فرق سلوكي بين «ملخّص السائق» و«ملخّص الآلية»
 * سيكون عيباً لا ميزة: الأرقام يجب أن تتطابق لو جمعت أحدهما.
 */
function summarize(
  rows: GroupedVisitRow[],
  keyOf: (r: GroupedVisitRow) => string | null,
  fallback: string,
): Summary[] {
  const map = new Map<string, Summary>()
  for (const r of rows) {
    const k = keyOf(r) ?? fallback
    const cur = map.get(k) ?? emptySummary(k, k)
    map.set(k, acc(cur, r))
  }
  const out: Summary[] = []
  for (const s of map.values()) {
    const rs = rows.filter((r) => (keyOf(r) ?? fallback) === s.key)
    out.push({ ...s, vehicles: vehiclesOf(rs).size, days: daysOf(rs) })
  }
  return out.sort((a, b) => b.visits - a.visits || a.key.localeCompare(b.key, 'ar'))
}

// ── أعمدة الملخّص (مشتركة) ────────────────────────────────────────────────
const SUMMARY_COLUMNS: ReportColumn[] = [
  { header: 'الاسم', key: 'label', width: 28, align: 'right' },
  { header: 'الآليات', key: 'vehicles', width: 9, align: 'center' },
  { header: 'الأيام', key: 'days', width: 8, align: 'center' },
  { header: 'الصفوف', key: 'rows', width: 8, align: 'center' },
  { header: 'الأزقة', key: 'alleys', width: 9, align: 'center' },
  { header: 'الشوارع', key: 'streets', width: 9, align: 'center' },
  { header: 'الزيارات', key: 'visits', width: 10, align: 'center' },
  { header: 'مؤكدة', key: 'confirmed', width: 9, align: 'center' },
  { header: 'غير مؤكدة', key: 'uncertain', width: 10, align: 'center' },
  { header: 'المكوث', key: 'dwell', width: 10, align: 'center' },
]

const toSummaryRows = (list: Summary[]): Record<string, unknown>[] =>
  list.map((s) => ({ ...s, dwell: dwellText(s.dwellSeconds) }))

const summaryTotal = (list: Summary[]): Record<string, unknown> => ({
  label: 'الإجمالي',
  vehicles: list.reduce((a, s) => a + s.vehicles, 0),
  days: list.reduce((a, s) => a + s.days, 0),
  rows: list.reduce((a, s) => a + s.rows, 0),
  alleys: list.reduce((a, s) => a + s.alleys, 0),
  streets: list.reduce((a, s) => a + s.streets, 0),
  visits: list.reduce((a, s) => a + s.visits, 0),
  confirmed: list.reduce((a, s) => a + s.confirmed, 0),
  uncertain: list.reduce((a, s) => a + s.uncertain, 0),
  dwell: '',
})

// ── الأنواع الثمانية ──────────────────────────────────────────────────────
export const EXPORT_KINDS: readonly ExportKind[] = [
  {
    id: 'sheet',
    label: 'ورقة الشركة',
    hint: 'المعتمدة: ت · الآلية · السائق · المركز · المحلة · الأزقة · الملاحظات',
    count: (rows) => rows.length,
  },
  {
    id: 'alley',
    label: 'الأزقة (أرقام فقط)',
    hint: 'أرقام الأزقة مرتّبة — للنسخ إلى ورقة أخرى أو لرسالة واتساب',
    count: (rows) => rows.filter((r) => r.alleys_count > 0).length,
  },
  {
    id: 'street',
    label: 'الشوارع (بلا محلة)',
    hint: 'الشوارع التي مرّت بها الآليات — لا تُنسب إلى محلة',
    count: (rows) => rows.filter((r) => r.streets_count > 0).length,
  },
  {
    id: 'driver',
    label: 'ملخّص السائقين',
    hint: 'لكل سائق: آليات · أيام · أزقة · زيارات · مكوث',
    count: (rows) => summarize(rows, (r) => r.driver_name, '—').length,
  },
  {
    id: 'vehicle',
    label: 'ملخّص الآليات',
    hint: 'لكل آلية: أيام عمل · أزقة · شوارع · زيارات · مكوث',
    count: (rows) => summarize(rows, (r) => r.db_number, '—').length,
  },
  {
    id: 'mahalla',
    label: 'ملخّص المحلات',
    hint: 'لكل محلة: كم آلية عملت فيها وكم زقاقاً وزيارة',
    count: (rows) => summarize(rows.filter((r) => r.mahalla_number), (r) => r.mahalla_number, '—').length,
  },
  {
    id: 'uncertain',
    label: 'غير المؤكد (للمراجعة)',
    hint: 'الزيارات التي لم تُؤكَّد — لمراجعتها ميدانياً قبل اعتماد الورقة',
    count: (rows) => rows.filter((r) => r.uncertain_count > 0).length,
  },
  {
    id: 'full',
    label: 'كل الأعمدة (٢٦)',
    hint: 'للتدقيق: كل حقل خام بما فيه الأوقات وعمق الدخول',
    count: (rows) => rows.length,
  },
]

export const exportKind = (id: ExportKindId): ExportKind =>
  EXPORT_KINDS.find((k) => k.id === id) ?? EXPORT_KINDS[0]!

// ── بناء ورقة «ملخّص» ──────────────────────────────────────────────────────
export interface SummarySheet {
  sheetName: string
  title: string
  columns: ReportColumn[]
  rows: Record<string, unknown>[]
  totalRow: Record<string, unknown>
  count: number
}

/** ملخّص بمفتاح: driver | vehicle | mahalla */
export function buildSummarySheet(
  kind: 'driver' | 'vehicle' | 'mahalla',
  rows: GroupedVisitRow[],
  ctx: ExportContext,
): SummarySheet {
  const keyOf =
    kind === 'driver' ? (r: GroupedVisitRow) => r.driver_name
      : kind === 'vehicle' ? (r: GroupedVisitRow) => r.db_number
        : (r: GroupedVisitRow) => r.mahalla_number
  const src = kind === 'mahalla' ? rows.filter((r) => r.mahalla_number) : rows
  const list = summarize(src, keyOf, '—')
  const titleOf =
    kind === 'driver' ? 'ملخّص السائقين'
      : kind === 'vehicle' ? 'ملخّص الآليات' : 'ملخّص المحلات'
  return {
    sheetName: titleOf,
    title: `${titleOf} — ${ctx.zoneName} — ${ctx.day}`,
    columns: SUMMARY_COLUMNS,
    rows: toSummaryRows(list),
    totalRow: summaryTotal(list),
    count: list.length,
  }
}

// ── ورقة «غير المؤكد» ─────────────────────────────────────────────────────
export const UNCERTAIN_COLUMNS: ReportColumn[] = [
  { header: 'ت', key: 'seq', width: 5, align: 'center' },
  { header: 'التاريخ', key: 'placeday', width: 12, align: 'center' },
  { header: 'رقم الآلية', key: 'db_number', width: 13, align: 'center' },
  { header: 'السائق', key: 'driver_name', width: 24, align: 'right' },
  { header: 'المحلة', key: 'mahalla', width: 10, align: 'center' },
  { header: 'نوع المكان', key: 'kind', width: 11, align: 'center' },
  { header: 'الأزقة/الشوارع', key: 'places', width: 40, align: 'right', wrap: true },
  { header: 'الزيارات', key: 'visits_count', width: 9, align: 'center' },
  { header: 'غير مؤكدة', key: 'uncertain_count', width: 10, align: 'center' },
  { header: 'المكوث', key: 'dwell', width: 10, align: 'center' },
]

export function uncertainRows(rows: GroupedVisitRow[]): Record<string, unknown>[] {
  return rows
    .filter((r) => r.uncertain_count > 0)
    .map((r, i) => ({
      seq: i + 1,
      placeday: r.placeday,
      db_number: r.db_number ?? '—',
      driver_name: r.driver_name ?? '—',
      mahalla: r.mahalla_number ?? '—',
      kind: r.street_mahalla_source === 'street' ? 'شارع' : 'زقاق',
      places: r.alley_week_or_num ?? r.street_names ?? '—',
      visits_count: r.visits_count,
      uncertain_count: r.uncertain_count,
      dwell: dwellText(r.total_dwell_seconds),
    }))
}

// ── ورقة «الأزقة أرقاماً» ─────────────────────────────────────────────────
export const ALLEYS_ONLY_COLUMNS: ReportColumn[] = [
  { header: 'ت', key: 'seq', width: 5, align: 'center' },
  { header: 'التاريخ', key: 'placeday', width: 12, align: 'center' },
  { header: 'رقم الآلية', key: 'db_number', width: 13, align: 'center' },
  { header: 'السائق', key: 'driver_name', width: 24, align: 'right' },
  { header: 'رقم المحلة', key: 'mahalla_number', width: 11, align: 'center' },
  { header: 'عدد الأزقة', key: 'alleys_count', width: 10, align: 'center' },
  { header: 'أرقام الأزقة', key: 'alleys', width: 56, align: 'right', wrap: true },
]

export function alleysOnlyRows(rows: GroupedVisitRow[]): Record<string, unknown>[] {
  return rows
    .filter((r) => r.alleys_count > 0)
    .map((r, i) => ({
      seq: i + 1,
      placeday: r.placeday,
      db_number: r.db_number ?? '—',
      driver_name: r.driver_name ?? '—',
      mahalla_number: r.mahalla_number ?? '—',
      alleys_count: r.alleys_count,
      alleys: r.alley_week_or_num ?? '—',
    }))
}

// ── ورقة «الشوارع» ───────────────────────────────────────────────────────
export const STREETS_ONLY_COLUMNS: ReportColumn[] = [
  { header: 'ت', key: 'seq', width: 5, align: 'center' },
  { header: 'التاريخ', key: 'placeday', width: 12, align: 'center' },
  { header: 'رقم الآلية', key: 'db_number', width: 13, align: 'center' },
  { header: 'السائق', key: 'driver_name', width: 24, align: 'right' },
  { header: 'عدد الشوارع', key: 'streets_count', width: 11, align: 'center' },
  { header: 'الشوارع', key: 'streets', width: 60, align: 'right', wrap: true },
  { header: 'الزيارات', key: 'visits_count', width: 9, align: 'center' },
]

export function streetsOnlyRows(rows: GroupedVisitRow[]): Record<string, unknown>[] {
  return rows
    .filter((r) => r.streets_count > 0)
    .map((r, i) => ({
      seq: i + 1,
      placeday: r.placeday,
      db_number: r.db_number ?? '—',
      driver_name: r.driver_name ?? '—',
      streets_count: r.streets_count,
      streets: r.street_names ?? '—',
      visits_count: r.visits_count,
    }))
}

// ── الرسم البياني: أعلى الآليات بالزيارات ─────────────────────────────────
/**
 * رسم واحد فقط، وبعنوان صريح. المستخدم طلب ورقة Excel لا لوحة تحليلات؛
 * رسمٌ يساعد على قراءة الأرقام مقبول، ولوحة كاملة ليست المطلوب.
 */
export function visitsChart(rows: GroupedVisitRow[], limit = 10): ChartSheet | null {
  const list = summarize(rows, (r) => r.db_number, '—')
    .slice(0, limit)
    .filter((s) => s.visits > 0)
  if (list.length === 0) return null
  return {
    title: 'أعلى الآليات بعدد الزيارات',
    kind: 'bar',
    valueLabel: 'زيارة',
    data: list.map((s) => ({ label: s.label, value: s.visits })),
  }
}

// ── تجميع كل شيء في خيارات `buildExcelReport` ─────────────────────────────
export interface ExtraSheetPlan {
  extraSheets: ExtraDataSheet[]
  charts: ChartSheet[]
}

/**
 * الأوراق الإضافية لكل نوع: الورقة الرئيسية تُبنى في الصفحة (لها أعمدة
 * ديناميكية وتذييل خاص)، وهذه تُلحق بها. لا نُكرّر الورقة الرئيسية هنا.
 */
export function extraSheetsFor(
  id: ExportKindId,
  rows: GroupedVisitRow[],
  ctx: ExportContext,
): ExtraSheetPlan {
  if (id === 'driver' || id === 'vehicle' || id === 'mahalla') {
    const s = buildSummarySheet(id, rows, ctx)
    return {
      extraSheets: [{
        sheetName: s.sheetName, title: s.title, columns: s.columns,
        rows: s.rows, totalRow: s.totalRow,
      }],
      charts: id === 'vehicle' ? ([visitsChart(rows)].filter(Boolean) as ChartSheet[]) : [],
    }
  }
  if (id === 'uncertain') {
    return {
      extraSheets: [{
        sheetName: 'غير المؤكد',
        title: `زيارات غير مؤكدة — ${ctx.zoneName} — ${ctx.day}`,
        columns: UNCERTAIN_COLUMNS,
        rows: uncertainRows(rows),
      }],
      charts: [],
    }
  }
  return { extraSheets: [], charts: [] }
}

/** إجمالي الأزقة/الزيارات لنوع الأزقة — يُستخدم في سطر meta */
export const alleyOnlyTotal = (rows: GroupedVisitRow[]): number =>
  rows.filter((r) => r.alleys_count > 0).reduce((a, r) => a + r.alleys_count, 0)

export const total = sum

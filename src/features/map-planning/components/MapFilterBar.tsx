/**
 * شريط المرشّحات الموحّد لصفحات التخطيط الجغرافي.
 *
 * ## المشكلة
 * الصفحات الخمس كانت تبني شريطها بنفسها، فاختلفت في كل شيء:
 *
 *     الزون      أزرار في ٣ صفحات · قائمة منسدلة في ١ · لا مرشّح زون في ١
 *     اليوم      `input type=date` في ٢ · مدى تاريخين في ١ · لا يوم في ١
 *     العدد      يظهر بعد الجدول في بعضها ولا يظهر في أخرى
 *     المسح      غير موجود إطلاقاً
 *
 * فمن ينتقل من «التغطية» إلى «زيارات الألية» يجد المرشّح في مكان آخر وبشكل
 * آخر، ولا يستطيع أن ينقل اختياره. والرابط لا يحمل أي مرشّح فلا يُشارَك.
 *
 * ## القرارات
 * ① **العدد على كل مرشّح** — «الكراج ٤٢» أفضل من اختياره ثم العدّ في الجدول.
 *    والعدد يُحسب على البيانات **بعد** تطبيق بقية المرشّحات، فمن اختار شفتاً
 *    يرى كم زيارة في كل زون ضمن ذلك الشفت.
 * ② **«مسح الكل» يظهر فقط حين يوجد ما يُمسح** — زرّ دائم معطّل يُشعر بأن
 *    شيئاً مفقود.
 * ③ **العدد الكلي صريح دائماً** — «١٢ من ٤٢٠» لا «١٢» وحدها: الرقم بلا
 *    مقام يخفي أن المرشّح حجب ٤٠٨.
 * ④ **التسميات ثابتة** (`aria-label` + `data-testid`) لأن الاختبارات والدعم
 *    يعتمدان عليها، وتغيير التسمية المرئية لا يكسر أحدهما.
 */
import type { ReactNode } from 'react'
import { RotateCcw, Search } from 'lucide-react'

export type ZoneChip = {
  id: string
  name: string
  /** عدد النتائج في هذا الزون بعد تطبيق بقية المرشّحات */
  count?: number
}

type Props = {
  /** مرشّح الزون — يُخفى إن كانت الصفحة بلا زونات */
  zones?: readonly ZoneChip[]
  activeZoneId?: string | null
  onPickZone?: (id: string) => void
  /** رجوع إلى «كل الزونات» — يظهر فقط حين يوجد اختيار فعلي */
  onClearZone?: () => void

  /** يوم بغداد — `type=date` موحّد */
  day?: string
  onDayChange?: (day: string) => void

  /** بحث نصّي حرّ */
  query?: string
  onQueryChange?: (q: string) => void
  queryPlaceholder?: string

  /** العدد المعروض من الإجمالي */
  shown?: number
  total?: number
  /** تسمية ما يُعدّ: «زيارة» · «مكان» · «صفّ» */
  unitLabel?: string

  /** هل هناك مرشّح فعّال؟ يتحكّم بظهور «مسح الكل» */
  dirty?: boolean
  onClearAll?: () => void

  /** مرشّحات إضافية خاصة بالصفحة تُعرض في السطر نفسه */
  extra?: ReactNode
}

export function MapFilterBar({
  zones,
  activeZoneId,
  onPickZone,
  onClearZone,
  day,
  onDayChange,
  query,
  onQueryChange,
  queryPlaceholder = 'ابحث…',
  shown,
  total,
  unitLabel = 'صف',
  dirty = false,
  onClearAll,
  extra,
}: Props) {
  const hasZones = !!zones?.length && onPickZone
  const hasDay = day !== undefined && !!onDayChange
  const hasQuery = query !== undefined && !!onQueryChange

  return (
    <section
      data-testid="map-filter-bar"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3"
    >
      {hasZones && (
        <>
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              data-testid="filter-zone"
              onClick={() => onPickZone(z.id)}
              aria-pressed={z.id === activeZoneId}
              aria-label={`تصفية على ${z.name}`}
              className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                z.id === activeZoneId
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {z.name}
              {typeof z.count === 'number' && (
                <span
                  data-testid="filter-zone-count"
                  className={`ms-1.5 rounded-md px-1.5 py-0.5 text-[10px] ${
                    z.id === activeZoneId ? 'bg-white/20' : 'bg-white text-slate-500'
                  }`}
                >
                  {z.count}
                </span>
              )}
            </button>
          ))}
          {onClearZone && activeZoneId && (
            <button
              type="button"
              data-testid="filter-all-zones"
              onClick={onClearZone}
              className="rounded-xl px-2.5 py-2 text-[11px] font-black text-slate-500 underline decoration-dotted hover:text-slate-800"
            >
              كل الزونات
            </button>
          )}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        </>
      )}

      {hasDay && (
        <label className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-slate-500">اليوم</span>
          <input
            type="date"
            data-testid="filter-day"
            value={day}
            onChange={(e) => onDayChange(e.target.value)}
            aria-label="يوم بغداد"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
          />
        </label>
      )}

      {hasQuery && (
        <label className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-xl border border-slate-200 px-2">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input
            type="search"
            data-testid="filter-query"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={queryPlaceholder}
            aria-label={queryPlaceholder}
            className="w-full bg-transparent py-2 text-xs font-bold outline-none"
          />
        </label>
      )}

      {extra}

      {dirty && onClearAll && (
        <button
          type="button"
          data-testid="filter-clear-all"
          onClick={onClearAll}
          className="flex items-center gap-1 rounded-xl bg-rose-50 px-2.5 py-2 text-[11px] font-black text-rose-700 hover:bg-rose-100"
        >
          <RotateCcw size={12} /> مسح الكل
        </button>
      )}

      {typeof shown === 'number' && typeof total === 'number' && (
        <span
          data-testid="filter-count"
          aria-live="polite"
          className="ms-auto rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700"
        >
          {shown}
          {shown !== total && <span className="text-slate-500"> من {total}</span>} {unitLabel}
        </span>
      )}
    </section>
  )
}

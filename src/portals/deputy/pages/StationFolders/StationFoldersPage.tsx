/**
 * فولدر المحطة — بوابة معاون المدير المفوض (النمط الجديد 00131/00132):
 *  · تدفق البيانات: المحطة التحويلية → غرفة العمليات (تدقيق التقرير اليومي) → إرسال إلى المعاون
 *  · كل فولدر يومي وارد يعرض: وحدات الصادر الثلاث (سكسات/نسافات/ناقلات) بحمولاتها القياسية،
 *    مجاميع الوارد (مكبس/محطة)، ومخالفات الوزن — للاطلاع والاعتماد.
 */
import { useDeputyDailyReports, UNIT_CAPACITIES } from '@features/transfer-station'
import type { OutboundUnit } from '@features/transfer-station/lib/unitCapacities'
import { Icon } from '@components/ui/Icon/Icon'

const num = (v: unknown): number => Number(v ?? 0)

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00+03:00`).toLocaleDateString('ar-IQ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

const timeLabel = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('ar-IQ', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(iso))
    : '—'

const UNITS: Array<{ key: OutboundUnit; accent: string }> = [
  { key: 'saksat', accent: 'border-amber-200 bg-amber-50/60 text-amber-800' },
  { key: 'trips', accent: 'border-sky-200 bg-sky-50/60 text-sky-800' },
  { key: 'carrier', accent: 'border-emerald-200 bg-emerald-50/60 text-emerald-800' },
]

function Metric({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
      <span className="block text-[10px] font-bold text-slate-500">{label}</span>
      <b className={`block text-sm ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{value}</b>
    </div>
  )
}

export default function StationFolders() {
  const reports = useDeputyDailyReports()
  const rows = [...(reports.data ?? [])].sort((a, b) =>
    b.report_day.localeCompare(a.report_day),
  )

  return (
    <div className="space-y-5" data-testid="station-folders-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">فولدر المحطة</h1>
        <p className="text-sm text-slate-500">
          فولدرات يومية مدققة واردة من غرفة العمليات — النمط: المحطة ← غرفة العمليات ← المعاون
        </p>
      </div>

      {rows.length === 0 ? (
        <div
          data-testid="station-folders-empty"
          className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"
        >
          <Icon name="folder" size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-600">لا توجد فولدرات واردة بعد</p>
          <p className="mt-1 text-xs text-slate-400">
            تُرسل من غرفة العمليات بعد تدقيق التقرير اليومي للمحطة ضمن صفحة «التقرير اليومي للمحطة».
          </p>
        </div>
      ) : (
        rows.map((r) => {
          const violations = (r.payload.violations ?? []).length
          return (
            <div
              key={r.report_day}
              data-testid={`deputy-folder-${r.report_day}`}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <Icon name="folder" size={16} className="text-brand-600" />
                <h2 className="text-sm font-bold text-slate-800">
                  فولدر يومي — {dayLabel(r.report_day)}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dir-ltr">
                  {r.report_day}
                </span>
                <span className="ms-auto text-[11px] text-slate-500">
                  المُرسِل: {r.sender_name ?? 'غرفة العمليات'} · {timeLabel(r.sent_at)}
                </span>
              </div>
              {r.note && (
                <p className="border-b border-slate-100 bg-brand-50/40 px-4 py-2 text-xs text-slate-600">
                  ملاحظة غرفة العمليات: {r.note}
                </p>
              )}
              <div className="grid gap-3 p-4 md:grid-cols-3">
                {UNITS.map((u) => {
                  const unit = r.payload.outbound?.[u.key]
                  return (
                    <div
                      key={u.key}
                      data-testid={`folder-unit-${u.key}`}
                      className={`rounded-xl border px-3 py-2.5 ${u.accent}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{UNIT_CAPACITIES[u.key].label}</span>
                        <span className="text-[10px] opacity-80">
                          قياسي {UNIT_CAPACITIES[u.key].tons} طن
                        </span>
                      </div>
                      <div className="mt-2 flex items-end gap-1.5">
                        <b className="text-xl">{num(unit?.count)}</b>
                        <span className="text-[10px] opacity-80">شحنة</span>
                        <b className="ms-auto text-lg dir-ltr">{num(unit?.tons).toFixed(1)}</b>
                        <span className="text-[10px] opacity-80">طن</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-4 py-3 md:grid-cols-4">
                <Metric label="شحنات واردة" value={num(r.payload.inbound_totals?.total_count)} />
                <Metric
                  label="أطنان واردة"
                  value={num(r.payload.inbound_totals?.total_tons).toFixed(1)}
                />
                <Metric
                  label="إجمالي الصادر"
                  value={`${num(r.payload.outbound?.total_count)} شحنة · ${num(r.payload.outbound?.total_tons).toFixed(1)} طن`}
                />
                <Metric label="مخالفات الوزن" value={violations} danger={violations > 0} />
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

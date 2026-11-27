/**
 * غرفة العمليات — حضوريات الآليات المؤجرة (20261203000100–000400)
 *
 * ① كشف الشهر: صف لكل سائق، وعمود لكل يوم (٣١ أو ٣٠ حسب الشهر)، حاضر/غائب بالألوان.
 * ② فلتر الكراج (كرادة / زعفرانية…).
 * ③ التعديل اليدوي على يوم واحد — بسبب إلزامي، ويُسجَّل في سجل التدقيق.
 * ④ إعدادات التفريغ: نوع الآلية + طن التفريغة + الطن المطلوب شهرياً ⇒ عدد الذهاب المطلوب.
 * ⑤ تصدير Excel: ورقة لكل سائق.
 * ⑥ إرسال الشهر لاعتماد معاون المدير المفوض.
 *
 * المصدر: الانطلاق في الكراج. لا إدخال يدوي إلا استثناءً موثّقاً.
 */
import { useMemo, useState } from 'react'
import { Download, Send, Settings2, Timer } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { Button } from '@components/ui'
import {
  useRentedDischarge,
  useRentedGarages,
  useRentedMonth,
  useSaveDischarge,
  useSetRentedDay,
  useSubmitRentedMonth,
} from '@features/rented-vehicles/hooks'
import { downloadRentedAttendanceExcel } from '@features/rented-vehicles/excel'
import { useCanCall } from '@features/permissions/my-permissions'
import type { RentedAttendanceRow, RentedDischargeRow } from '@sdk/rented-vehicles.sdk'

type Tab = 'sheet' | 'discharge'
const input =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none'
const btnDark =
  'inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50'
const btnLight =
  'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-50'

const MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
]

/** ym الحالي بصيغة YYYY-MM بتوقيت بغداد */
const baghdadYm = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' }).slice(0, 7)

export default function OpsRentedAttendancePage() {
  const [tab, setTab] = useState<Tab>('sheet')
  const [month, setMonth] = useState<string | null>(baghdadYm())
  const [garage, setGarage] = useState<string | null>(null)

  const garages = useRentedGarages()
  const q = useRentedMonth(month, garage)
  const submit = useSubmitRentedMonth()
  const [editing, setEditing] = useState<{ row: RentedAttendanceRow; day: number } | null>(null)
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'present' | 'absent'>('present')
  const setDay = useSetRentedDay()

  // 00350-D: تعطيل أزرار الكتابة حسب الصلاحية قبل النقر
  const canSubmit = useCanCall('rented_month_submit')
  const canSetDay = useCanCall('rented_attendance_set_day')

  const data = q.data
  const rows = useMemo(() => data?.rows ?? [], [data])
  const days = data?.days_in_month ?? 30
  const totals = useMemo(
    () => ({
      present: rows.reduce((a, r) => a + r.present, 0),
      absent: rows.reduce((a, r) => a + r.absent, 0),
      departures: rows.reduce((a, r) => a + r.departures_count, 0),
      tons: rows.reduce((a, r) => a + Number(r.tons_discharged ?? 0), 0),
    }),
    [rows],
  )
  const garageLabel = garage
    ? (garages.data?.find((g) => g.garage_parent_sector === garage)?.garage_parent_sector ?? garage)
    : null

  const yearOptions = useMemo(() => {
    const y = Number(baghdadYm().slice(0, 4))
    return [y, y - 1]
  }, [])

  const saveDay = async () => {
    if (!editing) return
    if (reason.trim().length < 3) {
      window.alert('السبب إلزامي (٣ أحرف على الأقل)')
      return
    }
    const d = `${month}-${String(editing.day).padStart(2, '0')}`
    try {
      await setDay.mutateAsync({
        driverId: editing.row.driver_external_id,
        vehicleId: editing.row.vehicle_id,
        day: d,
        status,
        reason: reason.trim(),
      })
      setEditing(null)
      setReason('')
    } catch {
      /* الرسالة تظهر في التوست */
    }
  }

  return (
    <section dir="rtl" className="space-y-4" data-testid="ops-rented-attendance-page">
      <ExecPageHeader
        icon="truck"
        title="حضوريات الآليات المؤجرة"
        subtitle="القاعدة: الانطلاق = حاضر · اليوم بلا انطلاقة = غائب · اليوم بتوقيت بغداد. الكشف يُبنى آلياً من انطلاقات الكراج، والتعديل اليدوي استثناء موثّق بسبب."
        stats={[
          { label: 'سائقون', value: rows.length, tone: 'plain', testId: 'ra-st-drivers' },
          { label: 'أيام حضور', value: totals.present, tone: 'green', testId: 'ra-st-present' },
          { label: 'أيام غياب', value: totals.absent, tone: 'red', testId: 'ra-st-absent' },
          { label: 'طن مفّرغ', value: totals.tons.toFixed(2), tone: 'plain', testId: 'ra-st-tons' },
        ]}
      />

      <nav className="flex flex-wrap items-center gap-2">
        {(
          [
            ['sheet', 'كشف الحضور'],
            ['discharge', 'إعدادات التفريغ'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`ra-tab-${id}`}
            onClick={() => setTab(id)}
            className={`rounded-xl px-3 py-2 text-xs font-black ${tab === id ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
          >
            {label}
          </button>
        ))}
        <span className="grow" />
        <select
          aria-label="الكراج"
          className={`${input} max-w-48`}
          value={garage ?? ''}
          data-testid="ra-garage"
          onChange={(e) => setGarage(e.target.value || null)}
        >
          <option value="">كل الكراجات</option>
          {(garages.data ?? []).map((g) => (
            <option key={g.garage_parent_sector} value={g.garage_parent_sector}>
              {g.garage_parent_sector} ({g.vehicles})
            </option>
          ))}
        </select>
        <select
          aria-label="الشهر"
          className={`${input} max-w-56`}
          value={month ?? ''}
          data-testid="ra-month"
          onChange={(e) => setMonth(e.target.value)}
        >
          {yearOptions.map((y) =>
            MONTHS.map((m, i) => {
              const ym = `${y}-${String(i + 1).padStart(2, '0')}`
              return (
                <option key={ym} value={ym}>
                  {m} {y}
                </option>
              )
            }),
          )}
        </select>
      </nav>

      {tab === 'sheet' && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnLight}
              data-testid="ra-export"
              disabled={!data || rows.length === 0}
              onClick={() => data && void downloadRentedAttendanceExcel(data, garageLabel)}
            >
              <Download size={14} /> تصدير Excel (ورقة لكل سائق)
            </button>
            <button
              type="button"
              className={btnDark}
              data-testid="ra-submit"
              disabled={!month || submit.isPending || rows.length === 0 || !canSubmit.allowed}
              title={canSubmit.title}
              onClick={() => month && submit.mutate({ month })}
            >
              <Send size={14} /> إرسال للاعتماد (معاون المدير المفوض)
            </button>
          </div>

          {q.isLoading && <LoadingSpinner />}
          {q.isError && (
            <p
              className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
              data-testid="ra-error"
            >
              تعذّر تحميل الكشف — تحقّق من الصلاحية أو الاتصال.
            </p>
          )}
          {!q.isLoading && !q.isError && rows.length === 0 && (
            <EmptyState
              title="لا توجد آليات مؤجرة مسجّلة"
              hint="أضِف الآلية المؤجرة وسائقها من قاعدة بيانات الآليات في الكراج، ثم ستظهر هنا تلقائياً."
            />
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table
                className="w-full min-w-[900px] border-collapse text-center text-xs"
                data-testid="ra-table"
              >
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="sticky right-0 z-10 bg-slate-950 px-2 py-2 text-right font-black">
                      السائق
                    </th>
                    <th className="px-2 py-2 text-right font-black">الآلية</th>
                    <th className="px-2 py-2 font-black">الكراج</th>
                    {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                      <th key={d} className="px-1 py-2 font-bold tabular-nums">
                        {d}
                      </th>
                    ))}
                    <th className="px-2 py-2 font-black">حاضر</th>
                    <th className="px-2 py-2 font-black">غائب</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.driver_external_id}:${r.vehicle_id}`}
                      className="border-t border-slate-100"
                    >
                      <td className="sticky right-0 z-10 bg-white px-2 py-1.5 text-right">
                        <div className="font-black text-slate-900">{r.driver_name}</div>
                        <div className="text-[10px] text-slate-500">{r.contractor_name}</div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-[11px] text-slate-600">
                        <div className="font-bold text-slate-800">{r.db_number}</div>
                        <div>{r.vehicle_name}</div>
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-slate-500">
                        {r.garage_parent_sector ?? '—'}
                      </td>
                      {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                        const s = r.days[String(d)]
                        return (
                          <td key={d} className="p-0">
                            <button
                              type="button"
                              data-testid={`ra-cell-${r.driver_external_id}-${d}`}
                              disabled={!canSetDay.allowed}
                              title={
                                canSetDay.title ??
                                (s
                                  ? `${r.driver_name} — يوم ${d}: ${s === 'present' ? 'حاضر' : 'غائب'} (اضغط للتعديل)`
                                  : `يوم ${d}: لا بيانات`)
                              }
                              onClick={() => {
                                setEditing({ row: r, day: d })
                                setStatus(s === 'present' ? 'absent' : 'present')
                                setReason('')
                              }}
                              className={`h-7 w-7 text-[10px] font-black ${
                                s === 'present'
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : s === 'absent'
                                    ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                    : 'bg-slate-50 text-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {s === 'present' ? 'ح' : s === 'absent' ? 'غ' : '·'}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-2 py-1.5 font-black text-emerald-700 tabular-nums">
                        {r.present}
                      </td>
                      <td className="px-2 py-1.5 font-black text-rose-700 tabular-nums">
                        {r.absent}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editing && (
            <div
              className="rounded-2xl border border-sky-200 bg-sky-50 p-3"
              data-testid="ra-edit-panel"
            >
              <p className="mb-2 text-xs font-black text-slate-800">
                تعديل يوم {editing.day} — {editing.row.driver_name} ({editing.row.db_number})
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <select
                  aria-label="الحالة"
                  className={`${input} max-w-40`}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'present' | 'absent')}
                >
                  <option value="present">حاضر</option>
                  <option value="absent">غائب</option>
                </select>
                <input
                  aria-label="السبب"
                  className={`${input} max-w-md`}
                  placeholder="السبب (إلزامي — يُسجَّل في التدقيق)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="ra-edit-reason"
                />
                <Button
                  onClick={saveDay}
                  disabled={setDay.isPending || !canSetDay.allowed}
                  title={canSetDay.title}
                  data-testid="ra-edit-save"
                >
                  حفظ
                </Button>
                <button
                  type="button"
                  className={btnLight}
                  onClick={() => {
                    setEditing(null)
                    setReason('')
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'discharge' && <DischargePanel />}
    </section>
  )
}

/** إعدادات التفريغ: نوع الآلية يحدد الطن، والمطلوب شهرياً يحدد عدد الذهاب */
function DischargePanel() {
  const q = useRentedDischarge()
  const save = useSaveDischarge()
  const canSave = useCanCall('rented_discharge_save')
  const [editing, setEditing] = useState<RentedDischargeRow | null>(null)
  const [tonsPerTrip, setTonsPerTrip] = useState('')
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')

  const open = (r: RentedDischargeRow) => {
    setEditing(r)
    setTonsPerTrip(r.tons_per_trip != null ? String(r.tons_per_trip) : '')
    setTarget(String(r.monthly_target_tons ?? 0))
    setNote(r.note ?? '')
  }

  const trips = useMemo(() => {
    const t = Number(tonsPerTrip)
    const g = Number(target)
    if (!t || t <= 0 || !g || g <= 0) return null
    return Math.ceil(g / t)
  }, [tonsPerTrip, target])

  const submit = async () => {
    if (!editing) return
    const t = tonsPerTrip.trim() === '' ? null : Number(tonsPerTrip)
    if (t !== null && (!Number.isFinite(t) || t <= 0)) {
      window.alert('طن التفريغة يجب أن يكون أكبر من صفر')
      return
    }
    const g = Number(target)
    if (!Number.isFinite(g) || g < 0) {
      window.alert('الطن المطلوب غير صالح')
      return
    }
    try {
      await save.mutateAsync({
        vehicleId: editing.vehicle_id,
        tonsPerTrip: t,
        monthlyTargetTons: g,
        note: note.trim() || null,
      })
      setEditing(null)
    } catch {
      /* toast */
    }
  }

  if (q.isLoading) return <LoadingSpinner />
  const rows = q.data ?? []
  if (rows.length === 0) {
    return (
      <EmptyState
        title="لا توجد آليات مؤجرة"
        hint="إعدادات التفريغ تُضبط لكل آلية مؤجرة على حِدة."
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
        <Settings2 size={13} className="inline" /> مثال: كابسة كبيرة، ٦ طن = تفريغة واحدة. لو كان
        المطلوب من السائق ٦ طن فهو يحتاج تفريغة واحدة. كابسة صغيرة ٢ طن والمطلوب ٦ طن ⇒ يحتاج ٣ ذهاب
        للمحطة.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-xs" data-testid="ra-discharge-table">
          <thead>
            <tr className="bg-slate-950 text-white">
              {['الآلية', 'النوع', 'الكراج', 'طن / تفريغة', 'الطن المطلوب', 'عدد الذهاب', ''].map(
                (h) => (
                  <th key={h} className="px-2 py-2 font-black">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vehicle_id} className="border-t border-slate-100 text-center">
                <td className="px-2 py-1.5 text-right">
                  <div className="font-black text-slate-900">{r.db_number}</div>
                  <div className="text-[10px] text-slate-500">{r.vehicle_name}</div>
                </td>
                <td className="px-2 py-1.5">{r.category_label ?? r.vehicle_category ?? '—'}</td>
                <td className="px-2 py-1.5 text-slate-500">{r.garage_parent_sector ?? '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{r.tons_per_trip ?? '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{Number(r.monthly_target_tons ?? 0)}</td>
                <td className="px-2 py-1.5 font-black tabular-nums text-sky-700">
                  {r.trips_required ?? '—'}
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    className={btnLight}
                    data-testid={`ra-discharge-edit-${r.vehicle_id}`}
                    onClick={() => open(r)}
                  >
                    تعديل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="rounded-2xl border border-sky-200 bg-sky-50 p-3"
          data-testid="ra-discharge-panel"
        >
          <p className="mb-2 text-xs font-black text-slate-800">
            {editing.db_number} — {editing.vehicle_name}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-bold text-slate-600">
              طن / تفريغة
              <input
                aria-label="طن لكل تفريغة"
                className={input}
                inputMode="decimal"
                value={tonsPerTrip}
                onChange={(e) => setTonsPerTrip(e.target.value)}
                data-testid="ra-tons-per-trip"
              />
            </label>
            <label className="text-[11px] font-bold text-slate-600">
              الطن المطلوب شهرياً
              <input
                aria-label="الطن المطلوب"
                className={input}
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                data-testid="ra-target-tons"
              />
            </label>
            <label className="text-[11px] font-bold text-slate-600">
              ملاحظة
              <input
                aria-label="ملاحظة"
                className={`${input} max-w-md`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <Button
              onClick={submit}
              disabled={save.isPending || !canSave.allowed}
              title={canSave.title}
              data-testid="ra-discharge-save"
            >
              حفظ
            </Button>
            <button type="button" className={btnLight} onClick={() => setEditing(null)}>
              إلغاء
            </button>
            {trips !== null && (
              <span
                className="rounded-xl bg-white px-3 py-2 text-[11px] font-black text-sky-800"
                data-testid="ra-trips-preview"
              >
                <Timer size={13} className="inline" /> يحتاج {trips} ذهاب للمحطة
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

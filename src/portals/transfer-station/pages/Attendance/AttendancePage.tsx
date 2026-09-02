/**
 * وحدة الحضورية — المحطة التحويلية (00043):
 *  · تسجيل حضور موظف: الاسم · حاضر/غير حاضر · التاريخ
 *  · يُعرض لموظفي المحطة — سجل يومي بفلتر تاريخ
 */
import { useState } from 'react'
import clsx from 'clsx'
import { useAttendanceList, useCreateAttendance } from '@features/transfer-station'
import { StationTable, type StationRow } from '@components/station/StationTable'
import { Icon } from '@components/ui/Icon/Icon'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function AttendancePage() {
  const [name, setName] = useState('')
  const [isPresent, setIsPresent] = useState(true)
  const [filterDate, setFilterDate] = useState(todayISO())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const list = useAttendanceList(filterDate)
  const create = useCreateAttendance()
  const records = list.data ?? []
  /** تحويل سجلات الحضورية إلى صفوف الجدول المشترك (اسم الموظف كـ driver_name) */
  const rows: StationRow[] = records.map((r) => ({
    id: r.id,
    driver_name: r.employee_name,
    vehicle_type: null,
    exit_time: null,
    log_date: r.log_date,
    status: 'draft' as const,
    submitted_at: null,
    archived_at: r.archived_at,
    archive_reason: r.archive_reason,
    created_at: r.created_at,
    is_present: r.is_present,
  }))

  const submit = (): void => {
    const er: Record<string, string> = {}
    if (name.trim().length < 2) er.name = 'اسم الموظف مطلوب (حرفان فأكثر)'
    setErrors(er)
    if (Object.keys(er).length > 0) return

    create.mutate({
      employee_name: name.trim(),
      is_present: isPresent,
      log_date: todayISO(),
    })
    setName('')
    setIsPresent(true)
  }

  return (
    <div className="space-y-5" data-testid="attendance-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">الحضورية</h1>
        <p className="text-sm text-slate-500">حضور وانصراف موظفي المحطة التحويلية</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        data-testid="attendance-form"
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <Icon name="calendar" size={16} className="text-brand-600" />
          تسجيل حضور موظف
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            اسم الموظف <span className="text-red-500">*</span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: '' })) }}
              data-testid="f-attendance-name"
              placeholder="اسم الموظف"
              className={clsx(
                'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-brand-500',
                errors.name ? 'border-red-400' : 'border-slate-200',
              )}
            />
            {errors.name && <span className="text-[11px] text-red-600">{errors.name}</span>}
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            الحالة
            <select
              value={isPresent ? 'present' : 'absent'}
              onChange={(e) => setIsPresent(e.target.value === 'present')}
              data-testid="f-attendance-presence"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500"
            >
              <option value="present">حاضر</option>
              <option value="absent">غير حاضر</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={create.isPending}
              data-testid="attendance-submit"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              <Icon name="check-square" size={16} /> تسجيل الحضور
            </button>
          </div>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          التاريخ
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            data-testid="attendance-filter-date"
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm dir-ltr"
          />
        </label>
        <span className="text-xs text-slate-500">{records.length} سجل</span>
      </div>

      <StationTable kind="attendance" records={rows} personLabel="اسم الموظف" withVehicle={false} presence />
    </div>
  )
}
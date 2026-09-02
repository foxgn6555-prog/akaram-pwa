/**
 * وحدة السكسات الخارجة — المحطة التحويلية (00043):
 *  · تسجيل خروج سكسة: اسم السائق · نوع الآلية · وقت الخروج (تلقائي)
 *  · نظام الفولدر الشهري: إرسال سجلات الشهر لمعاون المدير المفوض
 */
import { useState } from 'react'
import clsx from 'clsx'
import {
  useSaksatList,
  useCreateSaksat,
  useSendSaksatFolder,
} from '@features/transfer-station'
import { FolderBar } from '@components/station/FolderBar'
import { StationTable } from '@components/station/StationTable'
import { currentMonth } from '@components/station/station.utils'
import { Icon } from '@components/ui/Icon/Icon'

export default function SaksatPage() {
  const [name, setName] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [month, setMonth] = useState(currentMonth())

  const list = useSaksatList(month)
  const create = useCreateSaksat()
  const sendFolder = useSendSaksatFolder()
  const records = list.data ?? []

  const submit = (): void => {
    const er: Record<string, string> = {}
    if (name.trim().length < 2) er.name = 'اسم السائق مطلوب (حرفان فأكثر)'
    setErrors(er)
    if (Object.keys(er).length > 0) return

    create.mutate({
      driver_name: name.trim(),
      vehicle_type: vehicle.trim() || null,
      log_date: new Date().toISOString().slice(0, 10),
    })
    setName('')
    setVehicle('')
  }

  return (
    <div className="space-y-5" data-testid="saksat-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">السكسات الخارجة</h1>
        <p className="text-sm text-slate-500">تسجيل السكسات الخارجة من المحطة التحويلية</p>
      </div>

      {/* ── نموذج الإدخال ── */}
      <form
        onSubmit={(e) => { e.preventDefault(); submit() }}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        data-testid="saksat-form"
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <Icon name="edit" size={16} className="text-brand-600" />
          تسجيل سكسة خارجة
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            اسم السائق <span className="text-red-500">*</span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: '' })) }}
              data-testid="f-saksat-name"
              placeholder="اسم السائق"
              className={clsx(
                'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-brand-500',
                errors.name ? 'border-red-400' : 'border-slate-200',
              )}
            />
            {errors.name && <span className="text-[11px] text-red-600">{errors.name}</span>}
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            نوع الآلية
            <input
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              data-testid="f-saksat-vehicle"
              placeholder="نوع الآلية"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            وقت الخروج <span className="font-normal text-slate-400">(تلقائي)</span>
            <div className="flex h-11 items-center rounded-xl border border-dashed border-brand-200 bg-brand-50/60 px-3 text-sm font-bold text-brand-700 dir-ltr">
              {new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </label>
          <div className="flex items-end lg:col-start-3">
            <button
              type="submit"
              disabled={create.isPending}
              data-testid="saksat-submit"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              <Icon name="check-square" size={16} /> تسجيل الخروج
            </button>
          </div>
        </div>
      </form>

      {/* ── نظام الفولدر الشهري ── */}
      <FolderBar
        kind="saksat"
        records={records}
        month={month}
        onMonthChange={setMonth}
        onSend={(m) => sendFolder.mutate(m)}
      />

      {/* ── الجدول ── */}
      <StationTable kind="saksat" records={records} personLabel="اسم السائق" />
    </div>
  )
}
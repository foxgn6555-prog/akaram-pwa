/**
 * بوابة الموارد البشرية · الوحدة السادسة «دفتر البصمة» (الجانب البياناتي فقط):
 *   · كل البصمات الواصلة من كل الطرق (ADMS/API/شبكة/عام) في مجرى واحد بفلاتر يوم/فترة/PIN/مصدر.
 *   · غير المطابَقين: ربط رقم البصمة بالموظف الصحيح (تعبئة رجعية تلقائية).
 *   · اشتقاق سجل الحضور اليومي من البصمات بزر واحد.
 * الجانب التقني (تسجيل المصادر، السحب، سجل العمليات) في بوابة التطوير المركزية.
 */
import { useMemo, useState } from 'react'
import {
  BIOMETRIC_MODE_LABELS, useBiometricPunches, useDeriveAttendance, useDevices, useLinkBiometricPin,
} from '@features/integrations'
import type { BiometricPunch } from '@features/integrations'
import { useEmployees } from '@features/employees'
import { formatDateTime } from '@lib/utils/date.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'

const field = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm'
const DIRECTION_LABEL = { in: 'دخول', out: 'خروج', unknown: 'غير محدد' } as const
const DIRECTION_CLASS = { in: 'bg-emerald-50 text-emerald-700', out: 'bg-sky-50 text-sky-700', unknown: 'bg-slate-100 text-slate-600' } as const
const today = () => new Date().toISOString().slice(0, 10)

export default function BiometricLedger() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [pin, setPin] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [deriveDate, setDeriveDate] = useState(today())

  const filters = useMemo(() => ({ from, to, pin: pin || null, deviceId: deviceId || null, unmatchedOnly, limit: 500 }), [from, to, pin, deviceId, unmatchedOnly])
  const { data: punches, isLoading } = useBiometricPunches(filters)
  const { data: devices } = useDevices()
  const derive = useDeriveAttendance()

  const stats = useMemo(() => {
    const list = punches ?? []
    return {
      total: list.length,
      in: list.filter((p) => p.direction === 'in').length,
      out: list.filter((p) => p.direction === 'out').length,
      unmatched: list.filter((p) => !p.employee_id).length,
      people: new Set(list.map((p) => p.employee_id ?? `pin:${p.pin}`)).size,
    }
  }, [punches])

  return (
    <section aria-labelledby="ledger-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="ledger-title" className="text-lg font-bold">دفتر البصمة</h1>
          <p className="text-sm text-slate-500">كل البصمات الواصلة من جميع المصادر — المطابقة والربط واشتقاق الحضور تتم هنا.</p>
        </div>
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="derive-panel">
          <label className="text-[11px] text-slate-600">اشتقاق حضور يوم
            <input type="date" className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-xs" value={deriveDate}
              onChange={(e) => setDeriveDate(e.target.value)} data-testid="derive-date" />
          </label>
          <Button size="sm" onClick={() => derive.mutate(deriveDate)} isLoading={derive.isPending} data-testid="derive-run">
            <Icon name="calendar" size={14} />
            اشتقاق الحضور
          </Button>
        </div>
      </div>

      {/* الإحصاءات */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="ledger-stats">
        {([
          ['total', 'بصمات', stats.total, 'text-slate-800'],
          ['people', 'أشخاص', stats.people, 'text-brand-700'],
          ['in', 'دخول', stats.in, 'text-emerald-700'],
          ['out', 'خروج', stats.out, 'text-sky-700'],
          ['unmatched', 'غير مطابَق', stats.unmatched, stats.unmatched ? 'text-amber-700' : 'text-slate-400'],
        ] as const).map(([k, l, v, cls]) => (
          <div key={k} className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm" data-testid={`ledger-stat-${k}`}>
            <p className={clsx('text-xl font-black tabular-nums', cls)}>{v}</p>
            <p className="text-[11px] text-slate-500">{l}</p>
          </div>
        ))}
      </div>

      {/* الفلاتر */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-5" data-testid="ledger-filters">
        <label className="text-xs text-slate-600">من
          <input type="date" className={clsx(field, 'mt-1')} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="ledger-from" />
        </label>
        <label className="text-xs text-slate-600">إلى
          <input type="date" className={clsx(field, 'mt-1')} value={to} onChange={(e) => setTo(e.target.value)} data-testid="ledger-to" />
        </label>
        <label className="text-xs text-slate-600">رقم البصمة / الوظيفي
          <input className={clsx(field, 'mt-1')} dir="ltr" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} data-testid="ledger-pin" />
        </label>
        <label className="text-xs text-slate-600">المصدر
          <select className={clsx(field, 'mt-1')} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} data-testid="ledger-device">
            <option value="">كل المصادر</option>
            {devices?.map((d) => <option key={d.id} value={d.id}>{d.name} — {BIOMETRIC_MODE_LABELS[d.mode]}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs text-slate-700">
          <input type="checkbox" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} data-testid="ledger-unmatched-only" />
          غير المطابَقين فقط
        </label>
      </div>

      {isLoading && <LoadingSpinner label="جارٍ جلب البصمات…" />}
      {!isLoading && (punches?.length ?? 0) === 0 && (
        <EmptyState title="لا بصمات في هذا النطاق" hint="وسّع الفترة أو تأكد من سحب البيانات من بوابة التطوير المركزية" />
      )}

      {punches && punches.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-xs" data-testid="ledger-table">
            <thead className="bg-slate-50 text-right text-slate-500">
              <tr>
                <th className="px-3 py-2">الوقت</th>
                <th className="px-3 py-2">الاتجاه</th>
                <th className="px-3 py-2">PIN</th>
                <th className="px-3 py-2">الموظف</th>
                <th className="px-3 py-2">المصدر</th>
                <th className="px-3 py-2">الطريقة</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {punches.map((p) => <PunchRow key={p.id} punch={p} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function PunchRow({ punch: p }: { punch: BiometricPunch }) {
  const [linking, setLinking] = useState(false)
  return (
    <>
      <tr className={clsx('border-t border-slate-100', !p.employee_id && 'bg-amber-50/40')} data-testid={`punch-row-${p.id}`}>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDateTime(p.punched_at)}</td>
        <td className="px-3 py-2">
          <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', DIRECTION_CLASS[p.direction])}>{DIRECTION_LABEL[p.direction]}</span>
        </td>
        <td className="px-3 py-2 font-mono" dir="ltr">{p.pin}</td>
        <td className="px-3 py-2">
          {p.employee_id ? (
            <span className="font-semibold text-slate-800">{p.employee_name} <span className="text-slate-400">({p.employee_number})</span></span>
          ) : (
            <span className="font-semibold text-amber-700" data-testid={`punch-unmatched-${p.id}`}>
              غير مطابَق{(p.device_user_name ?? p.person_name) ? ` · ${p.device_user_name ?? p.person_name}` : ''}
              {p.device_user_name && <span className="ms-1 text-[10px] font-normal text-amber-600">(اسمه على الجهاز)</span>}
            </span>
          )}
        </td>
        <td className="px-3 py-2" dir="ltr">{p.device_serial}</td>
        <td className="px-3 py-2 text-slate-500">{p.method === 'manual' ? 'يدوي' : BIOMETRIC_MODE_LABELS[p.method]}</td>
        <td className="px-3 py-2 text-left">
          {!p.employee_id && (
            <button type="button" onClick={() => setLinking((v) => !v)} data-testid={`punch-link-${p.id}`}
              className="text-[11px] font-semibold text-brand-700 hover:underline">
              {linking ? 'إلغاء' : 'ربط بموظف'}
            </button>
          )}
        </td>
      </tr>
      {linking && (
        <tr className="border-t border-amber-100 bg-amber-50/60">
          <td colSpan={7} className="px-3 py-2">
            <LinkPinForm pin={p.pin} deviceName={p.device_user_name ?? p.person_name} onDone={() => setLinking(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

function LinkPinForm({ pin, deviceName, onDone }: { pin: string; deviceName?: string | null; onDone: () => void }) {
  // اقتراح: ابدأ البحث بالاسم كما سجّله الجهاز (إن وُجد)
  const [search, setSearch] = useState(deviceName ?? '')
  const [employeeId, setEmployeeId] = useState('')
  const { data: candidates } = useEmployees({ search: search || undefined, limit: 20 })
  const link = useLinkBiometricPin()
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid={`link-form-${pin}`}>
      <span className="text-xs text-slate-600">ربط PIN <b dir="ltr">{pin}</b>{deviceName ? <> («{deviceName}» على الجهاز)</> : null} بـ:</span>
      <input className="h-9 w-40 rounded-lg border border-slate-300 px-2 text-xs" placeholder="بحث بالاسم" value={search}
        onChange={(e) => setSearch(e.target.value)} data-testid="link-search" />
      <select className="h-9 min-w-48 rounded-lg border border-slate-300 bg-white px-2 text-xs" value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)} data-testid="link-employee">
        <option value="">— اختر الموظف —</option>
        {candidates?.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_number})</option>)}
      </select>
      <Button size="sm" disabled={!employeeId} isLoading={link.isPending} data-testid="link-save"
        onClick={() => link.mutate({ pin, employeeId }, { onSuccess: onDone })}>
        ربط
      </Button>
    </div>
  )
}

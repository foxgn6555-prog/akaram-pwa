/**
 * بوابة التطوير المركزية · أجهزة البصمة ومصادرها (الجانب التقني بالكامل):
 *   ① تسجيل مصدر بأحد الأنماط الأربعة (ADMS دفع · API تطبيق · شبكة داخلية · عام).
 *   ② تهيئة كل مصدر (رابط/مفتاح/خريطة حقول) + اختبار الاتصال دون إدراج.
 *   ③ «اسحب الآن» بنافذة زمنية → الدفتر الموحّد (تكرار/مطابقة تلقائية).
 *   ④ معالجة دفعات ADMS المتراكمة + سجل عمليات كامل (متى/من/كم/الخطأ).
 * البيانات نفسها (دفتر البصمات، الربط، اشتقاق الحضور) في بوابة الموارد البشرية.
 */
import { useMemo, useState } from 'react'
import { useBranches } from '@features/branches'
import {
  BIOMETRIC_MODES, BIOMETRIC_MODE_LABELS,
  useBiometricPulls, useCreateDevice, useDevices, useProcessBiometricPushes, usePullBiometric,
  useTestBiometricSource, useToggleDevice, useUpdateBiometricDevice,
} from '@features/integrations'
import type { BiometricDevice, BiometricDeviceConfig, BiometricMode, BiometricTestResult } from '@features/integrations'
import { integrations } from '@sdk/integrations.sdk'
import { BIOMETRIC_ERROR_MESSAGES } from '@sdk/biometric.sdk'
import { formatDateTime, formatRelative } from '@lib/utils/date.utils'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import clsx from 'clsx'
import { SourceConfigFields } from './biometric/SourceConfigFields'
import { cleanConfig, MODE_HINTS, validateConfigLocally } from './biometric/source-config.utils'

const field = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm'
const label = 'mb-1.5 block text-sm font-medium'
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const TZ_RE = /^[+-](0[0-9]|1[0-4]):[0-5][0-9]$/
const TZ_OPTIONS = ['+03:00', '+02:00', '+04:00', '+04:30', '+05:00', '+05:30', '+01:00', '+00:00', '-05:00']

export default function BiometricPage() {
  const { data: devices, isLoading } = useDevices()
  const { data: branches } = useBranches()
  const create = useCreateDevice()
  const toggle = useToggleDevice()
  const processPushes = useProcessBiometricPushes()
  const [formOpen, setFormOpen] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | BiometricMode>('all')

  // نموذج التسجيل
  const [sn, setSn] = useState('')
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [mode, setMode] = useState<BiometricMode>('adms_push')
  const [config, setConfig] = useState<BiometricDeviceConfig>({})
  const [tz, setTz] = useState('+03:00')
  const [formError, setFormError] = useState<string | null>(null)

  const admsUrl = integrations.getAdmsServerUrl()
  const visible = useMemo(
    () => (devices ?? []).filter((d) => filterMode === 'all' || d.mode === filterMode),
    [devices, filterMode],
  )
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: devices?.length ?? 0 }
    for (const m of BIOMETRIC_MODES) c[m] = (devices ?? []).filter((d) => d.mode === m).length
    return c
  }, [devices])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!sn.trim() || !name.trim()) { setFormError('الرقم التسلسلي والاسم مطلوبان'); return }
    const cleaned = cleanConfig(mode, config)
    const code = validateConfigLocally(mode, cleaned)
    if (code) { setFormError(BIOMETRIC_ERROR_MESSAGES[code] ?? code); return }
    if (!TZ_RE.test(tz)) { setFormError(BIOMETRIC_ERROR_MESSAGES.biometric_devices_tz_check ?? 'منطقة الوقت غير صالحة'); return }
    await create.mutateAsync({ serial_number: sn.trim(), name: name.trim(), branch_id: branchId || undefined, mode, config: cleaned, timezone_offset: tz })
    setSn(''); setName(''); setBranchId(''); setMode('adms_push'); setConfig({}); setTz('+03:00'); setFormOpen(false)
  }

  return (
    <section aria-labelledby="bio-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="bio-title" className="text-lg font-bold">أجهزة البصمة ومصادر البيانات</h1>
          <p className="text-sm text-slate-500">
            المنصة تدعم أربعة أنماط في آن واحد: جهاز يدفع إلينا (ADMS)، سحب من API تطبيق مشترك، سحب مباشر من الشبكة الداخلية، ومصدر عام بخريطة حقول.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => processPushes.mutate(500)} isLoading={processPushes.isPending} data-testid="process-pushes">
            <Icon name="refresh" size={15} />
            معالجة دفعات ADMS
          </Button>
          <Button onClick={() => setFormOpen((v) => !v)} data-testid="toggle-device-form">
            <Icon name={formOpen ? 'x' : 'user-plus'} size={15} />
            {formOpen ? 'إغلاق' : 'تسجيل مصدر'}
          </Button>
        </div>
      </div>

      {/* إرشادات ADMS */}
      <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4" data-testid="adms-guide">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-brand-800">
          <Icon name="fingerprint" size={16} />
          ربط جهاز ZKTeco بنمط الدفع (ADMS)
        </h2>
        <ol className="space-y-1.5 text-xs leading-5 text-brand-900">
          <li>① سجّل الجهاز هنا برقمه التسلسلي (SN) بنمط «جهاز ZKTeco (دفع ADMS)»</li>
          <li>② في إعدادات الجهاز: Cloud Server URL ← الصق:</li>
        </ol>
        <code data-testid="adms-url" dir="ltr" className="mt-2 block overflow-x-auto rounded-lg bg-white px-3 py-2 text-[11px] text-brand-700">
          {admsUrl}
        </code>
        <p className="mt-1.5 text-[11px] text-brand-700">
          ③ الجهاز سيتصل تلقائياً وتصل بصماته فوراً إلى دفتر الموارد البشرية — «آخر اتصال» يتحدث عند نجاح الربط
        </p>
      </div>

      {formOpen && (
        <form onSubmit={(e) => void submit(e)} noValidate data-testid="device-form"
              className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="dev-mode" className={label}>نمط المصدر</label>
              <select id="dev-mode" data-testid="device-mode" className={field} value={mode}
                onChange={(e) => { setMode(e.target.value as BiometricMode); setConfig({}) }}>
                {BIOMETRIC_MODES.map((m) => <option key={m} value={m}>{BIOMETRIC_MODE_LABELS[m]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dev-sn" className={label}>{mode === 'adms_push' ? 'الرقم التسلسلي (SN)' : 'معرّف المصدر (فريد)'}</label>
              <input id="dev-sn" data-testid="device-sn" dir="ltr" required className={field}
                placeholder={mode === 'adms_push' ? 'CL8732103456' : 'API-VENDOR-01'} value={sn} onChange={(e) => setSn(e.target.value)} />
            </div>
            <div>
              <label htmlFor="dev-name" className={label}>الاسم</label>
              <input id="dev-name" data-testid="device-name" required className={field}
                placeholder="بصمة المدخل الرئيسي" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="dev-branch" className={label}>الفرع</label>
              <select id="dev-branch" data-testid="device-branch" className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">— بدون فرع —</option>
                {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <TimezoneField id="dev-tz" value={tz} onChange={setTz} testId="device-tz" />
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600" data-testid="mode-hint">{MODE_HINTS[mode]}</p>
          <SourceConfigFields mode={mode} value={config} onChange={setConfig} idPrefix="new" />
          {formError && <p role="alert" data-testid="device-form-error" className="text-xs font-semibold text-red-600">{formError}</p>}
          <div>
            <Button type="submit" isLoading={create.isPending} data-testid="device-submit">تسجيل المصدر</Button>
          </div>
        </form>
      )}

      {/* فلتر الأنماط */}
      <div className="flex flex-wrap gap-2" data-testid="mode-filter">
        {(['all', ...BIOMETRIC_MODES] as const).map((m) => (
          <button key={m} type="button" onClick={() => setFilterMode(m)} data-testid={`mode-filter-${m}`}
            aria-pressed={filterMode === m}
            className={clsx('rounded-full border px-3 py-1 text-xs font-semibold',
              filterMode === m ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
            {m === 'all' ? 'الكل' : BIOMETRIC_MODE_LABELS[m]} <span className="opacity-70">({counts[m] ?? 0})</span>
          </button>
        ))}
      </div>

      {isLoading && <LoadingSpinner label="جارٍ جلب المصادر…" />}
      {!isLoading && devices && devices.length === 0 && (
        <EmptyState title="لا مصادر مسجلة" hint="سجّل أول مصدر بصمة من الزر أعلاه" />
      )}

      {visible.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="devices-grid">
          {visible.map((d) => (
            <SourceCard key={d.id} device={d} branchName={branches?.find((b) => b.id === d.branch_id)?.name}
              onToggle={() => toggle.mutate({ id: d.id, active: !d.is_active })} />
          ))}
        </div>
      )}

      <PullLog />
    </section>
  )
}

// ─────────────────────────── بطاقة المصدر ───────────────────────────
function SourceCard({ device: d, branchName, onToggle }: { device: BiometricDevice; branchName?: string; onToggle: () => void }) {
  const update = useUpdateBiometricDevice()
  const test = useTestBiometricSource()
  const pull = usePullBiometric()
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<BiometricMode>(d.mode)
  const [config, setConfig] = useState<BiometricDeviceConfig>(d.config ?? {})
  const [name, setName] = useState(d.name)
  const [tz, setTz] = useState(d.timezone_offset ?? '+03:00')
  const [err, setErr] = useState<string | null>(null)
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 6 * 86400000)))
  const [to, setTo] = useState(isoDay(new Date()))
  const [testResult, setTestResult] = useState<BiometricTestResult | null>(null)

  const online = d.last_seen_at ? Date.now() - new Date(d.last_seen_at).getTime() < 2 * 60_000 : false
  const pullable = d.mode !== 'adms_push'
  const windowArgs = () => ({ deviceId: d.id, from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` })

  const save = async () => {
    setErr(null)
    const cleaned = cleanConfig(mode, config)
    const code = validateConfigLocally(mode, cleaned)
    if (code) { setErr(BIOMETRIC_ERROR_MESSAGES[code] ?? code); return }
    if (!TZ_RE.test(tz)) { setErr(BIOMETRIC_ERROR_MESSAGES.biometric_devices_tz_check ?? 'منطقة الوقت غير صالحة'); return }
    await update.mutateAsync({ id: d.id, name: name.trim() || d.name, mode, config: cleaned, timezone_offset: tz })
    setEditing(false)
  }

  return (
    <div className={clsx('rounded-2xl border bg-white p-4 shadow-sm', d.is_active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-80')}
         data-testid={`source-card-${d.serial_number}`} data-mode={d.mode}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Icon name="fingerprint" size={16} className="text-brand-600" />
            {d.name}
          </p>
          <p className="text-xs text-slate-500" dir="ltr">{d.serial_number}</p>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600" data-testid="source-mode-badge">
            {BIOMETRIC_MODE_LABELS[d.mode]}
          </span>
          <span className="ms-1 mt-1 inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700" dir="ltr" data-testid="source-tz-badge">
            UTC{d.timezone_offset ?? '+03:00'}
          </span>
        </div>
        <span className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold',
          online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
          <span className={clsx('size-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-slate-400')} />
          {online ? 'متصل' : 'غير متصل'}
        </span>
      </div>

      {pullable && d.is_active && !editing && (
        <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto_auto]" data-testid={`pull-panel-${d.serial_number}`}>
          <label className="text-[11px] text-slate-600">من
            <input type="date" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs" value={from}
              onChange={(e) => setFrom(e.target.value)} data-testid="pull-from" />
          </label>
          <label className="text-[11px] text-slate-600">إلى
            <input type="date" className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs" value={to}
              onChange={(e) => setTo(e.target.value)} data-testid="pull-to" />
          </label>
          <Button variant="secondary" size="sm" className="self-end" isLoading={test.isPending} data-testid={`test-source-${d.serial_number}`}
            onClick={() => test.mutate(windowArgs(), { onSuccess: setTestResult })}>
            اختبار الاتصال
          </Button>
          <Button size="sm" className="self-end" isLoading={pull.isPending} data-testid={`pull-now-${d.serial_number}`}
            onClick={() => pull.mutate(windowArgs())}>
            <Icon name="refresh" size={14} />
            اسحب الآن
          </Button>
          {testResult && (
            <p className="text-[11px] text-emerald-700 sm:col-span-4" data-testid="test-result">
              ✓ المصدر متاح — {testResult.available} سجلاً في النافذة
              {testResult.sample.length > 0 && ` · عينة: ${testResult.sample.map((s) => `${s.pin}@${formatDateTime(s.at)}`).join(' ، ')}`}
            </p>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3" data-testid={`edit-panel-${d.serial_number}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`e-name-${d.id}`} className={label}>الاسم</label>
              <input id={`e-name-${d.id}`} className={field} value={name} onChange={(e) => setName(e.target.value)} data-testid="edit-name" />
            </div>
            <div>
              <label htmlFor={`e-mode-${d.id}`} className={label}>النمط</label>
              <select id={`e-mode-${d.id}`} className={field} value={mode} data-testid="edit-mode"
                onChange={(e) => { setMode(e.target.value as BiometricMode); setConfig(e.target.value === d.mode ? (d.config ?? {}) : {}) }}>
                {BIOMETRIC_MODES.map((m) => <option key={m} value={m}>{BIOMETRIC_MODE_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
          <TimezoneField id={`e-tz-${d.id}`} value={tz} onChange={setTz} testId="edit-tz" />
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{MODE_HINTS[mode]}</p>
          <SourceConfigFields mode={mode} value={config} onChange={setConfig} idPrefix={`e-${d.id}`} />
          {err && <p role="alert" className="text-xs font-semibold text-red-600" data-testid="edit-error">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} isLoading={update.isPending} data-testid="edit-save">حفظ</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setMode(d.mode); setConfig(d.config ?? {}); setTz(d.timezone_offset ?? '+03:00'); setErr(null) }}>إلغاء</Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2.5">
        <span className="text-[11px] text-slate-400">
          {d.last_seen_at ? `آخر اتصال: ${formatRelative(d.last_seen_at)}` : 'لم يتصل بعد'}
          {branchName && ` · ${branchName}`}
        </span>
        <div className="flex gap-3">
          <button type="button" onClick={() => setEditing((v) => !v)} data-testid={`device-edit-${d.serial_number}`}
            className="text-[11px] font-semibold text-brand-700 hover:underline">
            {editing ? 'إغلاق التعديل' : 'الإعدادات'}
          </button>
          <button type="button" onClick={onToggle} data-testid={`device-toggle-${d.serial_number}`}
            className={d.is_active ? 'text-[11px] font-semibold text-red-600 hover:underline' : 'text-[11px] font-semibold text-emerald-600 hover:underline'}>
            {d.is_active ? 'تعطيل' : 'تفعيل'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── منطقة وقت الجهاز ───────────────────────────
function TimezoneField({ id, value, onChange, testId }: { id: string; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
      <div>
        <label htmlFor={id} className={label}>منطقة وقت الجهاز (UTC±HH:MM)</label>
        <input id={id} list={`${id}-list`} dir="ltr" className={field} value={value} data-testid={testId}
          onChange={(e) => onChange(e.target.value.trim())} placeholder="+03:00" />
        <datalist id={`${id}-list`}>{TZ_OPTIONS.map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      <p className="self-end rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
        أجهزة ZKTeco ترسل الوقت المحلي بلا منطقة — هذه القيمة هي التي تحوّله إلى وقت صحيح. بغداد = +03:00.
      </p>
    </div>
  )
}

// ─────────────────────────── سجل العمليات ───────────────────────────
const STATUS_LABEL: Record<string, string> = { success: 'ناجح', partial: 'جزئي', failed: 'فاشل' }
const STATUS_CLASS: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700', failed: 'bg-red-50 text-red-700',
}

function PullLog() {
  const { data, isLoading } = useBiometricPulls(null)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="pull-log">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Icon name="clipboard" size={16} className="text-brand-600" />
        سجل عمليات السحب والمعالجة
      </h2>
      {isLoading && <LoadingSpinner label="جارٍ جلب السجل…" />}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <p className="text-xs text-slate-500" data-testid="pull-log-empty">لا عمليات بعد — استخدم «اسحب الآن» أو «معالجة دفعات ADMS».</p>
      )}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-right text-slate-500">
              <tr>
                <th className="px-2 py-1.5">الوقت</th>
                <th className="px-2 py-1.5">المصدر</th>
                <th className="px-2 py-1.5">النمط</th>
                <th className="px-2 py-1.5">الحالة</th>
                <th className="px-2 py-1.5">مستلَم</th>
                <th className="px-2 py-1.5">جديد</th>
                <th className="px-2 py-1.5">مكرر</th>
                <th className="px-2 py-1.5">غير مطابَق</th>
                <th className="px-2 py-1.5">الخطأ</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-slate-100" data-testid={`pull-row-${p.id}`}>
                  <td className="whitespace-nowrap px-2 py-1.5">{formatDateTime(p.started_at)}</td>
                  <td className="px-2 py-1.5 font-semibold">{p.device_name}</td>
                  <td className="px-2 py-1.5">{BIOMETRIC_MODE_LABELS[p.mode as BiometricMode] ?? p.mode}</td>
                  <td className="px-2 py-1.5">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', STATUS_CLASS[p.status])}>{STATUS_LABEL[p.status] ?? p.status}</span>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{p.received}</td>
                  <td className="px-2 py-1.5 tabular-nums text-emerald-700">{p.inserted}</td>
                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{p.duplicates}</td>
                  <td className="px-2 py-1.5 tabular-nums text-amber-700">{p.unmatched}</td>
                  <td className="max-w-[16rem] truncate px-2 py-1.5 text-red-600" title={p.error ?? ''}>{p.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

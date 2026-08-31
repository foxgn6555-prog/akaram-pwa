/**
 * إنشاء كشف تأديبي — مطابق للنموذج الورقي المرفق:
 *  DB · اسم السائق · نوع الآلية · اسم المتعهد (ذاتي/مؤجر) · القاطع
 *  الشفت (ذاتي صباحي/مسائي/ليلي) · نوع الكشف (6 مخالفات + الإجراء التأديبي)
 *  تفاصيل الكشف · منظم الكشف · التاريخ.
 * عند الاختيار وملء التفاصيل: تصدير Word/طباعة أو رفع لمعاون المدير المفوض.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import { useCreateDisclosure } from '@features/disclosures'
import {
  VIOLATION_LABELS, PENALTY_LABELS, SHIFT_LABELS, CONTRACTOR_TYPES,
  type ViolationType, type PenaltyType, type Shift,
} from '@features/disclosures/types'
import { disclosureSchema, type DisclosureFormInput } from '@features/disclosures/schemas/disclosure.schema'
import { Icon } from '@components/ui/Icon/Icon'
import type { Disclosure } from '@features/disclosures/types'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** الإجراءات التأديبية الاختيارية — «التوبيخ» أُلغي (ميجريشن 00041) */
const PENALTY_OPTIONS = ['warning', 'termination'] as const

const blank = (): DisclosureFormInput => ({
  db_number: '',
  driver_name: '',
  vehicle_type: '',
  contractor_name: '',
  sector: '',
  shift: 'morning',
  log_date: todayISO(),
  violation_type: 'delay',
  penalty_type: 'warning',
  details: '',
  prepared_by_name: '',
})

export default function NewDisclosure() {
  const navigate = useNavigate()
  const create = useCreateDisclosure()
  const [form, setForm] = useState<DisclosureFormInput>(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<Disclosure | null>(null)

  const set = (key: keyof DisclosureFormInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
      setErrors((er) => ({ ...er, [key]: '' }))
    }

  const validate = (): DisclosureFormInput | null => {
    const parsed = disclosureSchema.safeParse(form)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key && !fieldErrors[key as string]) fieldErrors[key as string] = issue.message
      }
      setErrors(fieldErrors)
      return null
    }
    return parsed.data
  }

  const buildInput = (v: DisclosureFormInput) => ({
    db_number: v.db_number.trim(),
    driver_name: v.driver_name.trim(),
    vehicle_type: v.vehicle_type?.trim() || null,
    contractor_name: v.contractor_name?.trim() || null,
    sector: v.sector?.trim() || null,
    shift: v.shift as Shift,
    log_date: v.log_date,
    violation_type: v.violation_type as ViolationType,
    penalty_type: (v.penalty_type || null) as PenaltyType | null,
    details: v.details.trim(),
    prepared_by_name: v.prepared_by_name?.trim() || null,
  })

  const handleSave = (then?: (d: Disclosure) => void): void => {
    const v = validate()
    if (!v) return
    create.mutate(buildInput(v), {
      onSuccess: (d) => {
        setCreated(d)
        then?.(d)
      },
    })
  }

  const inputBase =
    'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

  return (
    <div className="space-y-5" data-testid="new-disclosure">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/disclosures/statements')}
          className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          aria-label="رجوع"
        >
          <Icon name="chevron-right" size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800">إنشاء كشف تأديبي</h1>
          <p className="text-sm text-slate-500">مطابق للنموذج الورقي — يُرفع لمعاون المدير المفوض</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); handleSave() }}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
        data-testid="disclosure-form"
      >
        {/* نوع الكشف (المخالفة) */}
        <div>
          <p className="mb-2 text-xs font-bold text-slate-600">نوع الكشف (المخالفة)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="violation-types">
            {(Object.keys(VIOLATION_LABELS) as ViolationType[]).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setForm((f) => ({ ...f, violation_type: v }))}
                data-testid={`violation-${v}`}
                className={clsx(
                  'flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-bold transition-colors',
                  form.violation_type === v
                    ? 'border-brand-500 bg-brand-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300',
                )}
              >
                {VIOLATION_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        {/* الإجراء التأديبي */}
        <div>
          <p className="mb-2 text-xs font-bold text-slate-600">الإجراء التأديبي</p>
          <div className="grid grid-cols-2 gap-2">
            {PENALTY_OPTIONS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setForm((f) => ({ ...f, penalty_type: p }))}
                data-testid={`penalty-${p}`}
                className={clsx(
                  'flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-bold transition-colors',
                  form.penalty_type === p
                    ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300',
                )}
              >
                {PENALTY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* الحقول الأساسية */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="DB (رقم الآلية)" error={errors.db_number} required>
            <input value={form.db_number} onChange={set('db_number')} data-testid="f-db"
              className={clsx(inputBase, errors.db_number && 'border-red-400')} />
          </Labeled>
          <Labeled label="اسم السائق" error={errors.driver_name} required>
            <input value={form.driver_name} onChange={set('driver_name')} data-testid="f-driver"
              className={clsx(inputBase, errors.driver_name && 'border-red-400')} />
          </Labeled>
          <Labeled label="نوع الآلية" error={errors.vehicle_type}>
            <input value={form.vehicle_type ?? ''} onChange={set('vehicle_type')} data-testid="f-vtype"
              className={inputBase} />
          </Labeled>
          <Labeled label="اسم المتعهد (نوع التشغيل)" error={errors.contractor_name}>
            <select value={form.contractor_name ?? ''} onChange={set('contractor_name')} data-testid="f-contractor" className={inputBase}>
              <option value="">— اختر —</option>
              {CONTRACTOR_TYPES.map((c) => (
                <option key={c} value={c}>{c === 'ذاتي' ? 'ذاتي (تشغيل ذاتي)' : 'مؤجر (آلية مؤجرة)'}</option>
              ))}
            </select>
          </Labeled>
          <Labeled label="القاطع" error={errors.sector}>
            <input value={form.sector ?? ''} onChange={set('sector')} data-testid="f-sector"
              className={inputBase} />
          </Labeled>
          <Labeled label="الشفت">
            <select value={form.shift} onChange={set('shift')} data-testid="f-shift" className={inputBase}>
              {(Object.keys(SHIFT_LABELS) as Shift[]).map((s) => (
                <option key={s} value={s}>● {SHIFT_LABELS[s]}</option>
              ))}
            </select>
          </Labeled>
          <Labeled label="التاريخ" required>
            <input type="date" value={form.log_date} onChange={set('log_date')} data-testid="f-date"
              className={clsx(inputBase, 'dir-ltr')} />
          </Labeled>
          <Labeled label="اسم منظم الكشف">
            <input value={form.prepared_by_name ?? ''} onChange={set('prepared_by_name')} data-testid="f-preparer"
              className={inputBase} />
          </Labeled>
        </div>

        {/* تفاصيل الكشف */}
        <Labeled label="تفاصيل الكشف" error={errors.details} required>
          <textarea
            value={form.details}
            onChange={set('details')}
            rows={6}
            data-testid="f-details"
            className={clsx(
              'w-full rounded-xl border bg-white p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
              errors.details && 'border-red-400',
            )}
            placeholder="اكتب تفاصيل المخالفة والملابسات بوضوح…"
          />
        </Labeled>

        {/* الأزرار */}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={create.isPending}
            data-testid="save-draft"
            className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Icon name="check-square" size={16} /> حفظ كمسودة
          </button>
          <button
            type="button"
            disabled={create.isPending}
            onClick={() =>
              handleSave((d) => import('@features/disclosures/lib/export').then((m) => m.toWord(d)))
            }
            data-testid="save-word"
            className="flex h-11 items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-4 text-sm font-bold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
          >
            <Icon name="download" size={16} /> حفظ وتصدير Word
          </button>
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => {
              const v = validate()
              if (!v) return
              create.mutate(buildInput(v), {
                onSuccess: (d) => {
                  // يُرفع مباشرة بعد الحفظ
                  import('@sdk/disclosures.sdk').then(({ disclosures }) =>
                    disclosures.submit(d.id).finally(() => navigate('/disclosures/statements')),
                  )
                },
              })
            }}
            data-testid="save-submit"
            className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            <Icon name="send" size={16} /> حفظ ورفع للمعاون
          </button>
        </div>

        {created && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            ✓ تم حفظ الكشف — يمكنك مراجعته في قائمة الكشوفات.
          </p>
        )}
      </form>
    </div>
  )
}

function Labeled({
  label, error, required, children,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      <span>{label} {required && <span className="text-red-500">*</span>}</span>
      {children}
      {error && <span className="text-[11px] font-normal text-red-600">{error}</span>}
    </label>
  )
}

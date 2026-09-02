/**
 * إنشاء طلب — كتاب مستلزمات قاطع رسمي:
 * اسم المسؤول تلقائي · نوع المستلزمات (نص) · العدد · إقرار التوقيع الإلكتروني · إرسال.
 * بعد الإرسال يصل الكتاب لمعاون المدير المفوض، ويمكن طباعته/تصدير Word.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import clsx from 'clsx'
import {
  useSubmitSupply, useManagerProfile, useSectors, useSupplies,
} from '@features/sector'
import { supplySchema, type SupplyFormInput } from '@features/sector'
import { SHIFT_LABELS, type SupplyRequest } from '@features/sector/types'
import { toSupplyWord, printSupplyBook } from '@features/sector/lib/supply-book'
import { Icon } from '@components/ui/Icon/Icon'
import { EmptyState } from '@components/feedback/EmptyState'

export default function NewRequestPage() {
  const navigate = useNavigate()
  const submit = useSubmitSupply()
  const profile = useManagerProfile()
  const sectors = useSectors()
  const recent = useSupplies('active')

  const [form, setForm] = useState<SupplyFormInput>({
    supply_type: '', quantity: 1 as unknown as number, notes: '', signed: false as unknown as true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<SupplyRequest | null>(null)

  const sectorNames: Record<number, string> = {}
  for (const s of sectors.data ?? []) sectorNames[s.id] = s.name
  const mySectorNames = (profile.data?.sectors ?? [])
    .map((id) => sectorNames[id] ?? `قاطع ${id}`).join('، ')

  const inputBase =
    'h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

  const set = (key: keyof SupplyFormInput, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  const validate = (): SupplyFormInput | null => {
    const parsed = supplySchema.safeParse({
      ...form,
      quantity: form.quantity === ('' as unknown as number) ? undefined : Number(form.quantity),
    })
    if (!parsed.success) {
      const er: Record<string, string> = {}
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? '')
        if (k && !er[k]) er[k] = i.message
      }
      setErrors(er)
      return null
    }
    return parsed.data
  }

  const handleSend = (then?: (r: SupplyRequest) => void): void => {
    const v = validate()
    if (!v) return
    submit.mutate(
      { supply_type: v.supply_type.trim(), quantity: v.quantity, notes: v.notes?.trim() || null, signed: true },
      { onSuccess: (r) => { setCreated(r); then?.(r) } },
    )
  }

  const list = recent.data ?? []

  return (
    <div className="space-y-5" data-testid="request-page">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/manager')} aria-label="رجوع"
          className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
          <Icon name="chevron-right" size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800">إنشاء طلب مستلزمات</h1>
          <p className="text-sm text-slate-500">كتاب رسمي يُرسل إلى معاون المدير المفوض</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); handleSend() }}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        data-testid="supply-form"
      >
        {/* بيانات ثابتة تلقائية */}
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-slate-500">مقدّم الطلب: </span>
            <b className="text-slate-800">مسؤول القاطع</b>
          </div>
          <div>
            <span className="text-slate-500">الشفت: </span>
            <b className="text-slate-800">{profile.data ? SHIFT_LABELS[profile.data.shift] : '—'}</b>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">القواطع: </span>
            <b className="text-slate-800">{mySectorNames || '—'}</b>
          </div>
        </div>

        <label className="block text-xs font-medium text-slate-600">
          نوع المستلزمات المطلوبة <span className="text-red-500">*</span>
          <input
            value={form.supply_type}
            onChange={(e) => set('supply_type', e.target.value)}
            data-testid="f-supply-type"
            placeholder="مثال: أكياس نفايات سعة 50 لتر"
            className={clsx(inputBase, 'mt-1 h-auto py-2.5', errors.supply_type && 'border-red-400')}
          />
          {errors.supply_type && <span className="mt-1 block text-[11px] text-red-600">{errors.supply_type}</span>}
        </label>

        <label className="block text-xs font-medium text-slate-600">
          العدد المطلوب <span className="text-red-500">*</span>
          <input
            type="number" min={1} inputMode="numeric"
            value={form.quantity as unknown as string}
            onChange={(e) => set('quantity', e.target.value)}
            data-testid="f-supply-qty"
            className={clsx(inputBase, 'mt-1', errors.quantity && 'border-red-400')}
          />
          {errors.quantity && <span className="mt-1 block text-[11px] text-red-600">{errors.quantity}</span>}
        </label>

        <label className="block text-xs font-medium text-slate-600">
          ملاحظات (اختياري)
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            data-testid="f-supply-notes"
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-brand-500"
          />
        </label>

        {/* التوقيع الإلكتروني — إقرار */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={form.signed as unknown as boolean}
            onChange={(e) => set('signed', e.target.checked)}
            data-testid="f-supply-sign"
            className="mt-0.5 size-5 accent-brand-600"
          />
          <span className="text-sm leading-6 text-slate-700">
            أُقرّ بصفتي مسؤول القاطع أن البيانات الواردة في هذا الطلب صحيحة وأتحمّل مسؤوليتها
            (التوقيع الإلكتروني).
          </span>
        </label>
        {errors.signed && <p className="text-[11px] text-red-600">{errors.signed}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submit.isPending}
            data-testid="supply-send"
            className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            <Icon name="send" size={16} /> {submit.isPending ? 'جارٍ الإرسال…' : 'إرسال الطلب للمعاون'}
          </button>
        </div>

        {created && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" data-testid="supply-created">
            <p className="text-sm font-bold text-emerald-800">
              ✓ أُرسل الكتاب رقم {created.ref_no} إلى معاون المدير المفوض.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => printSupplyBook(created, sectorNames)}
                data-testid="supply-print"
                className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-white"
              >
                <Icon name="printer" size={15} /> طباعة / PDF
              </button>
              <button
                type="button"
                onClick={() => toSupplyWord(created, sectorNames)}
                data-testid="supply-word"
                className="flex h-10 items-center gap-2 rounded-lg border border-brand-300 bg-brand-50 px-4 text-sm font-bold text-brand-700 hover:bg-brand-100"
              >
                <Icon name="download" size={15} /> تصدير Word
              </button>
            </div>
          </div>
        )}
      </form>

      {/* آخر الكتب المرفوعة */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">آخر الكتب المرفوعة</h2>
        {list.length === 0 ? (
          <EmptyState title="لا توجد طلبات بعد" hint="أنشئ أول كتاب مستلزمات من الأعلى" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="supply-list">
              <thead>
                <tr className="bg-slate-50/70 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">رقم الكتاب</th>
                  <th className="px-3 py-2.5 font-semibold">المستلزمات</th>
                  <th className="px-3 py-2.5 font-semibold">العدد</th>
                  <th className="px-3 py-2.5 font-semibold">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-t border-slate-50">
                    <td className="px-3 py-2.5 text-xs font-bold text-emerald-700 dir-ltr">{r.ref_no ?? '—'}</td>
                    <td className="px-3 py-2.5">{r.supply_type}</td>
                    <td className="px-3 py-2.5 font-bold dir-ltr">{r.quantity}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => printSupplyBook(r, sectorNames)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100">
                          <Icon name="printer" size={13} /> طباعة
                        </button>
                        <button type="button" onClick={() => toSupplyWord(r, sectorNames)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50">
                          <Icon name="download" size={13} /> Word
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

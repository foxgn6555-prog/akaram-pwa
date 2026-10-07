/**
 * السُّلَف — الأنواع والسياسة (التطوير المركزية · 00191)
 *  · أنواع السلف: اسم، سقف المبلغ (اختياري)، أقصى عدد أقساط، فعّال/موقوف
 *  · السياسة: أقصى نسبة للقسط الشهري من راتب الموظف · منع سلفة جديدة ما دامت سلفة مفتوحة
 *  · سلسلة الموافقات لنوع «سلفة» تُضبط من صفحة سلاسل الموافقات (الافتراضي: المعاون ثم المدير المفوض)
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Pencil, Plus } from 'lucide-react'
import clsx from 'clsx'
import { useAdvanceTypes, useSaveAdvanceType } from '@features/advances/hooks'
import { useHrPolicy, useSetHrPolicy } from '@features/hr'
import type { AdvanceType } from '@sdk/advances.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { field, fmtMoney } from '@portals/hr/components/hr-format'

export default function AdvanceTypesPage() {
  const types = useAdvanceTypes(true), save = useSaveAdvanceType()
  const [editing, setEditing] = useState<Partial<AdvanceType> | null>(null)
  return (
    <div className="space-y-5 pb-6" data-testid="it-advances">
      <header>
        <h1 className="text-lg font-black">السُّلَف — الأنواع والسياسة</h1>
        <p className="text-xs text-slate-600">غرفة العمليات تُدخل طلب السلفة لموظف باختيار نوع من هذه الأنواع، ثم يمرّ الطلب بسلسلة الموافقات، وتسلّمه المالية من القاصة وتُستقطع أقساطه تلقائياً من الراتب. اضبط سلسلة «سلفة» من <Link to="/it/user-management/approval-chains" className="font-bold text-indigo-700 underline">سلاسل الموافقات</Link>.</p>
      </header>

      <PolicyCard />

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black">أنواع السلف</h2>
          <button type="button" data-testid="adv-type-add" onClick={() => setEditing({ name: '', max_amount: null, max_installments: 12, is_active: true, sort_order: 100 })} className="flex h-9 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white"><Plus size={14} /> نوع جديد</button>
        </div>
        {types.isLoading ? <LoadingSpinner /> : (
          <ul className="mt-3 divide-y" data-testid="adv-types-list">
            {(types.data ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2" data-testid={`adv-type-${t.id}`}>
                <div className="flex-1">
                  <div className="text-sm font-black">{t.name} {!t.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">موقوف</span>}</div>
                  <div className="text-[11px] text-slate-600">سقف المبلغ: <b className="tabular-nums">{t.max_amount == null ? 'بلا سقف' : `${fmtMoney(t.max_amount)} د.ع`}</b> · أقصى عدد أقساط: <b className="tabular-nums">{t.max_installments}</b></div>
                </div>
                <button type="button" data-testid={`adv-type-edit-${t.id}`} onClick={() => setEditing(t)} className="flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-bold"><Pencil size={12} /> تعديل</button>
              </li>
            ))}
            {(types.data ?? []).length === 0 && <li className="py-6 text-center text-sm text-slate-500">لا أنواع بعد.</li>}
          </ul>
        )}
      </section>

      {editing && (
        <TypeForm initial={editing} pending={save.isPending} onCancel={() => setEditing(null)}
          onSave={(v) => save.mutate({ id: editing.id ?? null, name: v.name, maxAmount: v.max_amount, maxInstallments: v.max_installments, isActive: v.is_active, sortOrder: v.sort_order }, { onSuccess: () => setEditing(null) })} />
      )}
    </div>
  )
}

function TypeForm({ initial, pending, onSave, onCancel }: { initial: Partial<AdvanceType>; pending: boolean; onSave: (v: { name: string; max_amount: number | null; max_installments: number; is_active: boolean; sort_order: number }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial.name ?? ''), [max, setMax] = useState(initial.max_amount == null ? '' : String(initial.max_amount))
  const [inst, setInst] = useState(String(initial.max_installments ?? 12)), [active, setActive] = useState(initial.is_active ?? true), [order, setOrder] = useState(String(initial.sort_order ?? 100))
  const valid = name.trim().length >= 2 && Number(inst) >= 1 && Number(inst) <= 60 && (max.trim() === '' || Number(max) > 0)
  return (
    <form data-testid="adv-type-form" onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ name: name.trim(), max_amount: max.trim() === '' ? null : Number(max), max_installments: Number(inst), is_active: active, sort_order: Number(order) || 100 }) }}
      className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
      <h3 className="text-sm font-black">{initial.id ? 'تعديل نوع' : 'نوع سلفة جديد'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">الاسم<input data-testid="adv-type-name" value={name} onChange={(e) => setName(e.target.value)} className={clsx(field, 'mt-1 font-normal')} /></label>
        <label className="text-xs font-bold">سقف المبلغ (د.ع) — اتركه فارغاً لبلا سقف<input data-testid="adv-type-max" type="number" inputMode="numeric" min={1} value={max} onChange={(e) => setMax(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} /></label>
        <label className="text-xs font-bold">أقصى عدد أقساط (1–60)<input data-testid="adv-type-inst" type="number" inputMode="numeric" min={1} max={60} value={inst} onChange={(e) => setInst(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} /></label>
        <label className="text-xs font-bold">الترتيب<input type="number" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} /></label>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> فعّال (يظهر لغرفة العمليات)</label>
      <div className="flex gap-2">
        <button type="submit" data-testid="adv-type-save" disabled={!valid || pending} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:opacity-40">حفظ</button>
        <button type="button" onClick={onCancel} className="h-10 rounded-xl border bg-white px-4 text-sm font-bold">إلغاء</button>
      </div>
    </form>
  )
}

function PolicyCard() {
  const { data: policy } = useHrPolicy(), set = useSetHrPolicy()
  const [ratio, setRatio] = useState('50'), [block, setBlock] = useState(true)
  const pRatio = policy?.advance_max_installment_ratio, pBlock = policy?.advance_block_if_open, loaded = !!policy
  useEffect(() => { if (loaded) { setRatio(String(Math.round((pRatio ?? 0.5) * 100))); setBlock(pBlock ?? true) } }, [loaded, pRatio, pBlock])
  const r = Number(ratio), valid = r >= 1 && r <= 100
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="adv-policy">
      <h2 className="text-sm font-black">سياسة السلف</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">أقصى نسبة للقسط الشهري من راتب الموظف (%)
          <input data-testid="adv-policy-ratio" type="number" inputMode="numeric" min={1} max={100} value={ratio} onChange={(e) => setRatio(e.target.value)} className={clsx(field, 'mt-1 font-normal tabular-nums')} />
          <span className="mt-1 block text-[11px] font-normal text-slate-500">يُرفض الطلب إذا تجاوز قسطه الشهري هذه النسبة (الافتراضي 50%).</span>
        </label>
        <label className="flex items-start gap-2 pt-5 text-xs font-bold"><input data-testid="adv-policy-block" type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-0.5" /> منع طلب سلفة جديدة ما دامت للموظف سلفة مفتوحة (قيد الموافقة أو لم تُسدَّد)</label>
      </div>
      <button type="button" data-testid="adv-policy-save" disabled={!valid || set.isPending} onClick={() => set.mutate({ advance_max_installment_ratio: Math.round(r) / 100, advance_block_if_open: block })}
        className="mt-3 h-10 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white disabled:opacity-40">حفظ السياسة</button>
    </section>
  )
}

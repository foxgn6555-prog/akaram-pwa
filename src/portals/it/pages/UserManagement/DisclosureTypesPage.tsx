/**
 * أنواع الكشوفات — التطوير المركزية (00170)
 * إضافة/تعطيل/تسمية الأنواع، العقوبات المسموحة لكل نوع، المبلغ الافتراضي، الترتيب. الأنواع المستخدمة لا تُحذف بل تُعطَّل.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { PENALTY_LABEL, type DisclosureType, type PenaltyKey } from '@sdk/disclosures-unit.sdk'
import { useDisclosureTypes, useSaveDisclosureType } from '@features/disclosures/unit'
import { Field } from '@features/disclosures/components/shared'
import { btnGhost, btnPrimary, inputCls } from '@features/disclosures/components/ui'

const PENALTIES = Object.keys(PENALTY_LABEL) as PenaltyKey[]
interface Draft { key: string; label: string; description: string; allowed_penalties: PenaltyKey[]; default_amount: string; min_amount: string; max_amount: string; is_active: boolean; sort_order: number }
const empty = (n: number): Draft => ({ key: '', label: '', description: '', allowed_penalties: ['warning', 'reprimand'], default_amount: '', min_amount: '', max_amount: '', is_active: true, sort_order: n })
const fromType = (t: DisclosureType): Draft => ({ key: t.key, label: t.label, description: t.description ?? '', allowed_penalties: t.allowed_penalties, default_amount: t.default_amount != null ? String(t.default_amount) : '', min_amount: t.min_amount != null ? String(t.min_amount) : '', max_amount: t.max_amount != null ? String(t.max_amount) : '', is_active: t.is_active, sort_order: t.sort_order })

export default function DisclosureTypesPage() {
  const types = useDisclosureTypes(); const save = useSaveDisclosureType()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [isNew, setIsNew] = useState(false)
  const list = types.data ?? []
  const keyOk = /^[a-z][a-z0-9_]{1,39}$/.test(draft?.key ?? '')
  const submit = () => {
    if (!draft || !keyOk || !draft.label.trim()) return
    save.mutate({ key: draft.key, label: draft.label.trim(), description: draft.description.trim() || null, allowed_penalties: draft.allowed_penalties, default_amount: draft.default_amount.trim() === '' ? null : Number(draft.default_amount), min_amount: draft.min_amount.trim() === '' ? null : Number(draft.min_amount), max_amount: draft.max_amount.trim() === '' ? null : Number(draft.max_amount), is_active: draft.is_active, sort_order: draft.sort_order }, { onSuccess: () => setDraft(null) })
  }
  return (
    <div className="space-y-4" data-testid="disclosure-types-page">
      <header className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-lg font-black text-slate-800">أنواع الكشوفات</h1><p className="text-xs text-slate-500">تظهر لغرفة العمليات عند إنشاء كشف. حدّد العقوبات المسموحة والمبلغ الافتراضي لكل نوع.</p></div>
        <button type="button" className={clsx(btnPrimary, 'ms-auto')} data-testid="type-new" onClick={() => { setIsNew(true); setDraft(empty((list.at(-1)?.sort_order ?? 0) + 10)) }}>+ نوع جديد</button>
      </header>

      {draft && (
        <form className="grid gap-3 rounded-2xl border-2 border-brand-200 bg-brand-50/30 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit() }} data-testid="type-form">
          <Field label="الرمز (إنجليزي — ثابت)" hint="حروف صغيرة/أرقام/شرطة سفلية، مثل: speeding"><input className={clsx(inputCls, draft.key && !keyOk && 'border-rose-400')} dir="ltr" value={draft.key} disabled={!isNew} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase() })} data-testid="type-key" /></Field>
          <Field label="الاسم الظاهر"><input className={inputCls} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} data-testid="type-label" /></Field>
          <div className="sm:col-span-2"><Field label="وصف/إرشاد (اختياري)"><input className={inputCls} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="type-desc" /></Field></div>
          <Field label="المبلغ الافتراضي (د.ع — اختياري)"><input className={inputCls} dir="ltr" inputMode="numeric" value={draft.default_amount} onChange={(e) => setDraft({ ...draft, default_amount: e.target.value.replace(/[^\d.]/g, '') })} data-testid="type-amount" /></Field>
          <Field label="الحد الأدنى للمبلغ (د.ع — اختياري)"><input className={inputCls} dir="ltr" inputMode="numeric" value={draft.min_amount} onChange={(e) => setDraft({ ...draft, min_amount: e.target.value.replace(/[^\d.]/g, '') })} data-testid="type-min-amount" /></Field>
          <Field label="الحد الأقصى للمبلغ (د.ع — اختياري؛ أي مبلغ يحدده المعاون أو المدير خارج الحدين يُرفض)"><input className={inputCls} dir="ltr" inputMode="numeric" value={draft.max_amount} onChange={(e) => setDraft({ ...draft, max_amount: e.target.value.replace(/[^\d.]/g, '') })} data-testid="type-max-amount" /></Field>
          <Field label="الترتيب"><input className={inputCls} dir="ltr" type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} /></Field>
          <div>
            <span className="mb-1 block text-xs font-bold text-slate-600">العقوبات المسموحة</span>
            <div className="flex flex-wrap gap-2">{PENALTIES.map((p) => { const on = draft.allowed_penalties.includes(p); return <button key={p} type="button" aria-pressed={on} data-testid={`pen-${p}`} onClick={() => setDraft({ ...draft, allowed_penalties: on ? draft.allowed_penalties.filter((x) => x !== p) : [...draft.allowed_penalties, p] })} className={clsx('h-9 rounded-xl border px-3 text-xs font-bold', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white')}>{PENALTY_LABEL[p]}</button> })}</div>
          </div>
          <label className="flex items-center gap-2 self-end text-sm font-bold"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} data-testid="type-active" /> فعّال (يظهر لغرفة العمليات)</label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={btnPrimary} disabled={save.isPending || !keyOk || !draft.label.trim()} data-testid="type-save">حفظ</button>
            <button type="button" className={btnGhost} onClick={() => setDraft(null)}>إلغاء</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm" data-testid="types-table">
          <thead className="bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">الاسم</th><th className="px-3 py-2">الرمز</th><th className="px-3 py-2">العقوبات</th><th className="px-3 py-2">المبلغ الافتراضي</th><th className="px-3 py-2">الاستخدام</th><th className="px-3 py-2">الحالة</th><th className="px-3 py-2"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((t) => (
              <tr key={t.key} className={clsx(!t.is_active && 'opacity-60')} data-testid={`type-row-${t.key}`}>
                <td className="px-3 py-2 text-xs text-slate-400">{t.sort_order}</td>
                <td className="px-3 py-2 font-bold">{t.label}{t.description ? <span className="block text-[11px] font-normal text-slate-500">{t.description}</span> : null}</td>
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">{t.key}</td>
                <td className="px-3 py-2 text-xs">{t.allowed_penalties.map((p) => PENALTY_LABEL[p]).join('، ') || '—'}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{t.default_amount ?? '—'}{(t.min_amount != null || t.max_amount != null) && <span className="block text-[10px] text-slate-500" data-testid={`type-bounds-${t.key}`}>الحدود: {t.min_amount ?? 0} – {t.max_amount ?? '∞'}</span>}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{t.used}</td>
                <td className="px-3 py-2"><span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-black', t.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{t.is_active ? 'فعّال' : 'معطّل'}</span></td>
                <td className="px-3 py-2 text-left"><div className="flex justify-end gap-1">
                  <button type="button" className="h-8 rounded-lg border px-2 text-xs font-bold" data-testid={`type-edit-${t.key}`} onClick={() => { setIsNew(false); setDraft(fromType(t)) }}>تعديل</button>
                  <button type="button" className="h-8 rounded-lg border px-2 text-xs font-bold" data-testid={`type-toggle-${t.key}`} disabled={save.isPending} onClick={() => save.mutate({ key: t.key, label: t.label, description: t.description, allowed_penalties: t.allowed_penalties, default_amount: t.default_amount, min_amount: t.min_amount, max_amount: t.max_amount, is_active: !t.is_active, sort_order: t.sort_order })}>{t.is_active ? 'تعطيل' : 'تفعيل'}</button>
                </div></td>
              </tr>
            ))}
            {!types.isLoading && list.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-sm text-slate-500">لا أنواع — أضف نوعاً</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

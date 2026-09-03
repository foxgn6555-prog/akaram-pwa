import { useState } from 'react'
import { useAssignComplaintItem, useComplaintItems, useComplaintManagers } from '@features/complaints'

export default function AssignmentPage() {
  const { data: items = [], isLoading } = useComplaintItems(false)
  const { data: managers = [] } = useComplaintManagers()
  const assign = useAssignComplaintItem()
  const [selected, setSelected] = useState<Record<string, string>>({})
  const pending = items.filter((item) => item.status === 'under_review' || item.status === 'returned')

  return (
    <section className="space-y-5" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">فرز وإسناد الشكاوى</h1>
        <p className="mt-1 text-sm text-slate-500">راجع النص المستخرج والصور، ثم اختر مسؤول القسم لكل موقع قبل الإرسال.</p>
      </header>
      {isLoading && <p className="rounded-xl bg-white p-8 text-center text-slate-500">جارٍ التحميل…</p>}
      {!isLoading && pending.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">لا توجد مواقع بانتظار الفرز والإسناد</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><strong className="text-slate-900">{item.referenceNo} — موقع {item.sequenceNo}</strong><p className="mt-1 text-xs text-slate-500">{item.sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}</p></div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">بانتظار الإسناد</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">المحلة</dt><dd>{item.neighborhood || 'تحتاج مراجعة'}</dd></div><div><dt className="text-slate-500">الزقاق</dt><dd>{item.alley || 'تحتاج مراجعة'}</dd></div></dl>
            {item.ocrText && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">النص المستخرج: {item.ocrText}</p>}
            <div className="mt-4 flex gap-2">
              <select aria-label="مسؤول القسم" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={selected[item.id] ?? ''} onChange={(e) => setSelected((old) => ({ ...old, [item.id]: e.target.value }))}>
                <option value="">اختر مسؤول القسم</option>
                {managers.map((manager) => <option key={manager.userId} value={manager.userId}>{manager.fullName}</option>)}
              </select>
              <button disabled={!selected[item.id] || assign.isPending} onClick={() => assign.mutate({ itemId: item.id, managerId: selected[item.id]! })} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">إسناد</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

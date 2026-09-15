import { useMemo, useState } from 'react'
import { ClipboardList, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import {
  useMaintenancePurchaseCreate,
  useMaintenancePurchaseDetail,
  useMaintenancePurchases,
} from '@features/vehicle-operations/hooks'
import {
  PART_CATEGORIES,
  money,
  partCategoryLabel,
  purchaseLineTotal,
  purchaseOrderSchema,
  purchaseOrderTotal,
} from '@features/vehicle-operations/purchase-schemas'
import type { MaintenancePurchaseOrder } from '@sdk/vehicle-operations.sdk'

const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(x))

interface DraftItem {
  part_category: string
  item_name: string
  quantity: string
  unit: string
  unit_price: string
}

const emptyItem = (): DraftItem => ({
  part_category: 'mechanical',
  item_name: '',
  quantity: '1',
  unit: 'قطعة',
  unit_price: '',
})

export default function MaintenancePurchasesPage() {
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const orders = useMaintenancePurchases()

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-emerald-800 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <ShoppingBag size={17} />
          كل الأسعار بالدينار العراقي — الأصناف تدخل قسمها في المخزون فوراً والمبلغ يصل الشؤون المالية
        </p>
        <h1 className="mt-2 text-2xl font-black">مشتريات قطع الصيانة</h1>
        <p className="mt-1 text-sm text-emerald-100">
          نماذج الشراء التي يملؤها أصحاب الصيانة: نوع القطعة (ميكانيكا/كهرباء/سمكرة/حدادة/أخرى) والسعر والكمية.
        </p>
      </header>

      <div className="flex items-center justify-between rounded-2xl border bg-white p-4">
        <p className="text-sm text-slate-600">
          إجمالي المبالغ المسجلة: <b className="text-emerald-800">{money(totalOf(orders.data))}</b>
        </p>
        <button
          onClick={() => setCreating(true)}
          className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 font-black text-white"
        >
          <Plus size={17} />
          أمر شراء جديد
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b bg-slate-900 text-right text-xs text-white">
              <th className="px-4 py-3 font-black">رقم الأمر</th>
              <th className="px-4 py-3 font-black">التاريخ والوقت</th>
              <th className="px-4 py-3 font-black">المورد</th>
              <th className="px-4 py-3 font-black">عدد الأصناف</th>
              <th className="px-4 py-3 font-black">الإجمالي (د.ع)</th>
              <th className="px-4 py-3 font-black">ملاحظات</th>
              <th className="px-4 py-3 font-black">عرض التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {(orders.data ?? []).map((o) => (
              <tr key={o.id} className="border-b last:border-0 odd:bg-slate-50/50">
                <td className="px-4 py-3">
                  <b className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white">
                    {o.order_number}
                  </b>
                </td>
                <td className="px-4 py-3 text-slate-600">{dt(o.created_at)}</td>
                <td className="px-4 py-3 font-bold">{o.supplier_name ?? '—'}</td>
                <td className="px-4 py-3">{o.item_count}</td>
                <td className="px-4 py-3 text-base font-black text-emerald-800">{money(o.total_amount)}</td>
                <td className="max-w-48 truncate px-4 py-3 text-xs text-slate-500">{o.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setDetailId(o.id)}
                    className="h-9 rounded-lg border border-emerald-700 px-3 text-xs font-black text-emerald-800 hover:bg-emerald-50"
                  >
                    عرض
                  </button>
                </td>
              </tr>
            ))}
            {!orders.isLoading && (orders.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  <ClipboardList className="mx-auto mb-2 text-slate-300" size={32} />
                  لا توجد أوامر شراء بعد — ابدأ بأول أمر.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && <PurchaseCreateDialog close={() => setCreating(false)} />}
      {detailId && <PurchaseDetailDialog orderId={detailId} close={() => setDetailId(null)} />}
    </section>
  )
}

function totalOf(orders?: MaintenancePurchaseOrder[]): number {
  return (orders ?? []).reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0)
}

function PurchaseCreateDialog({ close }: { close: () => void }) {
  const create = useMaintenancePurchaseCreate()
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [error, setError] = useState('')

  const parsed = useMemo(() => {
    const result = purchaseOrderSchema.safeParse({
      supplier_name: supplier,
      notes,
      items: items.map((i) => ({
        part_category: i.part_category,
        item_name: i.item_name,
        quantity: Number(i.quantity),
        unit: i.unit,
        unit_price: Number(i.unit_price),
      })),
    })
    return result
  }, [supplier, notes, items])

  const total = parsed.success
    ? purchaseOrderTotal(parsed.data.items)
    : purchaseOrderTotal(
        items
          .filter((i) => Number(i.quantity) > 0 && Number(i.unit_price) >= 0)
          .map((i) => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
      )

  const setItem = (index: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6">
        <h2 className="text-xl font-black">أمر شراء جديد</h2>
        <p className="text-xs text-slate-500">
          كل صنف يدخل قسمه في المخزون مباشرة، ويُحسب المبلغ بالدينار العراقي ويصل الشؤون المالية.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="h-11 rounded-xl border px-3"
            placeholder="اسم المورد (اختياري)"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-11 rounded-xl border px-3"
            placeholder="ملاحظات على الأمر (اختياري)"
          />
        </div>

        <h3 className="mt-5 text-sm font-black">أصناف الشراء</h3>
        <div className="mt-2 space-y-2">
          {items.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-2 items-end gap-2 rounded-2xl border bg-slate-50 p-3 sm:grid-cols-[7rem_1fr_4.5rem_4.5rem_6rem_2.5rem]"
            >
              <label className="block text-[11px] font-bold">
                نوع القطعة
                <select
                  value={item.part_category}
                  onChange={(e) => setItem(index, { part_category: e.target.value })}
                  className="mt-1 h-10 w-full rounded-xl border bg-white px-2 font-normal"
                >
                  {PART_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                value={item.item_name}
                onChange={(e) => setItem(index, { item_name: e.target.value })}
                className="h-10 rounded-xl border px-2 text-xs"
                placeholder="اسم الصنف (مثال: فلتر زيت)"
              />
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={item.quantity}
                onChange={(e) => setItem(index, { quantity: e.target.value })}
                className="h-10 rounded-xl border px-2 text-xs"
                placeholder="الكمية"
              />
              <input
                value={item.unit}
                onChange={(e) => setItem(index, { unit: e.target.value })}
                className="h-10 rounded-xl border px-2 text-xs"
                placeholder="الوحدة"
              />
              <input
                type="number"
                min="0"
                value={item.unit_price}
                onChange={(e) => setItem(index, { unit_price: e.target.value })}
                className="h-10 rounded-xl border px-2 text-xs"
                placeholder="سعر الوحدة (د.ع)"
              />
              <div className="flex h-10 items-center justify-between gap-1">
                <span className="hidden text-[10px] font-bold text-slate-500 sm:block">
                  {money(purchaseLineTotal(Number(item.quantity) || 0, Number(item.unit_price) || 0))}
                </span>
                <button
                  type="button"
                  aria-label="حذف الصنف"
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-lg border p-2 text-red-600 disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
          className="mt-2 flex h-10 items-center gap-2 rounded-xl border border-dashed px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
        >
          <Plus size={14} />
          إضافة صنف آخر
        </button>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-900 p-4 text-white">
          <span className="text-xs font-bold">إجمالي مبلغ الأمر</span>
          <b className="text-2xl">{money(total)} د.ع</b>
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
        {!parsed.success && (
          <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            {parsed.error.issues.slice(0, 4).map((issue, i) => (
              <li key={i}>• {issue.message}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={close} className="h-11 rounded-xl border">
            إلغاء
          </button>
          <button
            disabled={!parsed.success || create.isPending}
            onClick={() => {
              if (!parsed.success) return
              create.mutate(
                {
                  supplierName: supplier,
                  notes,
                  items: parsed.data.items.map((i) => ({
                    part_category: i.part_category,
                    item_name: i.item_name,
                    quantity: i.quantity,
                    unit: i.unit,
                    unit_price: i.unit_price,
                  })),
                },
                {
                  onSuccess: () => {
                    setError('')
                    close()
                  },
                  onError: (e) => setError(String(e?.message ?? e)),
                },
              )
            }}
            className="h-11 rounded-xl bg-emerald-700 font-black text-white disabled:opacity-40"
          >
            {create.isPending ? 'جارٍ الحفظ…' : 'حفظ الأمر وإدخال الأصناف المخزون'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PurchaseDetailDialog({ orderId, close }: { orderId: string; close: () => void }) {
  const detail = useMaintenancePurchaseDetail(orderId)
  const rows = detail.data ?? []
  const first = rows[0]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6">
        <div className="flex justify-between">
          <h2 className="text-lg font-black">تفاصيل أمر الشراء</h2>
          <button onClick={close}>إغلاق</button>
        </div>
        {first && (
          <p className="mt-1 text-xs text-slate-500">
            {first.order_number} · {first.supplier_name ?? 'بدون مورد'} · {dt(first.created_at)}
          </p>
        )}
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-900 text-right text-xs text-white">
              <th className="px-3 py-2 font-black">الصنف</th>
              <th className="px-3 py-2 font-black">القسم</th>
              <th className="px-3 py-2 font-black">الكمية</th>
              <th className="px-3 py-2 font-black">سعر الوحدة (د.ع)</th>
              <th className="px-3 py-2 font-black">الإجمالي (د.ع)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="px-3 py-2 font-bold">{row.item_name}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-800">
                    {partCategoryLabel(row.part_category)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.quantity.toLocaleString('ar-IQ')} {row.unit}
                </td>
                <td className="px-3 py-2">{money(row.unit_price)}</td>
                <td className="px-3 py-2 font-black text-emerald-800">{money(row.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {first && (
          <div className="mt-4 flex justify-between rounded-2xl bg-emerald-900 p-4 text-white">
            <span className="text-xs font-bold">إجمالي الأمر</span>
            <b className="text-xl">{money(first.total_amount)} د.ع</b>
          </div>
        )}
      </div>
    </div>
  )
}

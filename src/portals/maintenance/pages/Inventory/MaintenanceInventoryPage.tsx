import { useMemo, useState, type ReactNode } from 'react'
import { Boxes, PackagePlus, Search, TriangleAlert, Warehouse } from 'lucide-react'
import {
  useMaintenanceCreateInventory,
  useMaintenanceInventory,
  useMaintenanceReceiveInventory,
} from '@features/vehicle-operations/hooks'
import { PART_CATEGORIES, money, partCategoryLabel } from '@features/vehicle-operations/purchase-schemas'
import type { MaintenanceInventoryItem } from '@sdk/vehicle-operations.sdk'

const CATEGORIES = [
  { value: '', label: 'كل الأقسام' },
  ...PART_CATEGORIES,
]

export default function MaintenanceInventoryPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [receiving, setReceiving] = useState<MaintenanceInventoryItem | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const q = useMaintenanceInventory(search, category)
  const items = useMemo(() => q.data ?? [], [q.data])

  const totals = useMemo(() => {
    const t: Record<string, { items: number; quantity: number; low: number }> = {}
    for (const c of PART_CATEGORIES) t[c.value] = { items: 0, quantity: 0, low: 0 }
    for (const item of items) {
      const slot = t[item.part_category] ?? (t[item.part_category] = { items: 0, quantity: 0, low: 0 })
      slot.items += 1
      slot.quantity += Number(item.current_quantity)
      if (item.current_quantity <= item.low_stock_threshold) slot.low += 1
    }
    return t
  }, [items])

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-amber-700 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <Warehouse size={17} />
          مخزن مقسم إلى أربعة أقسام حسب نوع القطعة + قسم «أخرى»
        </p>
        <h1 className="mt-2 text-2xl font-black">مخزون قطع الصيانة</h1>
        <p className="mt-1 text-sm text-amber-100">
          القطع المتوفرة بالكميات والسعر المتوسط للوحدة — حركات الاستلام والصرف موثقة بالكامل.
        </p>
      </header>

      {/* أشرطة الأقسام */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {PART_CATEGORIES.map((c) => {
          const t = totals[c.value] ?? { items: 0, quantity: 0, low: 0 }
          return (
            <button
              key={c.value}
              onClick={() => setCategory(category === c.value ? '' : c.value)}
              className={`rounded-2xl border p-4 text-right transition ${
                category === c.value ? 'border-amber-600 bg-amber-50' : 'bg-white hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <b className="text-sm">{c.label}</b>
                {t.low > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">
                    {t.low} منخفض
                  </span>
                )}
              </div>
              <p className="mt-2 text-2xl font-black text-amber-800">
                {t.quantity.toLocaleString('ar-IQ')}
                <span className="mr-1 text-[10px] font-bold text-slate-500">وحدة متوفرة</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{t.items} صنف مسجل</p>
            </button>
          )
        })}
      </div>

      {/* البحث + الصنف الجديد */}
      <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4">
        <label className="relative min-w-64 flex-1">
          <Search className="absolute right-3 top-3 text-slate-400" size={17} />
          <input
            aria-label="بحث المخزون"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border pr-10"
            placeholder="بحث برمز الصنف أو الاسم…"
          />
        </label>
        <select
          aria-label="تصفية حسب القسم"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 rounded-xl border px-3"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate(true)}
          className="flex h-11 items-center gap-2 rounded-xl bg-amber-700 px-5 font-black text-white"
        >
          <PackagePlus size={17} />
          صنف جديد
        </button>
      </div>

      {/* الجدول الاحترافي */}
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b bg-slate-900 text-right text-xs text-white">
              <th className="px-4 py-3 font-black">رمز الصنف</th>
              <th className="px-4 py-3 font-black">اسم قطعة الغيار</th>
              <th className="px-4 py-3 font-black">القسم</th>
              <th className="px-4 py-3 font-black">الوحدة</th>
              <th className="px-4 py-3 font-black">الكمية المتوفرة</th>
              <th className="px-4 py-3 font-black">سعر الوحدة المتوسط (د.ع)</th>
              <th className="px-4 py-3 font-black">حد التنبيه</th>
              <th className="px-4 py-3 font-black">الحالة</th>
              <th className="px-4 py-3 font-black">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const low = item.current_quantity <= item.low_stock_threshold
              return (
                <tr
                  key={item.id}
                  data-testid={`inventory-${item.id}`}
                  className={`border-b last:border-0 ${low ? 'bg-red-50/60' : 'odd:bg-slate-50/50'}`}
                >
                  <td className="px-4 py-3">
                    <b className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white">{item.sku}</b>
                  </td>
                  <td className="px-4 py-3 font-bold">{item.item_name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-800">
                      {partCategoryLabel(item.part_category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                  <td className="px-4 py-3 text-lg font-black text-amber-800">
                    {item.current_quantity.toLocaleString('ar-IQ')}
                  </td>
                  <td className="px-4 py-3">{money(item.average_unit_cost)}</td>
                  <td className="px-4 py-3 text-slate-600">{item.low_stock_threshold.toLocaleString('ar-IQ')}</td>
                  <td className="px-4 py-3">
                    {low ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[11px] font-black text-red-700">
                        <TriangleAlert size={12} />
                        تحت حد التنبيه
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-700">
                        متوفر
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      data-testid={`receive-${item.id}`}
                      onClick={() => setReceiving(item)}
                      className="h-9 rounded-lg border border-amber-600 px-3 text-xs font-black text-amber-800 hover:bg-amber-50"
                    >
                      استلام كمية
                    </button>
                  </td>
                </tr>
              )
            })}
            {!q.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  <Boxes className="mx-auto mb-2 text-slate-300" size={32} />
                  لا توجد أصناف في هذا القسم.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateDialog close={() => setShowCreate(false)} />}
      {receiving && <ReceiveDialog item={receiving} close={() => setReceiving(null)} />}
    </section>
  )
}

function CreateDialog({ close }: { close: () => void }) {
  const create = useMaintenanceCreateInventory()
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('قطعة')
  const [threshold, setThreshold] = useState(0)
  const [category, setCategory] = useState('mechanical')
  return (
    <Modal title="إضافة صنف مخزون جديد" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            { sku, name, unit, threshold, category },
            { onSuccess: close },
          )
        }}
        className="space-y-3"
      >
        <label className="block text-xs font-bold">
          القسم (نوع القطعة)
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border px-3 font-normal"
          >
            {PART_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <input
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="h-11 w-full rounded-xl border px-3"
          placeholder="رمز الصنف SKU"
        />
        <input
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full rounded-xl border px-3"
          placeholder="اسم قطعة الغيار"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-11 rounded-xl border px-3"
            placeholder="الوحدة (قطعة/لتر…)"
          />
          <input
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-11 rounded-xl border px-3"
            placeholder="حد التنبيه"
          />
        </div>
        <button className="h-11 w-full rounded-xl bg-amber-700 font-black text-white">
          حفظ الصنف في {partCategoryLabel(category)}
        </button>
      </form>
    </Modal>
  )
}

function ReceiveDialog({ item, close }: { item: MaintenanceInventoryItem; close: () => void }) {
  const receive = useMaintenanceReceiveInventory()
  const [quantity, setQuantity] = useState(1)
  const [cost, setCost] = useState(0)
  const [notes, setNotes] = useState('')
  return (
    <Modal title={`استلام ${item.item_name}`} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          receive.mutate(
            { itemId: item.id, quantity, unitCost: cost, notes },
            { onSuccess: close },
          )
        }}
        className="space-y-3"
      >
        <p className="rounded-xl bg-amber-50 p-3 text-xs">
          القسم: <b>{partCategoryLabel(item.part_category)}</b> · المتوفر حالياً:{' '}
          <b>{item.current_quantity.toLocaleString('ar-IQ')} {item.unit}</b>
        </p>
        <input
          aria-label="الكمية المستلمة"
          type="number"
          min="0.001"
          step="0.001"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="h-11 w-full rounded-xl border px-3"
          placeholder="الكمية المستلمة"
        />
        <input
          aria-label="كلفة الوحدة"
          type="number"
          min="0"
          value={cost}
          onChange={(e) => setCost(Number(e.target.value))}
          className="h-11 w-full rounded-xl border px-3"
          placeholder="كلفة الوحدة بالدينار العراقي"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border p-3"
          placeholder="رقم الوصل أو ملاحظات الاستلام"
        />
        <button className="h-11 w-full rounded-xl bg-amber-700 font-black text-white">
          تأكيد الاستلام
        </button>
      </form>
    </Modal>
  )
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6">
        <div className="mb-4 flex justify-between">
          <h2 className="text-lg font-black">{title}</h2>
          <button onClick={close}>إغلاق</button>
        </div>
        {children}
      </div>
    </div>
  )
}

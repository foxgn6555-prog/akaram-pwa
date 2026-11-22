/**
 * لوحة تعديل العنصر — الجولة ②.
 *
 * تعرض مسودة التعديل وتُدير الحفظ. **لا تحفظ شيئاً خاطئاً:** الزر معطّل
 * والأخطاء ظاهرة بالعربي قبل الضغط، والمستخدم يرى أثر تعديله على الخريطة فوراً
 * (النقاط تُسحب، والخط يُعاد رسمه).
 */
import { AlertTriangle, Check, RotateCcw, Undo2, Redo2, X } from 'lucide-react'
import { KIND_LABEL_AR, type StreetKind } from '@sdk/map-planning.sdk'
import type { EditDraft, EditError } from '../hooks/useMapEdit'
import { pathLengthM } from '../lib/geometry'

const STREET_KINDS: StreetKind[] = ['primary', 'secondary', 'tertiary', 'local']

export function EditPanel({
  draft,
  errors,
  canUndo,
  canRedo,
  valid,
  saving,
  onName,
  onKind,
  onUndo,
  onRedo,
  onCancel,
  onSave,
}: {
  draft: EditDraft
  errors: EditError[]
  canUndo: boolean
  canRedo: boolean
  valid: boolean
  saving: boolean
  onName: (v: string) => void
  onKind: (v: string) => void
  onUndo: () => void
  onRedo: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const isAlley = draft.target.kind === 'alley'
  const length = pathLengthM(draft.pts)
  const pathError = errors.find((e) => e.field === 'path')
  const nameError = errors.find((e) => e.field === 'name')

  return (
    <section className="rounded-2xl border-2 border-[#0b3d6b]/20 bg-white shadow-lg" data-testid="edit-panel">
      <header className="flex items-center justify-between gap-2 rounded-t-2xl bg-gradient-to-l from-[#0b3d6b] to-[#0b4f8a] px-3 py-2 text-white">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-blue-200">
            تعديل {isAlley ? 'زقاق' : 'شارع'}
          </div>
          <div className="truncate text-sm font-black">{draft.target.code}</div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
          aria-label="إلغاء التعديل"
        >
          <X size={14} />
        </button>
      </header>

      <div className="space-y-3 p-3">
        {/* الاسم */}
        <label className="block">
          <span className="text-[11px] font-black text-slate-600">الاسم</span>
          <input
            type="text"
            value={draft.name ?? ''}
            onChange={(e) => onName(e.target.value)}
            placeholder="بلا اسم — اكتب اسماً ليظهر في الجدول والخريطة"
            className={`mt-1 w-full rounded-xl border px-2 py-1.5 text-xs font-bold ${
              nameError ? 'border-red-400 bg-red-50' : 'border-slate-200'
            }`}
          />
          {nameError && <span className="mt-0.5 block text-[10px] font-bold text-red-600">{nameError.message}</span>}
        </label>

        {/* التصنيف — للشوارع فقط، الأزقة تُصنَّف بالمحلة */}
        {!isAlley && (
          <div>
            <span className="text-[11px] font-black text-slate-600">التصنيف</span>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {STREET_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKind(k)}
                  className={`h-7 rounded-lg text-[10px] font-black transition ${
                    draft.kind === k
                      ? 'bg-[#0b3d6b] text-white shadow'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {KIND_LABEL_AR[k]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* الطول الحي + حالة المسار */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-2 py-1.5">
          <span className="text-[11px] font-bold text-slate-500">الطول بعد التعديل</span>
          <span className={`text-sm font-black tabular-nums ${pathError ? 'text-red-600' : 'text-slate-900'}`}>
            {length.toFixed(0)} م
          </span>
        </div>
        {pathError && (
          <div className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 p-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-600" />
            <span className="text-[10px] font-bold leading-tight text-red-700">{pathError.message}</span>
          </div>
        )}

        <p className="text-[10px] leading-tight text-slate-400">
          اسحب أي نقطة زرقاء على الخريطة لتعديل المسار. النقاط التي تخرج عن حدّ الزون تُرفض.
        </p>

        {/* أزرار التاريخ والحفظ */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="تراجع"
            className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="إعادة"
            className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          >
            <Redo2 size={13} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="ms-auto inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-black text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={12} />
            إلغاء
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!valid || saving}
            data-testid="edit-save"
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-black text-white shadow hover:bg-emerald-700 disabled:opacity-40"
          >
            <Check size={13} />
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
        {!valid && errors.length > 0 && (
          <p className="text-[10px] font-bold text-red-600">أصلح الأخطاء أعلاه قبل الحفظ</p>
        )}
      </div>
    </section>
  )
}

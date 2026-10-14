/** منتقي غلاف تقرير الشكاوى — مصغرات الأغلفة (الرسمي + ملصقات المستخدم) بنفس الترتيب في الإعدادات والمحرر. */
import { Check } from 'lucide-react'
import { COMPLAINT_COVERS, coverBackgroundUrl, type ComplaintCoverId } from '@lib/pptx/complaintCovers'

export function CoverPicker({ value, onChange, disabled, label = 'غلاف التقرير' }: {
  value: ComplaintCoverId; onChange: (id: ComplaintCoverId) => void; disabled?: boolean; label?: string
}) {
  return <fieldset className="mt-3" disabled={disabled}>
    <legend className="text-xs font-bold">{label}</legend>
    <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={label}>
      {COMPLAINT_COVERS.map(cover => {
        const selected = cover.id === value
        const bg = coverBackgroundUrl(cover)
        return <button key={cover.id} type="button" role="radio" aria-checked={selected} aria-label={cover.title} onClick={() => onChange(cover.id)}
          className={`relative overflow-hidden rounded-xl border-2 text-right transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-400'}`}>
          {bg
            ? <img src={bg} alt="" className="aspect-video w-full object-cover" />
            : <div className="flex aspect-video w-full items-center justify-center bg-white p-2"><div className="h-full w-full rounded-lg border-4" style={{ borderColor: '#CF63C6' }} /></div>}
          <span className="block truncate bg-white px-2 py-1 text-[10px] font-bold text-slate-700">{cover.title}</span>
          {selected && <span className="absolute right-1 top-1 rounded-full bg-indigo-600 p-0.5 text-white"><Check size={12} /></span>}
        </button>
      })}
    </div>
  </fieldset>
}

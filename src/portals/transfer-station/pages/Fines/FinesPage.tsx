/**
 * وحدة الغرامات — المحطة التحويلية (فارغة مؤقتاً حسب المتطلبات الحالي).
 * تُبنى لاحقاً: تسجيل الغرامات المرورية/التشغيلية وربطها بسجلات الأوزان.
 */
import { Icon } from '@components/ui/Icon/Icon'

export default function FinesPage() {
  return (
    <div className="space-y-5" data-testid="fines-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">الغرامات</h1>
        <p className="text-sm text-slate-500">وحدة الغرامات بالمحطة التحويلية</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon name="alert-triangle" size={30} />
        </span>
        <p className="font-bold text-slate-700">هذه الوحدة قيد الإنشاء</p>
        <p className="max-w-sm text-sm leading-6 text-slate-500">
          سيُضاف قريباً تسجيل الغرامات وربطها بآليات وسجلات المحطة. الوحدات الحالية: الأوزان والأرشيف.
        </p>
      </div>
    </div>
  )
}

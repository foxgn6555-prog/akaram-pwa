/** معاون المدير المفوض — الرئيسية: شريط الوارد العاجل (كشوفات بانتظار الاعتماد) + ملخص الشركة المحلَّل */
import { Link } from 'react-router'
import { useDisclosureInbox } from '@features/disclosures/unit'
import { Icon } from '@components/ui/Icon/Icon'
import { ExecHome } from '@components/executive/ExecHome'
import { useDeputyMonths } from '@features/hr'

export default function DeputyHome() {
  const inbox = useDisclosureInbox()
  const incoming = inbox.data?.length ?? 0
  const months = useDeputyMonths()
  const pendingReviews = (months.data ?? []).filter((m) => m.review_status === 'pending').length   // 00248
  return (
    <div className="space-y-4" data-testid="deputy-dashboard">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="deputy-tiles">
        <Link to="/deputy/statements" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm hover:bg-amber-50" data-testid="tile-statements">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-white"><Icon name="file-text" size={18} /></span>
          <span><span className="block text-xs font-bold text-slate-700">وارد الكشوفات</span><span className="text-[11px] text-slate-500">{incoming} بانتظار الاعتماد</span></span>
        </Link>
        <Link to="/deputy/deductions" className={pendingReviews ? 'flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-3 shadow-sm hover:bg-red-50' : 'flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50'} data-testid="tile-deductions">
          <span className={pendingReviews ? 'grid h-10 w-10 place-items-center rounded-xl bg-red-600 text-white' : 'grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white'}><Icon name="wallet" size={18} /></span>
          <span><span className="block text-xs font-bold text-slate-700">مراجعة الاستقطاعات</span><span className="text-[11px] text-slate-500">{pendingReviews ? `${pendingReviews} شهر بانتظار اعتمادك` : 'لا كشوف معلّقة'}</span></span>
        </Link>
        <Link to="/deputy/sector-supplies" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Icon name="send" size={18} /></span><span className="text-xs font-bold text-slate-700">تجهيزات القواطع</span></Link>
        <Link to="/deputy/station-folders" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Icon name="folder" size={18} /></span><span className="text-xs font-bold text-slate-700">فولدر المحطة</span></Link>
        <Link to="/deputy/data-analysis" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Icon name="bar-chart" size={18} /></span><span className="text-xs font-bold text-slate-700">تحليل البيانات</span></Link>
      </div>
      <ExecHome kind="deputy" basePath="/deputy" />
    </div>
  )
}

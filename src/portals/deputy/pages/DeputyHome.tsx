/** معاون المدير المفوض — الرئيسية: شريط الوارد العاجل (كشوفات بانتظار الاعتماد) + ملخص الشركة المحلَّل */
import { Link } from 'react-router'
import { useDisclosureList } from '@features/disclosures'
import { Icon } from '@components/ui/Icon/Icon'
import { ExecHome } from '@components/executive/ExecHome'

export default function DeputyHome() {
  const list = useDisclosureList()
  const incoming = (list.data ?? []).filter((d) => d.status === 'submitted_to_deputy').length
  return (
    <div className="space-y-4" data-testid="deputy-dashboard">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="deputy-tiles">
        <Link to="/deputy/statements" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm hover:bg-amber-50" data-testid="tile-statements">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-white"><Icon name="file-text" size={18} /></span>
          <span><span className="block text-xs font-bold text-slate-700">وارد الكشوفات</span><span className="text-[11px] text-slate-500">{incoming} بانتظار الاعتماد</span></span>
        </Link>
        <Link to="/deputy/sector-supplies" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Icon name="send" size={18} /></span><span className="text-xs font-bold text-slate-700">تجهيزات القواطع</span></Link>
        <Link to="/deputy/station-folders" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Icon name="folder" size={18} /></span><span className="text-xs font-bold text-slate-700">فولدر المحطة</span></Link>
        <Link to="/deputy/data-analysis" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><Icon name="bar-chart" size={18} /></span><span className="text-xs font-bold text-slate-700">تحليل البيانات</span></Link>
      </div>
      <ExecHome kind="deputy" basePath="/deputy" />
    </div>
  )
}

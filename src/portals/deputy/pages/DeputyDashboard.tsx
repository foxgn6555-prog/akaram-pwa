/**
 * لوحة معاون المدير المفوض — الوارد الحالي (كشوفات للاعتماد).
 */
import { useNavigate } from 'react-router'
import { useDisclosureList } from '@features/disclosures'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

export default function DeputyDashboard() {
  const navigate = useNavigate()
  const list = useDisclosureList()
  const incoming = (list.data ?? []).filter((d) => d.status === 'submitted_to_deputy').length

  const tiles: Array<{ path: string; label: string; hint: string; icon: IconName }> = [
    { path: '/deputy/statements', label: 'وارد الكشوفات', hint: `${incoming} بانتظار الاعتماد`, icon: 'file-text' },
  ]

  return (
    <div className="space-y-5" data-testid="deputy-dashboard">
      <div>
        <h1 className="text-lg font-bold text-slate-800">معاون المدير المفوض</h1>
        <p className="text-sm text-slate-500">استقبال واعتماد الكشوفات الواردة</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="deputy-tiles">
        {tiles.map((t) => (
          <button
            key={t.path}
            onClick={() => navigate(t.path)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon name={t.icon} size={24} />
            </span>
            <span className="text-sm font-bold text-slate-800">{t.label}</span>
            <span className="text-xs text-slate-500">{t.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

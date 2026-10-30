/**
 * ورش الصيانة — التطوير المركزية (00274)
 * الورشتان (المركزية / صيانة قاطع الزعفرانية): عدد الحسابات والحالات المفتوحة، تفعيل/إيقاف الفرعية، وحسابات الصيانة بورشة كلٍّ منها مع رابط تفاصيل المستخدم (حيث يُغيَّر الإسناد).
 */
import clsx from 'clsx'
import { Link } from 'react-router'
import { useMaintenanceWorkshopAccounts, useMaintenanceWorkshops, useSetMaintenanceWorkshopActive } from '@features/maintenance-workshops/hooks'
import { parentSectorTitle } from '@sdk/sectors.sdk'

export default function MaintenanceWorkshopsPage() {
  const workshops = useMaintenanceWorkshops(), accounts = useMaintenanceWorkshopAccounts(), setActive = useSetMaintenanceWorkshopActive()
  const list = workshops.data ?? [], rows = accounts.data ?? []
  return (
    <div className="space-y-4" data-testid="maintenance-workshops-page">
      <header>
        <h1 className="text-lg font-black text-slate-800">ورش الصيانة</h1>
        <p className="text-xs text-slate-500">كل حساب صيانة يعمل داخل ورشة واحدة (الافتراضي: المركزية). آليات قاطع الزعفرانية تُوجَّه تلقائياً إلى ورشته ما دامت فعّالة؛ عند إيقافها تعود حساباتها وتوجيهها إلى المركزية. يُغيَّر إسناد الحساب من صفحة تفاصيل المستخدم.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2" data-testid="workshops-grid">
        {list.map((w) => (
          <section key={w.key} className={clsx('rounded-2xl border bg-white p-4 shadow-sm', w.is_active ? 'border-amber-200' : 'border-slate-200 opacity-80')} data-testid={`workshop-${w.key}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-black">{w.name}</h2>
                <p className="text-[11px] text-slate-500">{w.parent_sector ? parentSectorTitle(w.parent_sector) : 'كل القواطع غير المسندة لورشة أخرى'}</p>
              </div>
              <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', w.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700')} data-testid={`workshop-status-${w.key}`}>{w.is_active ? 'فعّالة' : 'موقوفة'}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-2"><dt className="text-slate-500">الحسابات</dt><dd className="text-lg font-black" data-testid={`workshop-accounts-${w.key}`}>{w.accounts}</dd></div>
              <div className="rounded-xl bg-slate-50 p-2"><dt className="text-slate-500">حالات مفتوحة</dt><dd className="text-lg font-black" data-testid={`workshop-open-${w.key}`}>{w.open_cases}</dd></div>
            </dl>
            {w.key !== 'central' && (
              <button type="button" data-testid={`workshop-toggle-${w.key}`} disabled={setActive.isPending || (w.is_active && w.open_cases > 0)}
                title={w.is_active && w.open_cases > 0 ? 'لا يمكن إيقاف ورشة لديها حالات مفتوحة' : undefined}
                onClick={() => { if (w.is_active && !window.confirm(`إيقاف «${w.name}»؟ ستعمل حساباتها كالمركزية ويعود توجيه قاطعها إلى المركزية.`)) return; setActive.mutate({ key: w.key, isActive: !w.is_active }) }}
                className={clsx('mt-3 h-10 w-full rounded-xl text-xs font-black disabled:opacity-40', w.is_active ? 'border border-rose-300 text-rose-700' : 'bg-emerald-600 text-white')}>
                {w.is_active ? 'إيقاف الورشة' : 'تفعيل الورشة'}
              </button>
            )}
          </section>
        ))}
      </div>

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-900 text-right text-xs text-white">{['الحساب', 'البريد', 'القسم', 'الورشة', 'الإسناد', ''].map((h, i) => <th key={i} className="px-3 py-3 font-black">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b odd:bg-slate-50/50" data-testid={`account-${r.user_id}`}>
                <td className="px-3 py-2 font-bold">{r.display_name}</td>
                <td className="px-3 py-2 text-xs text-slate-600" dir="ltr">{r.email}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{r.department_name ?? '—'}</td>
                <td className="px-3 py-2 text-xs"><span className={clsx('rounded-full px-2 py-0.5 font-black', r.workshop_key === 'central' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800')}>{r.workshop_name}</span></td>
                <td className="px-3 py-2 text-xs text-slate-500">{r.explicit ? 'مُسند' : 'افتراضي'}</td>
                <td className="px-3 py-2 text-xs"><Link to={`/it/user-management/${r.user_id}`} className="font-bold text-brand-700 underline" data-testid={`account-link-${r.user_id}`}>تغيير الورشة</Link></td>
              </tr>
            ))}
            {!accounts.isLoading && !rows.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-500">لا حسابات صيانة بعد.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  )
}

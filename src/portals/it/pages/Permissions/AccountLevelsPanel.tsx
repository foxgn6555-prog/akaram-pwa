/**
 * الجولة ٦ — صلاحيات الصفحات لكل حساب بثلاثة مستويات.
 *  · «كامل» = عرض وإنشاء وتعديل · «إنشاء» = عرض وإنشاء فقط · «عرض فقط» = لا كتابة.
 *  · السقف يُطبَّق في الخادم داخل app.can ⇒ كل دوال الكتابة وmy_permissions تراه فوراً.
 *  · السقف يقيّد فقط ولا يمنح: وحدة لا يراها الحساب من دوره تبقى غير متاحة.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, Search, ShieldCheck, UserCog } from 'lucide-react'
import { users } from '@sdk/users.sdk'
import type { PageLevel } from '@sdk/permissions.sdk'
import {
  useAccountLevels,
  useClearAccountLevel,
  useSetAccountLevel,
} from '@features/permissions'

const LEVEL_LABEL: Record<PageLevel, string> = { full: 'كامل', create: 'إنشاء', view: 'عرض فقط' }
const LEVEL_HINT: Record<PageLevel, string> = {
  full: 'عرض + إنشاء + تعديل/اعتماد',
  create: 'عرض + إنشاء، بلا تعديل',
  view: 'عرض فقط، بلا أي كتابة',
}
const PORTAL_LABEL: Record<string, string> = {
  employee: 'الموظف',
  hr: 'الموارد البشرية',
  manager: 'مدير القاطع',
  finance: 'المالية',
  it: 'تقنية المعلومات',
  admin: 'الإدارة',
  'field-ops': 'الميدان',
  'admin-ops': 'الإدارة والمعاون',
  maintenance: 'الصيانة',
  'transfer-station': 'الحولات',
  executive: 'المدير التنفيذي',
  deputy: 'المعاون',
  'ops-room': 'غرفة العمليات',
  complaints: 'الشكاوى',
  media: 'الإعلام',
  'central-garage': 'الكراج المركزي',
  'follow-up': 'المتابعة',
}

export function AccountLevelsPanel() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [userId, setUserId] = useState('')
  const [portal, setPortal] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const setLevel = useSetAccountLevel()
  const clearLevel = useClearAccountLevel()

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(id)
  }, [query])

  const results = useQuery({
    queryKey: ['permissions', 'account-search', debounced],
    queryFn: () => users.list(debounced || undefined),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })

  const levels = useAccountLevels(userId)
  const rows = useMemo(() => {
    const all = levels.data ?? []
    const base = showAll ? all : all.filter((r) => r.accessible)
    return portal === 'all' ? base : base.filter((r) => r.portal === portal)
  }, [levels.data, portal, showAll])

  const portals = useMemo(() => {
    const set = new Set((levels.data ?? []).filter((r) => showAll || r.accessible).map((r) => r.portal))
    return ['all', ...[...set].sort()]
  }, [levels.data, showAll])

  const chosen = (results.data ?? []).find((u) => u.id === userId) ?? null
  const counts = useMemo(() => {
    const c = { full: 0, create: 0, view: 0 }
    for (const r of levels.data ?? []) if (r.accessible) c[r.effective] += 1
    return c
  }, [levels.data])

  const busy = setLevel.isPending || clearLevel.isPending

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="account-levels">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Lock size={17} />
        </span>
        <div>
          <h2 className="text-sm font-black text-slate-800">صلاحيات الصفحات لكل حساب — ثلاثة مستويات</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            السقف يُنفَّذ في الخادم: كل دوال الكتابة ترفض ما يتجاوز المستوى المختار، والواجهة تُخفي الأزرار تلقائياً.
            السقف يقيّد ولا يمنح — لا يفتح لحساب صفحة لا يراها من دوره.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_1fr]">
        <div>
          <label htmlFor="level-user-search" className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <Search size={13} /> ابحث عن الحساب (بريد أو اسم)
          </label>
          <input
            id="level-user-search"
            data-testid="level-user-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثال: employee@akram.iq"
            className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs"
            dir="ltr"
          />
          {debounced.length >= 2 && (
            <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100" data-testid="level-user-results">
              {(results.data ?? []).slice(0, 12).map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => { setUserId(u.id); setPortal('all') }}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-[11px] hover:bg-slate-50 ${u.id === userId ? 'bg-brand-50' : ''}`}
                  >
                    <span className="font-bold text-slate-800" dir="ltr">{u.email ?? u.id}</span>
                    <span className="text-slate-500">
                      {u.employee_name ?? 'بلا سجل موظف'}
                      {u.roles.length > 0 ? ` · ${u.roles.join(' · ')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {(results.data ?? []).length === 0 && (
                <li className="px-3 py-3 text-[11px] text-slate-400">لا نتائج</li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          {!userId ? (
            <p className="py-6 text-center text-[11px] text-slate-500">
              اختر حساباً لعرض وحداته وضبط سقف كل صفحة.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700">
                <UserCog size={13} className="text-brand-700" />
                <span dir="ltr">{chosen?.email ?? userId}</span>
              </p>
              <p className="flex flex-wrap gap-2 text-[10px]">
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">كامل {counts.full}</span>
                <span className="rounded-md bg-sky-100 px-2 py-0.5 font-bold text-sky-900">إنشاء {counts.create}</span>
                <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-900">عرض {counts.view}</span>
              </p>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                إظهار الوحدات التي لا يراها الحساب أيضاً (للمراجعة فقط)
              </label>
            </div>
          )}
        </div>
      </div>

      {userId && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {portals.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPortal(p)}
                aria-pressed={portal === p}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${portal === p ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700'}`}
              >
                {p === 'all' ? 'كل البوابات' : PORTAL_LABEL[p] ?? p}
              </button>
            ))}
          </div>

          {levels.isLoading ? (
            <p className="py-6 text-center text-xs text-slate-400">جارٍ التحميل…</p>
          ) : levels.isError ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-800" role="alert">
              تعذّر تحميل وحدات الحساب — تأكد من صلاحية تقنية المعلومات.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">لا وحدات في هذا التصنيف.</p>
          ) : (
            <ul className="divide-y divide-slate-100" data-testid="level-rows">
              {rows.map((r) => (
                <li key={r.unit_key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
                      {r.label}
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {LEVEL_LABEL[r.effective]}
                      </span>
                      {!r.accessible && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">لا وصول</span>
                      )}
                      {r.stored === null && (
                        <span className="text-[10px] font-normal text-slate-400">بلا سقف (افتراضي)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400" dir="ltr">{r.unit_key}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['full', 'create', 'view'] as PageLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        title={LEVEL_HINT[lvl]}
                        disabled={busy || (r.stored === lvl)}
                        onClick={() => setLevel.mutate({ userId, unit: r.unit_key, level: lvl })}
                        className={`rounded-lg px-2 py-1 text-[10px] font-bold disabled:opacity-40 ${
                          r.effective === lvl ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {LEVEL_LABEL[lvl]}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy || r.stored === null}
                      onClick={() => clearLevel.mutate({ userId, unit: r.unit_key })}
                      className="rounded-lg px-2 py-1 text-[10px] font-bold text-rose-700 disabled:opacity-30 hover:bg-rose-50"
                    >
                      إزالة
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[10px] leading-5 text-emerald-900">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            حسابات تقنية المعلومات لا يقيّدها السقف (هي مصدر الضبط). كل تعديل يُدوَّن في سجل تدقيق الصلاحيات باسم منفّذه.
          </p>
        </>
      )}
    </section>
  )
}

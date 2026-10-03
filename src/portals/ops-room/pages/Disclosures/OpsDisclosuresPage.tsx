/**
 * وحدة الكشوفات — غرفة العمليات (00170)
 *  التبويبات (?tab=): لوحة · الكشوفات (النشطة) · كشف جديد · المُعادة · الأرشيف (معتمد/ملغى)
 *  كل حسابات غرفة العمليات ترى كل الكشوفات؛ كل إجراء يُسجَّل باسم فاعله تلقائياً.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import type { DisclosureScope, DisclosureV2 } from '@sdk/disclosures-unit.sdk'
import { DISCLOSURE_STATUS_LABEL } from '@sdk/disclosures-unit.sdk'
import { useDisclosureStats, useDisclosureTypes, useDisclosuresList } from '@features/disclosures/unit'
import { DisclosureTable } from '@features/disclosures/components/shared'
import { fmtIqd, inputCls } from '@features/disclosures/components/ui'
import { DisclosureDetailDrawer } from '@features/disclosures/components/DisclosureDetailDrawer'
import { DisclosureForm } from '@features/disclosures/components/DisclosureForm'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

type Tab = 'dashboard' | 'list' | 'new' | 'returned' | 'archive'
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'اللوحة', icon: 'bar-chart' }, { key: 'list', label: 'الكشوفات', icon: 'file-text' }, { key: 'new', label: 'كشف جديد', icon: 'clipboard' },
  { key: 'returned', label: 'المُعادة', icon: 'alert-triangle' }, { key: 'archive', label: 'الأرشيف', icon: 'archive-box' },
]
const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function OpsDisclosuresPage() {
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'dashboard') as Tab
  const setTab = (t: Tab, extra?: Record<string, string>) => { const n = new URLSearchParams(extra ?? {}); n.set('tab', t); setSp(n) }
  const [openId, setOpenId] = useState<string | null>(sp.get('id'))
  const [editing, setEditing] = useState<DisclosureV2 | null>(null)
  const stats = useDisclosureStats(null)
  const returnedCount = stats.data?.by_status.returned ?? 0

  return (
    <div className="space-y-4" data-testid="ops-disclosures">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-800">وحدة الكشوفات</h1>
          <p className="text-xs text-slate-500">كشوفات المخالفات على الآليات والموظفين → معاون المدير المفوض → المدير المفوض → استقطاع تلقائي في الحضورية</p>
        </div>
        <button type="button" className="ms-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-black text-white shadow-sm hover:bg-brand-700" onClick={() => { setEditing(null); setTab('new') }} data-testid="new-disclosure-btn"><Icon name="file-text" size={16} /> كشف جديد</button>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1" role="tablist" data-testid="disc-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-testid={`tab-${t.key}`} onClick={() => { setEditing(null); setTab(t.key) }}
            className={clsx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-black', tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}>
            <Icon name={t.icon} size={14} />{t.label}
            {t.key === 'returned' && returnedCount > 0 ? <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{returnedCount}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && <Dashboard onOpen={setOpenId} goTo={setTab} />}
      {tab === 'list' && <ListTab scope="active" onOpen={setOpenId} testId="list-active" />}
      {tab === 'returned' && <ListTab scope="returned" onOpen={setOpenId} testId="list-returned" emptyText="لا توجد كشوفات مُعادة — ممتاز" />}
      {tab === 'archive' && <ListTab scope="archive" onOpen={setOpenId} testId="list-archive" archive />}
      {tab === 'new' && (
        <div className="max-w-4xl">
          <h2 className="mb-2 text-sm font-black text-slate-700">{editing ? `تعديل الكشف ${editing.ref_no ?? ''}` : 'كشف جديد'}</h2>
          <DisclosureForm key={editing?.id ?? 'new'} initial={editing} onCancel={() => { setEditing(null); setTab('list') }}
            onSaved={(d) => { setEditing(null); setTab(d.status === 'draft' ? 'list' : 'list'); setOpenId(d.id) }} />
        </div>
      )}

      <DisclosureDetailDrawer id={openId} onClose={() => setOpenId(null)} opsMode onEdit={(d) => { setOpenId(null); setEditing(d); setTab('new') }} />
    </div>
  )
}

function ListTab({ scope, onOpen, testId, emptyText, archive }: { scope: DisclosureScope; onOpen: (id: string) => void; testId: string; emptyText?: string; archive?: boolean }) {
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [status, setStatus] = useState(''); const [month, setMonth] = useState(archive ? thisMonth() : '')
  const types = useDisclosureTypes()
  const list = useDisclosuresList({ scope, q: q || null, type: type || null, month: month || null })
  const rows = useMemo(() => (list.data ?? []).filter((d) => !status || d.status === status), [list.data, status])
  const statuses = scope === 'active' ? ['draft', 'pending', 'returned'] : scope === 'archive' ? ['approved', 'cancelled'] : []
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-4" data-testid={`${testId}-filters`}>
        <input className={inputCls} placeholder="بحث: رقم الكشف / DB / اسم…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="filter-q" />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)} data-testid="filter-type"><option value="">كل الأنواع</option>{(types.data ?? []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        {statuses.length > 0 ? <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)} data-testid="filter-status"><option value="">كل الحالات</option>{statuses.map((s) => <option key={s} value={s}>{DISCLOSURE_STATUS_LABEL[s as keyof typeof DISCLOSURE_STATUS_LABEL]}</option>)}</select> : <span />}
        <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} data-testid="filter-month" dir="ltr" />
      </div>
      <div className="text-xs text-slate-500">{list.isLoading ? 'جارٍ التحميل…' : `${rows.length} كشف`}</div>
      <DisclosureTable rows={rows} onOpen={(d) => onOpen(d.id)} testId={testId} emptyText={emptyText} />
    </div>
  )
}

function Dashboard({ onOpen, goTo }: { onOpen: (id: string) => void; goTo: (t: Tab) => void }) {
  const [month, setMonth] = useState(thisMonth())
  const stats = useDisclosureStats(month)
  const recent = useDisclosuresList({ scope: 'active', limit: 8 })
  const s = stats.data
  const tiles: { k: string; v: string | number; tone: string; tab?: Tab }[] = [
    { k: 'كشوفات الشهر', v: s?.total ?? '…', tone: 'bg-slate-900 text-white', tab: 'list' },
    { k: 'قيد الموافقة', v: s?.by_status.pending ?? 0, tone: 'bg-amber-50 text-amber-800', tab: 'list' },
    { k: 'مُعادة للتصحيح', v: s?.by_status.returned ?? 0, tone: 'bg-rose-50 text-rose-700', tab: 'returned' },
    { k: 'معتمدة', v: s?.by_status.approved ?? 0, tone: 'bg-emerald-50 text-emerald-700', tab: 'archive' },
    { k: 'مبالغ معتمدة', v: fmtIqd(s?.amount_approved ?? 0), tone: 'bg-white text-slate-800 border border-slate-200' },
    { k: 'استقطاعات مُضافة للحضورية', v: s?.deductions_posted ?? 0, tone: 'bg-white text-slate-800 border border-slate-200' },
  ]
  return (
    <div className="space-y-4" data-testid="disc-dashboard">
      <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-500">الشهر</span><input type="month" className={clsx(inputCls, 'w-44')} value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" data-testid="dash-month" /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="disc-tiles">
        {tiles.map((t) => (
          <button key={t.k} type="button" onClick={() => t.tab && goTo(t.tab)} className={clsx('rounded-2xl p-3 text-right shadow-sm', t.tone)}>
            <div className="text-[11px] font-bold opacity-80">{t.k}</div><div className="mt-1 text-xl font-black tabular-nums">{t.v}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-black text-slate-500">حسب النوع</h3>
          <ul className="space-y-1.5">
            {(s?.by_type ?? []).map((t) => { const max = Math.max(1, ...(s?.by_type ?? []).map((x) => x.count)); return (
              <li key={t.key} className="text-xs"><div className="flex justify-between"><span className="font-bold text-slate-700">{t.label}</span><span className="tabular-nums">{t.count}</span></div><div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-brand-500" style={{ width: `${(t.count / max) * 100}%` }} /></div></li>) })}
            {(s?.by_type ?? []).length === 0 ? <li className="text-xs text-slate-400">لا كشوفات هذا الشهر</li> : null}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-black text-slate-500">حسب مُعدّ الكشف (كل حسابات غرفة العمليات)</h3>
          <ul className="divide-y divide-slate-100">{(s?.by_preparer ?? []).map((p, i) => <li key={i} className="flex justify-between py-1 text-xs"><span className="font-bold">{p.name ?? '—'}</span><span className="tabular-nums">{p.count}</span></li>)}</ul>
        </section>
      </div>
      <section>
        <h3 className="mb-2 text-xs font-black text-slate-500">آخر الكشوفات النشطة</h3>
        <DisclosureTable rows={recent.data ?? []} onOpen={(d) => onOpen(d.id)} testId="recent" emptyText="لا كشوفات نشطة — أنشئ كشفاً جديداً" />
      </section>
    </div>
  )
}

/**
 * وحدة الكشوفات — مشتركة (00170 / 00206)
 *  mode='ops'    غرفة العمليات: كشوفات على الآليات والموظفين، كل الحسابات ترى الكل.
 *  mode='garage' الكراج المركزي: كشوفات على موظفي قسم الكراج فقط (النطاق يُفرض في قاعدة البيانات).
 *  mode='station' المحطة التحويلية (00214): كشوفات على موظفي قسم المحطة فقط — نفس آلية الكراج.
 *  mode='sector' مسؤول القاطع (00210): كشوفات على الموظفين المرتبطين به فقط (مسؤولو أقسام/متعهدو قواطعه + من مديرهم المباشر هو).
 *  التبويبات (?tab=): لوحة · الكشوفات (النشطة) · كشف جديد · المُعادة · الأرشيف (معتمد/ملغى) · التقارير
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import clsx from 'clsx'
import type { DisclosureScope, DisclosureStatusV2, DisclosureV2 } from '@sdk/disclosures-unit.sdk'
import { DisclosureFilters } from '@features/disclosures/components/DisclosureFilters'
import { EMPTY_FILTERS, applyClientFilters, toServerFilter, type UiFilters } from '@features/disclosures/lib/filters'
import { printDisclosureForm } from '@features/disclosures/lib/export-v2'
import { useDisclosureStats, useDisclosureTypes, useDisclosuresList } from '@features/disclosures/unit'
import { DisclosureTable } from '@features/disclosures/components/shared'
import { fmtIqd, inputCls } from '@features/disclosures/components/ui'
import { DisclosureDetailDrawer } from '@features/disclosures/components/DisclosureDetailDrawer'
import { DisclosureForm } from '@features/disclosures/components/DisclosureForm'
import { DisclosureReportTab } from '@features/disclosures/components/DisclosureReportTab'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { ExecPageHeader, HeaderButton } from '@components/executive/ExecPageHeader'

export type DisclosuresUnitMode = 'ops' | 'garage' | 'sector' | 'station'
const COPY: Record<DisclosuresUnitMode, { title: string; subtitle: string; preparers: string; testId: string }> = {
  ops: { title: 'وحدة الكشوفات', subtitle: 'كشوفات المخالفات على الآليات والموظفين → معاون المدير المفوض → المدير المفوض → استقطاع تلقائي في الحضورية', preparers: 'حسب مُعدّ الكشف (كل حسابات غرفة العمليات)', testId: 'ops-disclosures' },
  garage: { title: 'كشوفات الكراج', subtitle: 'كشوفات على موظفي قسم الكراج فقط (سائقون وكادر) → معاون المدير المفوض → المدير المفوض → استقطاع تلقائي في الحضورية', preparers: 'حسب مُعدّ الكشف', testId: 'garage-disclosures' },
  station: { title: 'كشوفات المحطة', subtitle: 'كشوفات على موظفي قسم المحطة التحويلية فقط → معاون المدير المفوض → المدير المفوض → استقطاع تلقائي في الحضورية', preparers: 'حسب مُعدّ الكشف', testId: 'station-disclosures' },
  sector: { title: 'كشوفات القاطع', subtitle: 'كشوفات على الموظفين المرتبطين بك فقط (مسؤولو الأقسام والمتعهدون في قواطعك ومن تديرهم مباشرة) → معاون المدير المفوض → المدير المفوض → استقطاع تلقائي في الحضورية', preparers: 'حسب مُعدّ الكشف', testId: 'sector-disclosures' },
}

type Tab = 'dashboard' | 'list' | 'new' | 'returned' | 'archive' | 'report'
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'اللوحة', icon: 'bar-chart' }, { key: 'list', label: 'الكشوفات', icon: 'file-text' }, { key: 'new', label: 'كشف جديد', icon: 'clipboard' },
  { key: 'returned', label: 'المُعادة', icon: 'alert-triangle' }, { key: 'archive', label: 'الأرشيف', icon: 'archive-box' }, { key: 'report', label: 'التقارير', icon: 'pie-chart' },
]
const thisMonth = () => new Date().toISOString().slice(0, 7)

export function DisclosuresUnitPage({ mode = 'ops' }: { mode?: DisclosuresUnitMode }) {
  const copy = COPY[mode]
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'dashboard') as Tab
  const setTab = (t: Tab, extra?: Record<string, string>) => { const n = new URLSearchParams(extra ?? {}); n.set('tab', t); setSp(n) }
  const [openId, setOpenId] = useState<string | null>(sp.get('id'))
  const [editing, setEditing] = useState<DisclosureV2 | null>(null)
  const stats = useDisclosureStats(null)
  const returnedCount = stats.data?.by_status.returned ?? 0

  return (
    <div className="space-y-4" data-testid={copy.testId} data-mode={mode}>
      <ExecPageHeader icon="alert-triangle" title={copy.title} subtitle={copy.subtitle}
        stats={[{ label: 'كشوفات هذا الشهر', value: stats.data?.total ?? '…', tone: 'gold' }, { label: 'قيد الموافقة', value: stats.data?.by_status.pending ?? 0 }, { label: 'مُعادة للتصحيح', value: returnedCount, tone: returnedCount ? 'red' : 'plain' }, { label: 'معتمدة', value: stats.data?.by_status.approved ?? 0, tone: 'green' }]}
        actions={<HeaderButton onClick={() => { setEditing(null); setTab('new') }} icon="file-text" testId="new-disclosure-btn">كشف جديد</HeaderButton>} />

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1" role="tablist" data-testid="disc-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-testid={`tab-${t.key}`} onClick={() => { setEditing(null); setTab(t.key) }}
            className={clsx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-black', tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}>
            <Icon name={t.icon} size={14} />{t.label}
            {t.key === 'returned' && returnedCount > 0 ? <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{returnedCount}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && <Dashboard onOpen={setOpenId} goTo={setTab} preparersTitle={copy.preparers} />}
      {tab === 'list' && <ListTab scope="active" onOpen={setOpenId} testId="list-active" />}
      {tab === 'returned' && <ListTab scope="returned" onOpen={setOpenId} testId="list-returned" emptyText="لا توجد كشوفات مُعادة — ممتاز" />}
      {tab === 'archive' && <ListTab scope="archive" onOpen={setOpenId} testId="list-archive" archive />}
      {tab === 'report' && <DisclosureReportTab />}
      {tab === 'new' && (
        <div className="max-w-4xl">
          <h2 className="mb-2 text-sm font-black text-slate-700">{editing ? `تعديل الكشف ${editing.ref_no ?? ''}` : 'كشف جديد'}</h2>
          <DisclosureForm key={editing?.id ?? 'new'} initial={editing} employeeOnly={mode !== 'ops'} employeeOnlyLabel={mode === 'sector' ? 'موظف مرتبط بك فقط' : mode === 'station' ? 'موظف من قسم المحطة' : 'موظف من قسم الكراج'} onCancel={() => { setEditing(null); setTab('list') }}
            onSaved={(d) => { setEditing(null); setTab(d.status === 'draft' ? 'list' : 'list'); setOpenId(d.id) }} />
        </div>
      )}

      <DisclosureDetailDrawer id={openId} onClose={() => setOpenId(null)} opsMode onEdit={(d) => { setOpenId(null); setEditing(d); setTab('new') }} onPrint={printDisclosureForm} />
    </div>
  )
}

function ListTab({ scope, onOpen, testId, emptyText, archive }: { scope: DisclosureScope; onOpen: (id: string) => void; testId: string; emptyText?: string; archive?: boolean }) {
  const [f, setF] = useState<UiFilters>({ ...EMPTY_FILTERS, month: archive ? thisMonth() : '' })
  const types = useDisclosureTypes()
  const list = useDisclosuresList({ scope, ...toServerFilter(f) })
  const rows = useMemo(() => applyClientFilters(list.data ?? [], f), [list.data, f])
  const statuses: DisclosureStatusV2[] = scope === 'active' ? ['draft', 'pending', 'returned'] : scope === 'archive' ? ['approved', 'cancelled'] : []
  const scopeLabel = scope === 'active' ? 'الكشوفات النشطة' : scope === 'returned' ? 'المُعادة للتصحيح' : 'الأرشيف (معتمدة/ملغاة)'
  return (
    <div className="space-y-3">
      <DisclosureFilters value={f} onChange={setF} types={types.data ?? []} rows={list.data ?? []} filtered={rows} statuses={statuses} loading={list.isLoading} testId={`${testId}-filters`}
        exportCtx={{ title: `سجل الكشوفات — ${scopeLabel}`, scopeLabel }} />
      <DisclosureTable rows={rows} onOpen={(d) => onOpen(d.id)} testId={testId} emptyText={emptyText} />
    </div>
  )
}

function Dashboard({ onOpen, goTo, preparersTitle }: { onOpen: (id: string) => void; goTo: (t: Tab) => void; preparersTitle: string }) {
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
          <h3 className="mb-2 text-xs font-black text-slate-500">{preparersTitle}</h3>
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

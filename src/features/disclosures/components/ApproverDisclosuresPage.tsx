/**
 * صفحة الكشوفات للمُعتمِدين (00170) — معاون المدير المفوض والمدير المفوض
 *  · «الوارد»: الكشوفات التي تنتظر قراري (disclosure_inbox) — مبلغ + اعتماد / إعادة بسبب
 *  · «السجل»: كل الكشوفات (قيد الموافقة/معتمدة/مُعادة) مع فلاتر
 *  · «الملغاة»: ما ألغته غرفة العمليات (يُبلَّغ المدير المفوض)
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useDisclosureInbox, useDisclosureTypes, useDisclosuresList } from '../unit'
import { DisclosureTable } from './shared'
import { fmtIqd } from './ui'
import { DisclosureFilters } from './DisclosureFilters'
import { EMPTY_FILTERS, applyClientFilters, toServerFilter, type UiFilters } from '../lib/filters'
import { printDisclosureForm, printDisclosuresReport } from '../lib/export-v2'
import { DisclosureDetailDrawer } from './DisclosureDetailDrawer'
import { DisclosureReportTab } from './DisclosureReportTab'

type Tab = 'inbox' | 'history' | 'cancelled' | 'report'

export function ApproverDisclosuresPage({ title, subtitle, testId = 'approver-disclosures' }: { title: string; subtitle: string; testId?: string }) {
  const [tab, setTab] = useState<Tab>('inbox')
  const [openId, setOpenId] = useState<string | null>(null)
  const inbox = useDisclosureInbox()
  const [f, setF] = useState<UiFilters>({ ...EMPTY_FILTERS })
  const types = useDisclosureTypes()
  const history = useDisclosuresList({ scope: 'all', ...toServerFilter(f) }, tab === 'history' ? 20_000 : false)
  const cancelled = useDisclosuresList({ scope: 'cancelled' }, tab === 'cancelled' ? 20_000 : false)
  const historyBase = useMemo(() => (history.data ?? []).filter((d) => d.status !== 'draft'), [history.data])
  const historyRows = useMemo(() => applyClientFilters(historyBase, f), [historyBase, f])
  const inboxAmount = useMemo(() => (inbox.data ?? []).reduce((a, d) => a + (d.amount ?? 0), 0), [inbox.data])

  return (
    <div className="space-y-4" data-testid={testId}>
      <header>
        <h1 className="text-lg font-black text-slate-800">{title}</h1>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="approver-tiles">
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-900"><div className="text-[11px] font-bold">بانتظار قراري</div><div className="text-2xl font-black tabular-nums" data-testid="inbox-count">{inbox.data?.length ?? '…'}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="text-[11px] font-bold text-slate-500">مبالغ مقترحة في الوارد</div><div className="text-lg font-black tabular-nums">{fmtIqd(inboxAmount)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 col-span-2 sm:col-span-1"><div className="text-[11px] font-bold text-slate-500">ملاحظة</div><div className="text-xs text-slate-600">حدّد المبلغ (أو اتركه فارغاً) ثم اعتمد، أو أعد الكشف لغرفة العمليات مع السبب.</div></div>
      </div>
      <nav className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1" role="tablist">
        {([['inbox', `الوارد (${inbox.data?.length ?? 0})`], ['history', 'السجل'], ['cancelled', 'الملغاة'], ['report', 'التقارير']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`tab-${k}`} onClick={() => setTab(k)} className={clsx('h-9 rounded-xl px-3 text-xs font-black', tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}>{l}</button>
        ))}
      </nav>

      {tab === 'inbox' && (inbox.data?.length ?? 0) > 0 && (
        <div className="flex justify-end"><button type="button" className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50" data-testid="print-inbox" onClick={() => printDisclosuresReport(inbox.data ?? [], { title: `وارد الكشوفات — ${title}`, scopeLabel: 'بانتظار قراري' })}>طباعة الوارد</button></div>
      )}
      {tab === 'inbox' && (
        inbox.isLoading ? <div className="p-6 text-center text-sm text-slate-500">جارٍ جلب الوارد…</div>
          : <DisclosureTable rows={inbox.data ?? []} onOpen={(d) => setOpenId(d.id)} testId="inbox" emptyText="لا كشوفات بانتظار قرارك"
              extra={(d) => <button type="button" className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-black text-white" data-testid={`decide-${d.id}`} onClick={() => setOpenId(d.id)}>قرار</button>} />
      )}
      {tab === 'report' && <DisclosureReportTab testId="approver-report" />}
      {tab === 'history' && (
        <div className="space-y-3">
          <DisclosureFilters value={f} onChange={setF} types={types.data ?? []} rows={historyBase} filtered={historyRows} statuses={['pending', 'returned', 'approved', 'cancelled']} loading={history.isLoading} exportCtx={{ title: `سجل الكشوفات — ${title}`, scopeLabel: 'كل الكشوفات' }} />
          <DisclosureTable rows={historyRows} onOpen={(d) => setOpenId(d.id)} testId="history" />
        </div>
      )}
      {tab === 'cancelled' && <DisclosureTable rows={cancelled.data ?? []} onOpen={(d) => setOpenId(d.id)} testId="cancelled" emptyText="لا كشوفات ملغاة" />}

      <DisclosureDetailDrawer id={openId} onClose={() => setOpenId(null)} onPrint={printDisclosureForm} />
    </div>
  )
}

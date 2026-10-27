/**
 * صفحة الكشوفات للمُعتمِدين (00170) — معاون المدير المفوض والمدير المفوض
 *  · «الوارد»: الكشوفات التي تنتظر قراري (disclosure_inbox) — مبلغ + اعتماد / إعادة بسبب
 *  · «السجل»: كل الكشوفات (قيد الموافقة/معتمدة/مُعادة) مع فلاتر
 *  · «الملغاة»: ما ألغته غرفة العمليات (يُبلَّغ المدير المفوض)
 *  · «المُعدّون» (00305): الموظفون الذين سجّلوا كشوفاً في الشهر — مسجَّل/معتمد/مُعاد/ملغى لكل موظف
 */
import { useMemo, useState } from 'react'
import { useDisclosureInbox, useDisclosureTypes, useDisclosuresList } from '../unit'
import { DisclosureTable } from './shared'
import { fmtIqd } from './ui'
import { DisclosureFilters } from './DisclosureFilters'
import { EMPTY_FILTERS, applyClientFilters, toServerFilter, type UiFilters } from '../lib/filters'
import { printDisclosureForm, printDisclosuresReport } from '../lib/export-v2'
import { DisclosureDetailDrawer } from './DisclosureDetailDrawer'
import { DisclosureReportTab } from './DisclosureReportTab'
import { DisclosurePreparersTab } from './DisclosurePreparersTab'
import { ExecPageHeader, ExecTabBar } from '@components/executive/ExecPageHeader'

type Tab = 'inbox' | 'history' | 'cancelled' | 'preparers' | 'report'

/** 00243: رأس موحد دائماً (أُزيل الشكل القديم غير المستخدم) */
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
      <ExecPageHeader icon="alert-triangle" title={title} subtitle={subtitle}
        stats={[{ label: 'بانتظار قراري', value: inbox.data?.length ?? '…', tone: (inbox.data?.length ?? 0) ? 'red' : 'green', testId: 'inbox-count' }, { label: 'مبالغ مقترحة في الوارد', value: fmtIqd(inboxAmount), tone: 'gold' }, { label: 'في السجل', value: historyBase.length || (history.isLoading ? '…' : 0) }, { label: 'ملغاة من العمليات', value: cancelled.data?.length ?? '—' }]} />
      <ExecTabBar value={tab} onChange={setTab} tabs={[{ key: 'inbox', label: 'الوارد', icon: 'bell', badge: inbox.data?.length ?? 0 }, { key: 'history', label: 'السجل', icon: 'archive-box' }, { key: 'cancelled', label: 'الملغاة', icon: 'x' }, { key: 'preparers', label: 'المُعدّون', icon: 'users' }, { key: 'report', label: 'التقارير', icon: 'bar-chart' }]} />
      {tab === 'inbox' && (inbox.data?.length ?? 0) > 0 && (
        <div className="flex justify-end"><button type="button" className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50" data-testid="print-inbox" onClick={() => printDisclosuresReport(inbox.data ?? [], { title: `وارد الكشوفات — ${title}`, scopeLabel: 'بانتظار قراري' })}>طباعة الوارد</button></div>
      )}
      {tab === 'inbox' && (
        inbox.isLoading ? <div className="p-6 text-center text-sm text-slate-500">جارٍ جلب الوارد…</div>
          : <DisclosureTable rows={inbox.data ?? []} onOpen={(d) => setOpenId(d.id)} testId="inbox" emptyText="لا كشوفات بانتظار قرارك"
              extra={(d) => <button type="button" className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-black text-white" data-testid={`decide-${d.id}`} onClick={() => setOpenId(d.id)}>قرار</button>} />
      )}
      {tab === 'report' && <DisclosureReportTab testId="approver-report" />}
      {tab === 'preparers' && <DisclosurePreparersTab testId="approver-preparers" />}
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

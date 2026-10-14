/**
 * 00254 · الهيكل التنظيمي — عرض «المخطط الهرمي» (Org Chart) بصناديق متصلة بخطوط من الأعلى إلى الأسفل
 * CSS خالص (بلا مكتبة): قائمة متداخلة مع موصلات بالعناصر الزائفة؛ تكبير/تصغير؛ طيّ فروع أي صندوق بالنقر على عدّاده؛
 * المسميات الوظيفية تُعرض كحبّات صغيرة داخل صندوق قسمها (لا كمستوى مستقل) حتى يبقى المخطط مقروءاً؛ ويُطبع كما يظهر.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { HrDepartment } from '@features/hr/types'
import type { OrgNode, OrgTree } from '@features/hr/lib/orgTree'

export interface OrgChartViewProps {
  tree: OrgTree
  onSelect: (d: HrDepartment) => void
  filter: { visible: Set<string>; matches: Set<string> } | null
  companyName?: string
}

const CHART_CSS = `
.org-chart{direction:ltr;display:inline-block;min-width:100%;padding:16px 8px 24px}
.org-chart .org-box{direction:rtl}
.org-chart ul{display:flex;justify-content:center;padding-top:22px;position:relative;margin:0;list-style:none}
.org-chart ul ul::before{content:"";position:absolute;top:0;left:50%;width:2px;height:22px;background:#cbd5e1}
.org-chart li{display:flex;flex-direction:column;align-items:center;position:relative;padding:22px 10px 0}
.org-chart li::before,.org-chart li::after{content:"";position:absolute;top:0;right:50%;width:50%;height:22px;border-top:2px solid #cbd5e1}
.org-chart li::after{right:auto;left:50%;border-left:2px solid #cbd5e1}
.org-chart li:only-child::before,.org-chart li:only-child::after{display:none}
.org-chart li:only-child{padding-top:0}
.org-chart li:first-child::before,.org-chart li:last-child::after{border:0 none}
.org-chart li:last-child::before{border-right:2px solid #cbd5e1;border-radius:0 8px 0 0}
.org-chart li:first-child::after{border-radius:8px 0 0 0}
.org-chart > ul{padding-top:0}
.org-chart > ul > li{padding-top:0}
.org-chart > ul > li::before,.org-chart > ul > li::after{display:none}
.org-chart .org-box{position:relative}
.org-chart .org-box.has-kids::after{content:"";position:absolute;bottom:-22px;left:50%;width:2px;height:22px;background:#cbd5e1}
@media print{
  body *{visibility:hidden}
  .org-print-area,.org-print-area *{visibility:visible}
  .org-print-area{position:absolute;inset:0;overflow:visible!important;transform:none!important}
  .org-chart-scale{zoom:1!important}
  @page{size:A3 landscape;margin:10mm}
}`

export default function OrgChartView({ tree, onSelect, filter, companyName = 'شركة جزيرة الأكارم' }: OrgChartViewProps) {
  const [zoom, setZoom] = useState(1)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const zoomRef = useRef(1)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  /** ملاءمة العرض: يقيس عرض المخطط الحقيقي (بلا تكبير) ويختار أكبر نسبة تُظهره كاملاً */
  const fit = useCallback(() => {
    const sc = scrollRef.current; const cv = canvasRef.current
    if (!sc || !cv || sc.clientWidth === 0) return
    const rootLi = cv.querySelector(':scope > ul > li') as HTMLElement | null
    const natural = (rootLi ?? cv).getBoundingClientRect().width / zoomRef.current   // العرض المرئي ÷ التكبير الحالي = العرض الطبيعي
    if (natural > 0) setZoom(Math.max(0.3, Math.min(1, +((sc.clientWidth - 16) / natural).toFixed(2))))
  }, [])
  useEffect(() => { const id = window.setTimeout(fit, 0); return () => window.clearTimeout(id) }, [fit, collapsed, tree])
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const roots = tree.roots.filter((n) => !filter || filter.visible.has(n.d.id))
  const totalHead = tree.roots.reduce((s, n) => s + n.subtree, 0)

  return (
    <section className="space-y-2" data-testid="org-chart-view">
      <style>{CHART_CSS}</style>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 text-xs print:hidden">
        <span className="font-bold text-slate-700">التكبير</span>
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-black" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} data-testid="org-zoom-out" aria-label="تصغير">−</button>
        <span className="w-10 text-center font-mono" dir="ltr" data-testid="org-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-black" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} data-testid="org-zoom-in" aria-label="تكبير">+</button>
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1" onClick={() => setZoom(1)}>100%</button>
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1" onClick={fit} data-testid="org-zoom-fit">ملاءمة العرض</button>
        <span className="mx-2 h-4 w-px bg-slate-200" />
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1" onClick={() => setCollapsed(new Set())} data-testid="org-chart-expand-all">فتح الكل</button>
        <button type="button" className="rounded-lg bg-slate-100 px-2 py-1" onClick={() => setCollapsed(new Set(tree.flat.filter((n) => n.depth >= 1 && n.children.some((c) => !c.d.is_job_title)).map((n) => n.d.id)))} data-testid="org-chart-collapse-deep">إظهار مستويين</button>
        <button type="button" className="ms-auto rounded-lg bg-brand-600 px-3 py-1 font-bold text-white hover:bg-brand-700" onClick={() => window.print()} data-testid="org-print">🖨 طباعة المخطط</button>
        <span className="text-slate-400">انقر على صندوق لتعديله · انقر على عدّاد الفروع لطيّها</span>
      </div>

      <div ref={scrollRef} dir="ltr" className="org-print-area overflow-auto rounded-2xl border border-slate-200 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:18px_18px] bg-white" data-testid="org-chart-scroll">
        <div className="org-chart-scale" style={{ zoom }}>
          <div ref={canvasRef} className="org-chart" data-testid="org-chart-canvas">
            <ul>
              <li>
                <div className="org-box has-kids rounded-2xl bg-[#0b2a4a] px-5 py-3 text-center text-white shadow-md ring-2 ring-[#f3d06a]" data-testid="org-chart-root">
                  <div className="text-sm font-black">{companyName}</div>
                  <div className="text-[10px] text-blue-100">{tree.roots.length} قسم رئيسي · {totalHead} موظف على الملاك</div>
                </div>
                {roots.length > 0 && <ul>{roots.map((n) => <ChartNode key={n.d.id} node={n} collapsed={collapsed} toggle={toggle} onSelect={onSelect} filter={filter} />)}</ul>}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function ChartNode({ node, collapsed, toggle, onSelect, filter }: { node: OrgNode; collapsed: Set<string>; toggle: (id: string) => void; onSelect: (d: HrDepartment) => void; filter: OrgChartViewProps['filter'] }) {
  const { d } = node
  const titles = node.children.filter((c) => c.d.is_job_title && (!filter || filter.visible.has(c.d.id)))
  const kids = node.children.filter((c) => !c.d.is_job_title && (!filter || filter.visible.has(c.d.id)))
  const isCollapsed = collapsed.has(d.id)
  const showKids = kids.length > 0 && !isCollapsed
  const isMatch = filter?.matches.has(d.id) ?? false
  return (
    <li data-testid={`org-chart-node-${d.code}`} data-depth={node.depth}>
      <div className={clsx('org-box w-44 rounded-2xl border bg-white text-start shadow-sm transition sm:w-52', showKids && 'has-kids', node.depth === 0 ? 'border-brand-300' : 'border-slate-200', !d.is_active && 'opacity-60', isMatch && 'ring-2 ring-amber-300')}>
        <button type="button" onClick={() => onSelect(d)} className="block w-full rounded-t-2xl px-3 pt-2 text-start hover:bg-brand-50/60" data-testid={`org-chart-box-${d.code}`}>
          <div className={clsx('h-1 w-10 rounded-full', node.depth === 0 ? 'bg-[#f3d06a]' : node.depth === 1 ? 'bg-brand-400' : 'bg-slate-300')} />
          <div className="mt-1 truncate text-sm font-black text-slate-900" title={d.name}>{d.name}</div>
          <div className="flex items-center justify-between text-[10px] text-slate-500"><span className="font-mono" dir="ltr">{d.code}</span><span>{d.manager_name ?? 'بلا مدير'}</span></div>
        </button>
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1 text-[10px]">
          <span className="text-slate-600"><b className="text-slate-900">{node.subtree}</b> موظف{d.employees_active !== node.subtree ? ` (${d.employees_active} مباشرة)` : ''}</span>
          {kids.length > 0 && (
            <button type="button" onClick={() => toggle(d.id)} className={clsx('rounded-full px-2 py-0.5 font-black ring-1', isCollapsed ? 'bg-brand-600 text-white ring-brand-600' : 'bg-slate-50 text-slate-700 ring-slate-200')} data-testid={`org-chart-toggle-${d.code}`} aria-expanded={!isCollapsed}>
              {kids.length} فرع {isCollapsed ? '+' : '−'}
            </button>
          )}
        </div>
        {titles.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-sky-50 bg-sky-50/40 px-2 py-1.5" data-testid={`org-chart-titles-${d.code}`}>
            {titles.map((t) => (
              <button key={t.d.id} type="button" onClick={() => onSelect(t.d)} className={clsx('rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 hover:ring-sky-400', t.d.drives_vehicles ? 'bg-amber-50 text-amber-900 ring-amber-100' : t.d.maintenance_specialty ? 'bg-indigo-50 text-indigo-900 ring-indigo-100' : 'bg-white text-sky-800 ring-sky-100')} title={`${t.d.name} · ${t.d.employees_active}`}>
                {t.d.name} <span className="opacity-60">{t.d.employees_active}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {showKids && <ul>{kids.map((c) => <ChartNode key={c.d.id} node={c} collapsed={collapsed} toggle={toggle} onSelect={onSelect} filter={filter} />)}</ul>}
    </li>
  )
}

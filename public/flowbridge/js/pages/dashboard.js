/* ================================================================
   FlowBridge · Dashboard Page — live overview (REAL data only)
   Counts & logs come exclusively from events arriving from your
   platform (bus 'data:in' → engine.pulse). Nothing is simulated.
   ================================================================ */

import { store } from '../core/store.js';
import { bus, EVT } from '../core/bus.js';
import { esc, fmtNum, relTime } from '../core/utils.js';
import { FLOW_DIRS } from '../core/defaults.js';
import { initFlowEngine } from '../engine/engine.js';

export function mountDashboard(container) {
  container.classList.add('fb-page', 'no-scroll');
  container.innerHTML = `
    <div class="fb-page-head" style="padding:22px 28px 0">
      <div>
        <div class="fb-page-title">لوحة القيادة</div>
        <div class="fb-page-sub">نظرة حية على تدفقات البيانات بين بوابات منصتك — الأرقام من أحداث حقيقية فقط</div>
      </div>
      <div class="fb-page-actions">
        <button class="fb-btn primary" data-nav="designer">🎨 افتح المصمم</button>
      </div>
    </div>
    <div style="display:flex;height:calc(100% - 96px)">
      <div style="flex:1.7;min-width:0;position:relative;margin:14px 0 14px 14px;border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;background:var(--bg-2)" data-canvas></div>
      <div style="flex:1;min-width:0;padding:14px;display:flex;flex-direction:column;gap:12px;overflow-y:auto">
        <div class="fb-grid fb-kpis" style="grid-template-columns:1fr 1fr">
          <div class="fb-card fb-kpi" style="--kc:var(--accent)"><div class="fb-kpi-ico">🚪</div><div class="fb-kpi-val" data-k-portals>0</div><div class="fb-kpi-lbl">بوابة مفعّلة</div></div>
          <div class="fb-card fb-kpi" style="--kc:var(--success)"><div class="fb-kpi-ico">🔀</div><div class="fb-kpi-val" data-k-flows>0</div><div class="fb-kpi-lbl">تدفق نشط</div></div>
          <div class="fb-card fb-kpi" style="--kc:var(--info)"><div class="fb-kpi-ico">🔄</div><div class="fb-kpi-val" data-k-run>0</div><div class="fb-kpi-lbl">تنفيذ ناجح</div></div>
          <div class="fb-card fb-kpi" style="--kc:var(--danger)"><div class="fb-kpi-ico">⚠️</div><div class="fb-kpi-val" data-k-fail>0</div><div class="fb-kpi-lbl">فشل</div></div>
        </div>
        <div class="fb-card" style="flex:1;min-height:180px;display:flex;flex-direction:column">
          <div class="fb-card-h"><h3>أحدث التنفيذات</h3><span class="fb-card-sub fb-mono" style="margin-inline-start:auto" data-live>بانتظار الحدث الأول</span></div>
          <div class="fb-card-b" style="flex:1;overflow-y:auto" data-logs></div>
        </div>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const engine = initFlowEngine($('[data-canvas]'), {
    portals: { current: () => store.getPortals() },
    graph: store.getGraph(),
    onGraphChange: () => {}
  });

  let runOk = 0, runFail = 0;
  const feed = [];

  function refresh() {
    const g = store.getGraph();
    $('[data-k-portals]').textContent = fmtNum(store.getPortals().filter(p => p.enabled).length);
    $('[data-k-flows]').textContent = fmtNum(g.flows.filter(f => f.isActive).length);
    $('[data-k-run]').textContent = fmtNum(runOk);
    $('[data-k-fail]').textContent = fmtNum(runFail);

    const logs = $('[data-logs]');
    if (!feed.length) {
      logs.innerHTML = '<div class="fb-empty"><span class="fb-empty-ico">📡</span>لا توجد أحداث بعد<br>ستظهر هنا التنفيذات الحقيقية القادمة من منصتك</div>';
    } else {
      logs.innerHTML = feed.slice(0, 12).map(l => {
        const cls = l.status === 'success' ? 'ok' : l.status === 'failed' ? 'err' : 'skip';
        const ico = l.status === 'success' ? '✓' : l.status === 'failed' ? '✕' : '→';
        const meta = FLOW_DIRS[l.direction] || FLOW_DIRS.forward;
        return `<div class="fb-log ${cls}">
          <span class="fb-log-ico">${ico}</span>
          <div class="fb-log-main"><div class="fb-log-msg">${esc(l.name)} <span class="fb-dir-chip" style="--dc:${meta.color};width:20px;height:20px;font-size:11px">${meta.icon}</span></div>
          <div class="fb-log-sub">${relTime(l.at)} · ${esc(l.trigger || '')}</div></div>
          <span class="fb-log-http">${l.http}</span><span class="fb-log-ms">${l.ms ? l.ms + 'ms' : '—'}</span></div>`;
      }).join('');
    }
    $('[data-live]').textContent = feed.length ? ('مباشر · ' + fmtNum(feed.length) + ' حدث') : 'بانتظار الحدث الأول';
  }

  const offLogs = bus.on(EVT.LOGS_ADDED, ({ flowId, log }) => {
    const f = store.getGraph().flows.find(x => x.id === flowId);
    if (!f) return;
    feed.unshift({
      flowId, name: f.name || f.triggerEvent, direction: f.direction, trigger: f.triggerEvent,
      status: log.status, http: log.http, ms: log.ms, at: log.at
    });
    if (feed.length > 60) feed.pop();
    if (log.status === 'success') runOk++;
    else if (log.status === 'failed') runFail++;
    refresh();
  });

  container.querySelectorAll('[data-nav]').forEach(b =>
    b.addEventListener('click', () => bus.emit('nav:go', b.dataset.nav)));

  const offGraph = bus.on(EVT.GRAPH_CHANGED, refresh);
  refresh();

  return { engine, destroy: () => { offLogs(); offGraph(); engine.destroy(); } };
}

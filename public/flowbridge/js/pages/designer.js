/* ================================================================
   FlowBridge · Designer Page Engine Host
   - Left library: customisable portal catalog
   - Pointer-based card drag → drop on canvas (works everywhere)
   - Live flow list + real stats
   ================================================================ */

import { initFlowEngine } from '../engine/engine.js';
import { store } from '../core/store.js';
import { bus, EVT } from '../core/bus.js';
import { esc, toast } from '../core/utils.js';

export function mountDesigner(container) {
  container.classList.add('fb-designer');
  container.innerHTML = `
    <aside class="fbl">
      <div class="fbl-sec">
        <div class="fbl-head">
          <span class="fbl-title">بوابات المنصة <span class="fb-count" data-count>0</span></span>
          <button class="fbl-add" title="إضافة بوابة جديدة" data-nav="portals">+</button>
        </div>
        <div class="fbl-search"><span class="ico">🔍</span><input placeholder="ابحث في البوابات..." data-search></div>
      </div>
      <div class="fbl-list" data-list></div>
      <div class="fbl-sec" style="border-top:1px solid var(--line)">
        <div class="fbl-head"><span class="fbl-title">التدفقات</span></div>
        <div style="max-height:160px;overflow-y:auto" data-flows></div>
      </div>
      <div class="fbl-stats">
        <div class="fbl-stat"><b data-s-n>0</b><span>بوابة</span></div>
        <div class="fbl-stat"><b data-s-f>0</b><span>تدفق</span></div>
        <div class="fbl-stat"><b data-s-c>0</b><span>قسم</span></div>
      </div>
    </aside>
    <div data-canvas></div>`;

  const $ = (s) => container.querySelector(s);
  const engineHost = $('[data-canvas]');

  const READONLY = !!((window.FlowBridgeConfig || {}).readonly);
  const engine = initFlowEngine(engineHost, {
    portals: { current: () => store.getPortals() },
    graph: store.getGraph(),
    readonly: READONLY,
    autosave: store.getSettings().autosave !== false,
    onGraphChange: (g) => {
      store.setGraph(g);          // persists via Data Connector (local/API)
      syncStats();
    }
  });

  /* ---------- catalog + pointer card drag ---------- */
  function renderCatalog(filter = '') {
    if (!container.isConnected) return;
    const list = $('[data-list]');
    const q = (filter || '').trim().toLowerCase();
    const all = store.getPortals();
    const portals = q ? all.filter(p => p.label.toLowerCase().includes(q) || (p.labelAr || '').includes(q)) : all;
    $('[data-count]').textContent = all.length;

    if (!all.length) {
      list.innerHTML = '<div class="fbl-empty">لا توجد بوابات بعد<br><br><button class="fb-btn sm primary" data-nav="portals">+ إضافة أول بوابة</button></div>';
      list.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => bus.emit('nav:go', 'portals')));
      return;
    }
    if (!portals.length) {
      list.innerHTML = '<div class="fbl-empty">لا توجد نتائج مطابقة</div>';
      return;
    }

    list.innerHTML = portals.map(p => `
      <div class="fbl-card${p.enabled ? '' : ' disabled'}" data-portal="${esc(p.id)}" style="--pc:${p.color}" title="${esc(p.labelAr || p.label)} — اسحب إلى اللوحة">
        <span class="fbl-ico">${p.icon}</span>
        <div class="fbl-txt"><div class="fbl-name">${esc(p.label)}</div><div class="fbl-sub">${esc(p.labelAr || '')} · ${esc(p.category || '')}</div></div>
        <span class="fbl-grip">⠿</span>
      </div>`).join('');

    list.querySelectorAll('.fbl-card').forEach(card => {
      card.addEventListener('pointerdown', (e) => beginCardDrag(e, card.dataset.portal));
    });
  }

  function beginCardDrag(e, portalId) {
    if (e.button !== 0) return;
    if (READONLY) return;
    e.preventDefault();
    const p = store.portalById(portalId);
    const drag = { portalId, sx: e.clientX, sy: e.clientY, started: false, ghost: null };
    const move = (ev) => {
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!drag.started && Math.hypot(dx, dy) < 6) return;
      if (!drag.started) {
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'fb-node fb-ghost';
        drag.ghost.style.setProperty('--pc', p?.color || '#6366F1');
        drag.ghost.innerHTML = `<div class="fb-node-head">
          <div class="fb-node-ico">${p?.icon || '🔌'}</div>
          <div class="fb-node-titles"><div class="fb-node-name">${esc(p?.label || '')}</div>
          <div class="fb-node-sub">${esc(p?.labelAr || '')}</div></div>
          <div class="fb-node-meta"><div class="fb-node-status"><span class="fb-status-dot pulse" style="--sd:#10B981"></span><span>Online</span></div></div></div>`;
        document.body.appendChild(drag.ghost);
        drag.started = true;
      }
      drag.ghost.style.transform = `translate(${ev.clientX - 112}px,${ev.clientY - 44}px) rotate(1.5deg) scale(.9)`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (drag.ghost) { drag.ghost.remove(); drag.ghost = null; }
      if (!drag.started) return;
      const r = engineHost.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (inside) {
        engine.dropAt(ev.clientX, ev.clientY, portalId);
        toast('تمت إضافة ' + (p?.label || ''), 'ok');
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ---------- flow list ---------- */
  const DIR_ICON = { forward: '➡', reverse: '⬅', bidirectional: '⇄' };
  const DIR_COLOR = { forward: '#38BDF8', reverse: '#8B5CF6', bidirectional: '#F59E0B' };
  function flowColorOf(f) { return (f.color && f.color.trim()) ? f.color : (DIR_COLOR[f.direction] || '#38BDF8'); }

  function renderFlows() {
    const host = $('[data-flows]');
    const g = store.getGraph();
    if (!g.flows.length) { host.innerHTML = '<div class="fbl-empty">لا توجد تدفقات بعد — اسحب من مقبض Trigger إلى بوابة أخرى</div>'; return; }
    host.innerHTML = g.flows.map(f => {
      const src = g.nodes.find(n => n.id === f.sourceId);
      const p = src && store.portalById(src.portalId);
      const meta = DIR_ICON[f.direction] || '➡';
      const color = flowColorOf(f);
      return `<div class="fbl-flow" data-flow="${esc(f.id)}">
        <span class="fb-dir-chip" style="--dc:${color}">${meta}</span>
        <div style="flex:1;min-width:0">
          <div class="fbl-flow-name">${esc(f.name || '')}</div>
          <div class="fbl-flow-sub">${p ? p.label : ''} · ${f.direction === 'reverse' ? 'عكسي' : f.direction === 'bidirectional' ? 'ثنائي' : 'اعتيادي'}</div>
        </div>
        <span class="fb-status-dot${f.isActive ? ' pulse' : ''}" style="--sd:${f.isActive ? '#10B981' : '#F59E0B'}"></span>
      </div>`;
    }).join('');
    host.querySelectorAll('.fbl-flow').forEach(item =>
      item.addEventListener('click', () => {
        engine.select('flow', item.dataset.flow);
        host.querySelectorAll('.fbl-flow').forEach(x => x.classList.toggle('on', x.dataset.flow === item.dataset.flow));
      }));
  }

  /* ---------- stats (real only) ---------- */
  function syncStats() {
    if (!container.isConnected) return;
    const g = store.getGraph();
    $('[data-s-n]').textContent = g.nodes.length;
    $('[data-s-f]').textContent = g.flows.length;
    $('[data-s-c]').textContent = (store.getSettings().categories || []).length;
  }

  /* ---------- wiring ---------- */
  $('[data-search]').addEventListener('input', (e) => renderCatalog(e.target.value));
  container.querySelectorAll('[data-nav]').forEach(b =>
    b.addEventListener('click', () => bus.emit('nav:go', b.dataset.nav)));

  const offs = [
    bus.on(EVT.PORTALS_CHANGED, () => { renderCatalog(); engine.refresh(); syncStats(); }),
    bus.on(EVT.GRAPH_CHANGED, () => { renderFlows(); syncStats(); }),
    bus.on(EVT.STORE_SAVED, () => syncStats()),
    bus.on('nav:go', (to) => { if (to === 'designer') { engine.refresh(); renderCatalog(); syncStats(); } })
  ];

  renderCatalog(); renderFlows(); syncStats();

  return { engine, destroy: () => { offs.forEach(f => f()); engine.destroy(); } };
}

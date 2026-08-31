/* ================================================================
   FlowBridge · Visual Workflow Engine (v5 — production-grade)
   -----------------------------------------------------------------
   v5 additions:
   · UNDO / REDO — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y + toolbar buttons
   · SAVE STATE — dirty badge (غير محفوظ / محفوظ) + autosave option
   · GRAPH IMPORT / EXPORT (JSON) with data sanitization on load
   · READONLY mode (opts.readonly or ?readonly=1) — view-only
   · Dual-layer canvas grid (dots + major lines, Figma-style)
   · Node redesign: 240px cards, glowing handles with pulse rings
   · Flow redesign: thicker core, glow halo, longer comets, big arrows
   · Onboarding empty-state (3 steps)
   API: { getGraph, setGraph, onGraphChange, select, pulse, save, fit,
          createNode, deleteNode, copyNode, createFlow, deleteFlow,
          clearAll, dropAt, undo, redo, canUndo, canRedo, exportGraph,
          importGraph, refresh, destroy }
   ================================================================ */

import { clamp, rand, uid, deep, esc, debounce } from '../core/utils.js';
import { FLOW_COLORS } from '../core/defaults.js';

const FLOW_META = {
  forward:       { icon: '➡', label: 'اعتيادي',   color: '#38BDF8', desc: 'البيانات تتدفق من المصدر إلى الهدف' },
  reverse:       { icon: '⬅', label: 'عكسي',      color: '#8B5CF6', desc: 'البيانات تتدفق من الهدف إلى المصدر' },
  bidirectional: { icon: '⇄', label: 'ثنائي',     color: '#F59E0B', desc: 'تدفق البيانات في الاتجاهين' }
};

const NODE_W = 240;          // node width (px)
const HANDLE_X_L = 20;       // trigger handle center x
const HANDLE_X_R = 220;      // action handle center x
const HANDLE_Y_OFF = -22;    // handle center y from node bottom
const SNAP_R = 48;           // snap radius (screen px)
const COMET_T = 2600, COMET_LEN = 0.2;

export function initFlowEngine(container, opts = {}) {
  const root = container;
  if (!root) throw new Error('FlowBridge engine: container required');
  root.classList.add('fb-engine');

  const READONLY = !!opts.readonly;
  const AUTOSAVE = opts.autosave !== false;

  function normalizePortals(src) {
    if (Array.isArray(src)) return src;
    if (src && typeof src.current === 'function') return src.current() || [];
    return [];
  }
  let portals = normalizePortals(opts.portals);
  let graph = sanitize(opts.graph || { nodes: [], flows: [] });
  let onGraphChange = opts.onGraphChange || (() => {});
  let destroyed = false;

  /* ---------- history ---------- */
  const history = { stack: [], idx: -1 };
  function snap() {
    history.stack = history.stack.slice(0, history.idx + 1);
    history.stack.push(deep(graph));
    if (history.stack.length > 60) history.stack.shift();
    history.idx = history.stack.length - 1;
    updateHistoryBtns();
  }
  function canUndo() { return history.idx > 0; }
  function canRedo() { return history.idx < history.stack.length - 1; }
  function undo() { if (!canUndo()) return; history.idx--; applySnap(history.stack[history.idx]); }
  function redo() { if (!canRedo()) return; history.idx++; applySnap(history.stack[history.idx]); }
  function applySnap(s) {
    graph = deep(s);
    renderNodes(); renderFlows(); deselect();
    dirty = true; updateSaveUI(); updateHistoryBtns(); emitChange();
  }

  /* ---------- state ---------- */
  const state = {
    selected: null, hoveredFlowId: null, connecting: null, drag: null,
    edgeTab: 0, miniDirty: true, zTop: 10, anim: null
  };
  let dirty = false;
  const nodeEls = new Map();
  const flowRecs = new Map();
  const viewport = { x: 0, y: 0, scale: 1 };

  const $ = (s) => root.querySelector(s);
  const el = (cls, html) => { const d = document.createElement('div'); d.className = cls; if (html !== undefined) d.innerHTML = html; return d; };
  const svgEl = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  /* ---------- shell ---------- */
  root.innerHTML = [
    '<div class="fb-toolbar">',
      '<span class="fb-save-pill saved" data-save-pill title="حالة الحفظ"><span class="dot"></span><span data-save-txt2>محفوظ</span></span>',
      '<span class="fb-tb-sep"></span>',
      '<button class="fb-tb save" data-tb="save"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" stroke-linecap="round" stroke-linejoin="round"/></svg><span data-save-txt>حفظ</span></button>',
      '<button class="fb-tb danger" data-tb="clear" title="مسح الكل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
      '<span class="fb-tb-sep"></span>',
      '<button class="fb-tb" data-tb="undo" title="تراجع (Ctrl+Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
      '<button class="fb-tb" data-tb="redo" title="إعادة (Ctrl+Shift+Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
      '<span class="fb-tb-sep"></span>',
      '<button class="fb-tb" data-tb="zoomout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M8 11h6" stroke-linecap="round"/></svg></button>',
      '<button class="fb-tb fb-zoom-badge" data-tb="zoomreset" title="إعادة التكبير إلى 100%">100%</button>',
      '<button class="fb-tb" data-tb="zoomin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke-linecap="round"/></svg></button>',
      '<button class="fb-tb" data-tb="fit" title="ملاءمة الشاشة"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
      '<span class="fb-tb-sep"></span>',
      '<button class="fb-tb" data-tb="export" title="تصدير المخطط JSON"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
      '<button class="fb-tb" data-tb="import" title="استيراد مخطط JSON"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke-linecap="round" stroke-linejoin="round"/></svg></button>',
    '</div>',
    '<div class="fb-canvas-bg"></div>',
    '<div class="fb-canvas">',
      '<div class="fb-world">',
        '<svg class="fb-edge-svg"></svg>',
        '<div class="fb-edge-ui"></div>',
        '<div class="fb-node-layer"></div>',
      '</div>',
    '</div>',
    '<div class="fb-vignette"></div>',
    '<div class="fb-hud"><b data-hud-n>0</b> بوابات · <b data-hud-f>0</b> تدفقات · <span data-hud-z>100%</span></div>',
    '<div class="fb-minimap"><span class="lbl">MAP</span><canvas width="168" height="124"></canvas></div>'
  ].join('');

  const refs = {
    canvas: $('.fb-canvas'), world: $('.fb-world'), svg: $('.fb-edge-svg'),
    edgeUi: $('.fb-edge-ui'), nodeLayer: $('.fb-node-layer'), bg: $('.fb-canvas-bg'),
    minimap: $('.fb-minimap canvas'),
    zoomBadge: $('[data-tb="zoomreset"]'), saveBtn: $('[data-tb="save"]'),
    savePill: $('[data-save-pill]'), hudN: $('[data-hud-n]'), hudF: $('[data-hud-f]'), hudZ: $('[data-hud-z]')
  };
  const mmCtx = refs.minimap.getContext && refs.minimap.getContext('2d') || null;

  /* =================================================================
     DATA SANITIZATION — load only valid graphs (integration safety)
     ================================================================= */
  function sanitize(g) {
    const nodes = (g && Array.isArray(g.nodes) ? g.nodes : []).map(n => ({
      id: String(n.id || uid('n')),
      portalId: String(n.portalId || ''),
      x: Math.round(+n.x || 0), y: Math.round(+n.y || 0),
      name: String(n.name || ''),
      isEnabled: n.isEnabled !== false,
      status: ['Online', 'Degraded', 'Offline'].includes(n.status) ? n.status : 'Online',
      latencyMs: clamp(+n.latencyMs || 0, 1, 9999),
      endpoint: String(n.endpoint || '')
    }));
    const ids = new Set(nodes.map(n => n.id));
    const flows = (g && Array.isArray(g.flows) ? g.flows : []).filter(f => ids.has(f.sourceId) && ids.has(f.targetId)).map(f => ({
      id: String(f.id || uid('f')),
      name: String(f.name || ''),
      direction: FLOW_META[f.direction] ? f.direction : 'forward',
      color: String(f.color || ''),
      sourceId: String(f.sourceId), targetId: String(f.targetId),
      isActive: f.isActive !== false,
      triggerEvent: String(f.triggerEvent || 'data.received'),
      actionEvent: String(f.actionEvent || 'sync.record'),
      mappingRules: Array.isArray(f.mappingRules) ? f.mappingRules.filter(m => m && m.source && m.target) : [],
      conditions: Array.isArray(f.conditions) ? f.conditions : [],
      logic: f.logic === 'OR' ? 'OR' : 'AND',
      logs: Array.isArray(f.logs) ? f.logs.slice(0, 30) : []
    }));
    return { nodes, flows };
  }

  /* =================================================================
     VIEWPORT
     ================================================================= */
  const cw = () => refs.canvas.clientWidth || 800;
  const ch = () => refs.canvas.clientHeight || 600;
  const toWorld = (sx, sy) => ({ x: (sx - viewport.x) / viewport.scale, y: (sy - viewport.y) / viewport.scale });
  const toScreen = (x, y) => ({ x: x * viewport.scale + viewport.x, y: y * viewport.scale + viewport.y });

  function applyViewport() {
    refs.world.style.transform = `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})`;
    refs.bg.style.backgroundSize =
      `${24 * viewport.scale}px ${24 * viewport.scale}px,` +
      `${120 * viewport.scale}px ${120 * viewport.scale}px,` +
      `${120 * viewport.scale}px ${120 * viewport.scale}px`;
    refs.bg.style.backgroundPosition =
      `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`;
    refs.zoomBadge.textContent = Math.round(viewport.scale * 100) + '%';
    refs.hudZ.textContent = Math.round(viewport.scale * 100) + '%';
    state.miniDirty = true;
  }
  function zoomAt(cx, cy, f) {
    stopAnim();
    const s = clamp(viewport.scale * f, 0.3, 2.5), k = s / viewport.scale;
    viewport.x = cx - k * (cx - viewport.x); viewport.y = cy - k * (cy - viewport.y);
    viewport.scale = s; applyViewport();
  }
  function zoomReset() { animateTo({ x: (cw() - 800 * 1) / 2, y: (ch() - 600 * 1) / 2, scale: 1 }, 260); }
  function animateTo(tx, dur = 320) {
    stopAnim();
    const from = { ...viewport }, t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    const step = now => {
      const t = clamp((now - t0) / dur, 0, 1), e = ease(t);
      viewport.x = from.x + (tx.x - from.x) * e; viewport.y = from.y + (tx.y - from.y) * e;
      viewport.scale = from.scale + (tx.scale - from.scale) * e; applyViewport();
      state.anim = t < 1 ? requestAnimationFrame(step) : null;
    };
    state.anim = requestAnimationFrame(step);
  }
  function stopAnim() { if (state.anim) cancelAnimationFrame(state.anim); state.anim = null; }
  function fit() {
    if (!graph.nodes.length) { animateTo({ x: 0, y: 0, scale: 1 }); return; }
    const xs = graph.nodes.map(n => n.x), ys = graph.nodes.map(n => n.y);
    const minX = Math.min(...xs) - 120, minY = Math.min(...ys) - 120;
    const maxX = Math.max(...xs) + NODE_W + 120, maxY = Math.max(...ys) + 250 + 120;
    const bw = maxX - minX, bh = maxY - minY;
    const s = clamp(Math.min((cw() - 90) / bw, (ch() - 90) / bh), 0.3, 1.15);
    animateTo({ x: (cw() - bw * s) / 2 - minX * s, y: (ch() - bh * s) / 2 - minY * s, scale: s });
  }

  /* ---------- dirty / save state ---------- */
  const debouncedPersist = debounce(() => persistNow(), 300);
  function markDirty() {
    dirty = true;
    if (AUTOSAVE) debouncedPersist();
    updateSaveUI();
  }
  function persistNow() {
    if (destroyed) return;
    dirty = false;
    onGraphChange(getGraph());
    updateSaveUI();
  }
  function updateSaveUI() {
    if (!refs.savePill) return;
    refs.savePill.classList.toggle('dirty', dirty);
    refs.savePill.classList.toggle('saved', !dirty);
    refs.savePill.querySelector('[data-save-txt2]').textContent = dirty ? 'غير محفوظ' : 'محفوظ';
    refs.saveBtn.disabled = READONLY;
  }
  function emitChange() { if (!destroyed) markDirty(); }
  /* push a history snapshot AFTER a completed mutation (undo/redo correctness) */
  function commit() { emitChange(); snap(); }
  function refreshLogsIfOpen() {
    if (state.selected?.type === 'flow' && state.edgeTab === 4) openDrawer();
  }

  /* =================================================================
     NODES
     ================================================================= */
  function epShort(ep) {
    if (!ep || typeof ep !== 'string') return '— endpoint';
    return ep.replace(/^https?:\/\//, '').replace(/\/$/, '') || ep;
  }
  function portalOf(node) {
    return portals.find(p => p.id === node.portalId)
      || { label: node.portalId, labelAr: '', icon: '🔌', color: '#6366F1', category: '' };
  }
  function nodeTitle(n) { return n.name && n.name.trim() ? n.name : portalOf(n).label; }

  function nodeAnchors(n) {
    const elx = nodeEls.get(n.id);
    const h = elx ? (elx.offsetHeight || 152) : 152;
    const y = n.y + h + HANDLE_Y_OFF;
    return {
      trigger: { x: n.x + HANDLE_X_L, y },
      action:  { x: n.x + HANDLE_X_R, y }
    };
  }

  function nodeHtml(n) {
    const p = portalOf(n);
    const st = { Online: '#10B981', Degraded: '#F59E0B', Offline: '#EF4444' }[n.status] || '#7A8499';
    return `<div class="fb-node-head">
      <div class="fb-node-ico">${p.icon}</div>
      <div class="fb-node-titles"><div class="fb-node-name">${esc(nodeTitle(n))}</div>
      <div class="fb-node-sub">${esc(p.labelAr || '')} <span class="fb-node-cat">${esc(p.category || '')}</span></div></div>
      <div class="fb-node-meta">
        <div class="fb-node-status"><span class="fb-status-dot${n.status === 'Online' ? ' pulse' : ''}" style="--sd:${st}"></span><span>${esc(n.status)}</span></div>
        <div class="fb-node-lat">${+n.latencyMs || 0}ms</div>
      </div></div>
      <div class="fb-node-divider"></div>
      <div class="fb-node-toggle"><span class="lbl">مفعّل</span>
        <label class="fb-switch" style="--sc:${p.color}"><input type="checkbox"${n.isEnabled ? ' checked' : ''}><span></span></label></div>
      <div class="fb-node-foot">
        <span class="fb-node-ep" title="${esc(n.endpoint || 'لا يوجد endpoint')}">${esc(epShort(n.endpoint))}</span>
        <span class="fb-node-flowcnt" title="تدفقات متصلة"></span>
      </div>
      <div class="fb-node-handles">
        <div class="fb-hslot"><button class="fb-handle fb-handle-trigger" title="Trigger — اسحب لإنشاء تدفق اعتيادي"></button><span class="fb-hlabel">OUT</span></div>
        <div class="fb-hslot"><span class="fb-hlabel">IN</span><button class="fb-handle fb-handle-action" title="Action — اسحب لإنشاء تدفق عكسي"></button></div>
      </div>`;
  }

  function buildNode(n) {
    const p = portalOf(n);
    const elx = el('fb-node', nodeHtml(n));
    elx.dataset.id = n.id;
    elx.style.left = n.x + 'px'; elx.style.top = n.y + 'px';
    elx.style.setProperty('--pc', p.color);
    return elx;
  }

  function renderNodes() {
    const seen = new Set();
    for (const n of graph.nodes) {
      seen.add(n.id);
      let elx = nodeEls.get(n.id);
      if (!elx) {
        elx = buildNode(n); nodeEls.set(n.id, elx); refs.nodeLayer.appendChild(elx);
        bindNode(elx, n); afterAppend(n, elx);
      }
      elx.style.left = n.x + 'px'; elx.style.top = n.y + 'px';
      elx.classList.toggle('disabled', !n.isEnabled);
    }
    for (const [id, elx] of nodeEls) if (!seen.has(id)) { elx.remove(); nodeEls.delete(id); }
    updateFlowCounts();
  }
  function afterAppend(n, elx) {
    elx.classList.add('entering');
    elx.addEventListener('animationend', () => elx.classList.remove('entering'), { once: true });
  }
  function syncNode(n) {
    const elx = nodeEls.get(n.id); if (!elx) return;
    elx.classList.toggle('disabled', !n.isEnabled);
    elx.querySelector('.fb-node-name').textContent = nodeTitle(n);
    const st = { Online: '#10B981', Degraded: '#F59E0B', Offline: '#EF4444' }[n.status] || '#7A8499';
    const dot = elx.querySelector('.fb-status-dot');
    dot.className = 'fb-status-dot' + (n.status === 'Online' ? ' pulse' : '');
    dot.style.setProperty('--sd', st);
    elx.querySelector('.fb-node-status span:last-child').textContent = n.status;
    elx.querySelector('.fb-node-lat').textContent = (+n.latencyMs || 0) + 'ms';
    const epEl = elx.querySelector('.fb-node-ep');
    if (epEl) { epEl.textContent = epShort(n.endpoint); epEl.title = n.endpoint || 'لا يوجد endpoint'; }
  }
  function updateFlowCounts() {
    for (const n of graph.nodes) {
      const elx = nodeEls.get(n.id); if (!elx) continue;
      const c = graph.flows.filter(f => f.sourceId === n.id || f.targetId === n.id).length;
      const b = elx.querySelector('.fb-node-flowcnt');
      b.textContent = '⇌ ' + c;
      b.style.display = c ? '' : 'none';
    }
    refs.hudN.textContent = graph.nodes.length;
    refs.hudF.textContent = graph.flows.length;
  }

  function bindNode(elx, node) {
    elx.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.fb-handle') || e.target.closest('.fb-switch')) return;
      e.stopPropagation();
      if (READONLY) { select('node', node.id); return; }
      refs.canvas.setPointerCapture && refs.canvas.setPointerCapture(e.pointerId);
      const w = toWorld(e.clientX - rectLeft(), e.clientY - rectTop());
      state.drag = { kind: 'node', id: node.id, sx: e.clientX, sy: e.clientY, gx: w.x - node.x, gy: w.y - node.y, moved: false };
      state.zTop += 1; elx.style.zIndex = state.zTop;
      select('node', node.id);
    });
    elx.querySelector('.fb-handle-trigger').addEventListener('pointerdown', (e) => { if (!READONLY) startConnect(e, node, 'trigger'); });
    elx.querySelector('.fb-handle-action').addEventListener('pointerdown', (e) => { if (!READONLY) startConnect(e, node, 'action'); });
    elx.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ctxMenu(e.clientX, e.clientY, { type: 'node', id: node.id }); });
    elx.querySelector('.fb-switch input').addEventListener('change', (e) => {
      if (READONLY) { e.target.checked = node.isEnabled; return; }
      e.stopPropagation();
      node.isEnabled = e.target.checked;
      elx.classList.toggle('disabled', !node.isEnabled); commit();
      toast(node.isEnabled ? 'تم تفعيل البوابة' : 'تم إيقاف البوابة', 'info');
    });
  }
  const rectLeft = () => refs.canvas.getBoundingClientRect().left;
  const rectTop = () => refs.canvas.getBoundingClientRect().top;

  function select(type, id) {
    state.selected = { type, id };
    for (const [nid, elx] of nodeEls) elx.classList.toggle('selected', type === 'node' && nid === id);
    refreshFlowStyles(); openDrawer();
  }
  function deselect() {
    state.selected = null;
    for (const [, elx] of nodeEls) elx.classList.remove('selected');
    refreshFlowStyles(); closeDrawer();
  }

  /* =================================================================
     FLOWS
     ================================================================= */
  function flowMeta(f) { return FLOW_META[f.direction] || FLOW_META.forward; }
  function flowColor(f) { return (f.color && f.color.trim()) ? f.color : flowMeta(f).color; }
  function flowGeo(f) {
    const s = graph.nodes.find(n => n.id === f.sourceId), t = graph.nodes.find(n => n.id === f.targetId);
    if (!s || !t) return null;
    return { a: nodeAnchors(s).trigger, b: nodeAnchors(t).action };
  }
  function flowLanes(f, geo) {
    const OFF = 16;
    if (f.direction === 'reverse') return [{ a: geo.b, b: geo.a, off: -OFF }];
    if (f.direction === 'bidirectional') return [
      { a: geo.a, b: geo.b, off: OFF }, { a: geo.b, b: geo.a, off: -OFF }
    ];
    return [{ a: geo.a, b: geo.b, off: OFF }];
  }
  function buildLane(la) {
    const dx = clamp(Math.abs(la.b.x - la.a.x) * .5, 70, 240) * (la.b.x >= la.a.x ? 1 : -1);
    const d = `M ${la.a.x} ${la.a.y} C ${la.a.x + dx} ${la.a.y + la.off}, ${la.b.x - dx} ${la.b.y + la.off}, ${la.b.x} ${la.b.y}`;
    const probe = svgEl('path', { d, fill: 'none' });
    refs.svg.appendChild(probe);
    let len = 100; try { len = probe.getTotalLength(); } catch (_) {}
    const pts = [];
    try { const N = 48; for (let i = 0; i <= N; i++) { const p = probe.getPointAtLength(len * i / N); pts.push({ x: p.x, y: p.y }); } } catch (_) {}
    probe.remove();
    return { d, len, pts };
  }
  function lanePoint(lane, t) {
    const pts = lane.pts; if (!pts || !pts.length) return { x: 0, y: 0 };
    const n = pts.length - 1, tt = clamp(t, 0, 1) * n;
    const i = Math.min(Math.floor(tt), n - 1), fr = tt - i;
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * fr, y: pts[i].y + (pts[i + 1].y - pts[i].y) * fr };
  }
  function placeArrow(lane, arrowEl, color) {
    if (!arrowEl || !lane.pts.length) return;
    const p0 = lanePoint(lane, 0.92), p1 = lanePoint(lane, 1);
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const s = 9, bx = p1.x - Math.cos(ang) * 5.5, by = p1.y - Math.sin(ang) * 5.5;
    arrowEl.setAttribute('points',
      `${bx + Math.cos(ang) * s},${by + Math.sin(ang) * s} ` +
      `${bx + Math.cos(ang + 2.42) * s},${by + Math.sin(ang + 2.42) * s} ` +
      `${bx + Math.cos(ang - 2.42) * s},${by + Math.sin(ang - 2.42) * s}`);
    arrowEl.setAttribute('style', 'fill:' + color);
  }

  function renderFlows() {
    refs.svg.querySelectorAll('.fb-flow-live').forEach(n => n.remove());
    refs.edgeUi.innerHTML = '';
    flowRecs.clear();
    for (const f of graph.flows) {
      const geo = flowGeo(f); if (!geo) continue;
      const color = flowColor(f);
      const hit = svgEl('path', { class: 'fb-e-hit' });
      const glow = svgEl('path', { class: 'fb-e-glow' });
      const core = svgEl('path', { class: 'fb-e-core' });
      const spark = svgEl('path', { class: 'fb-e-spark' });
      const lanes = flowLanes(f, geo).map(la => {
        const lane = buildLane(la);
        lane.arrow = svgEl('polygon', { class: 'fb-e-arrow' });
        lane.head = svgEl('path', { class: 'fb-e-core fb-comet-head' });
        lane.glow2 = svgEl('path', { class: 'fb-e-core fb-comet-glow' });
        lane.head.style.opacity = 0; lane.glow2.style.opacity = 0;
        return lane;
      });
      const L0 = lanes[0];
      hit.setAttribute('d', L0.d);
      glow.setAttribute('d', L0.d); core.setAttribute('d', L0.d); spark.setAttribute('d', L0.d);
      glow.style.stroke = color; core.style.stroke = color;
      hit.style.pointerEvents = 'stroke';
      hit.dataset.id = f.id;
      [hit, glow, core, spark, ...lanes.flatMap(l => [l.arrow, l.head, l.glow2])]
        .forEach(n => n.classList.add('fb-flow-live'));
      refs.svg.append(hit, glow, core, spark, ...lanes.flatMap(l => [l.arrow, l.head, l.glow2]));

      const ui = el('fb-edge-ui-item');
      const sN = graph.nodes.find(n => n.id === f.sourceId), tN = graph.nodes.find(n => n.id === f.targetId);
      ui.style.setProperty('--c', color);
      ui.innerHTML = `<div class="fb-edge-label"><span class="dir">${flowMeta(f).icon}</span><b>${esc(f.name || 'تدفق')}</b><span class="fb-edge-route">${esc(nodeTitle(sN))} ← ${esc(nodeTitle(tN))}</span>
        <span class="fb-edge-stat" data-stat></span></div>
        <button class="fb-edge-del" title="حذف التدفق">✕</button>`;
      refs.edgeUi.appendChild(ui);

      const rec = { f, hit, glow, core, spark, lanes, ui, comets: [], seq: 0 };
      hit.addEventListener('mouseenter', () => { state.hoveredFlowId = f.id; refreshFlowStyles(); });
      hit.addEventListener('mouseleave', () => { if (state.hoveredFlowId === f.id) { state.hoveredFlowId = null; refreshFlowStyles(); } });
      hit.addEventListener('click', (e) => { e.stopPropagation(); select('flow', f.id); });
      hit.addEventListener('pointerdown', (e) => e.stopPropagation());
      hit.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ctxMenu(e.clientX, e.clientY, { type: 'flow', id: f.id }); });
      ui.addEventListener('pointerenter', () => { state.hoveredFlowId = f.id; refreshFlowStyles(); });
      ui.addEventListener('pointerleave', () => { if (state.hoveredFlowId === f.id) { state.hoveredFlowId = null; refreshFlowStyles(); } });
      ui.querySelector('.fb-edge-label').addEventListener('click', (e) => { e.stopPropagation(); select('flow', f.id); });
      ui.querySelector('.fb-edge-del').addEventListener('click', (e) => { e.stopPropagation(); deleteFlow(f.id); });
      flowRecs.set(f.id, rec);
      updateEdgeStats(f.id);
    }
    refreshFlowStyles(); layoutFlowUi();
  }

  function refreshFlowStyles() {
    for (const [id, rec] of flowRecs) {
      const f = rec.f, color = flowColor(f);
      const on = f.isActive;
      const hovered = state.hoveredFlowId === id;
      const sel = state.selected?.type === 'flow' && state.selected.id === id;
      rec.glow.style.stroke = color; rec.core.style.stroke = color;
      rec.glow.style.opacity = on ? (sel ? .28 : hovered ? .2 : .11) : 0;
      rec.core.style.strokeWidth = sel ? 3.2 : hovered ? 2.8 : 2.4;
      rec.spark.style.opacity = on ? (sel ? 1 : hovered ? .95 : .8) : 0;
      rec.spark.style.animationPlayState = on ? 'running' : 'paused';
      rec.lanes.forEach(lane => {
        placeArrow(lane, lane.arrow, color);
        lane.arrow.style.opacity = on ? (sel || hovered ? 1 : .9) : 0;
        lane.head.style.stroke = color; lane.glow2.style.stroke = color;
      });
      rec.ui.classList.toggle('show', sel || hovered);
    }
    layoutFlowUi();
  }
  function layoutFlowUi() {
    for (const [, rec] of flowRecs) {
      const lane = rec.lanes[0];
      const mid = lane && lane.pts && lane.pts.length ? lanePoint(lane, 0.5) : null;
      if (mid) { rec.ui.style.left = mid.x + 'px'; rec.ui.style.top = mid.y + 'px'; }
      else { const geo = flowGeo(rec.f); if (geo) { rec.ui.style.left = ((geo.a.x + geo.b.x) / 2) + 'px'; rec.ui.style.top = ((geo.a.y + geo.b.y) / 2) + 'px'; } }
    }
  }
  function recomputeFlows() {
    for (const [, rec] of flowRecs) {
      const geo = flowGeo(rec.f); if (!geo) continue;
      const lanes0 = flowLanes(rec.f, geo);
      rec.lanes.forEach((lane, i) => {
        const nl = buildLane(lanes0[i] || lanes0[0]);
        lane.d = nl.d; lane.len = nl.len; lane.pts = nl.pts;
      });
      const L0 = rec.lanes[0];
      rec.hit.setAttribute('d', L0.d); rec.glow.setAttribute('d', L0.d);
      rec.core.setAttribute('d', L0.d); rec.spark.setAttribute('d', L0.d);
    }
    refreshFlowStyles();
  }

  /* ---------- animation ---------- */
  let rafId = 0;
  function tick(now) {
    if (destroyed) return;
    rafId = requestAnimationFrame(tick);
    for (const [, rec] of flowRecs) {
      const f = rec.f;
      if (!f.isActive) { rec.lanes.forEach(l => { l.head.style.opacity = 0; l.glow2.style.opacity = 0; }); continue; }
      const color = flowColor(f);
      const drawn = new Set();
      if (rec.comets.length < rec.lanes.length && Math.random() < 0.0014) {
        rec.comets.push({ t0: now + 220 * Math.random(), lane: rec.seq = (rec.seq + 1) % rec.lanes.length, dur: COMET_T, len: COMET_LEN, color: null });
      }
      for (let i = rec.comets.length - 1; i >= 0; i--) {
        const cm = rec.comets[i], lane = rec.lanes[cm.lane];
        if (!lane) { rec.comets.splice(i, 1); continue; }
        const t = (now - cm.t0) / cm.dur;
        if (t < 0) continue;
        if (t >= 1) { rec.comets.splice(i, 1); lane.head.style.opacity = 0; lane.glow2.style.opacity = 0; continue; }
        const head = lanePoint(lane, t), tail = lanePoint(lane, Math.max(0, t - cm.len));
        const d = `M ${tail.x} ${tail.y} L ${head.x} ${head.y}`;
        const c = cm.color || color;
        lane.head.setAttribute('d', d); lane.glow2.setAttribute('d', d);
        lane.head.style.stroke = c; lane.glow2.style.stroke = c;
        lane.head.style.opacity = clamp(1.1 - t * .3, .45, 1);
        lane.glow2.style.opacity = clamp(.32 * (1 - t), 0, .32);
        drawn.add(cm.lane);
      }
      rec.lanes.forEach((lane, li) => {
        if (!drawn.has(li)) { lane.head.style.opacity = 0; lane.glow2.style.opacity = 0; }
      });
    }
    if (state.drag?.kind === 'node' || state.connecting) layoutFlowUi();
    if (state.miniDirty) drawMinimap();
  }
  rafId = requestAnimationFrame(tick);

  /* =================================================================
     MINIMAP
     ================================================================= */
  function worldBounds() {
    if (!graph.nodes.length) return null;
    const xs = graph.nodes.map(n => n.x), ys = graph.nodes.map(n => n.y);
    return { x: Math.min(...xs) - 100, y: Math.min(...ys) - 100, w: Math.max(...xs) - Math.min(...xs) + NODE_W + 200, h: Math.max(...ys) - Math.min(...ys) + 240 + 200 };
  }
  function drawMinimap() {
    state.miniDirty = false;
    if (!mmCtx) return;
    const W = 168, H = 124;
    mmCtx.clearRect(0, 0, W, H);
    mmCtx.fillStyle = '#0A0C12'; mmCtx.fillRect(0, 0, W, H);
    const b = worldBounds(); if (!b) return;
    const k = Math.min(W / b.w, H / b.h), ox = (W - b.w * k) / 2 - b.x * k, oy = (H - b.h * k) / 2 - b.y * k;
    for (const f of graph.flows) {
      const s = graph.nodes.find(n => n.id === f.sourceId), t = graph.nodes.find(n => n.id === f.targetId);
      if (!s || !t) continue;
      mmCtx.strokeStyle = flowColor(f); mmCtx.globalAlpha = f.isActive ? .85 : .3; mmCtx.lineWidth = 1.2;
      mmCtx.beginPath(); mmCtx.moveTo((s.x + 40) * k + ox, (s.y + 60) * k + oy); mmCtx.lineTo((t.x + 40) * k + ox, (t.y + 60) * k + oy); mmCtx.stroke();
    }
    mmCtx.globalAlpha = 1;
    for (const n of graph.nodes) {
      const p = portalOf(n);
      mmCtx.shadowBlur = 4; mmCtx.shadowColor = p.color;
      mmCtx.fillStyle = p.color; mmCtx.globalAlpha = n.isEnabled ? .95 : .45;
      mmCtx.fillRect(n.x * k + ox, n.y * k + oy, Math.max(4, NODE_W * k), Math.max(3, 140 * k));
    }
    mmCtx.shadowBlur = 0; mmCtx.globalAlpha = 1;
    mmCtx.strokeStyle = 'rgba(99,102,241,.95)'; mmCtx.lineWidth = 1.2;
    mmCtx.strokeRect((-viewport.x / viewport.scale) * k + ox, (-viewport.y / viewport.scale) * k + oy, (cw() / viewport.scale) * k, (ch() / viewport.scale) * k);
  }

  /* =================================================================
     CONNECT
     ================================================================= */
  function startConnect(e, node, from) {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    if (refs.canvas.setPointerCapture) { try { refs.canvas.setPointerCapture(e.pointerId); } catch (_) {} }
    const a = nodeAnchors(node);
    const p = from === 'action' ? a.action : a.trigger;
    state.connecting = { sourceId: node.id, from, sx: p.x, sy: p.y, tx: p.x, ty: p.y, snap: null };
    refs.canvas.classList.add('connecting');
    drawPreview();
  }

  function updateConnect(e) {
    const c = state.connecting;
    const w = toWorld(e.clientX - rectLeft(), e.clientY - rectTop());
    c.tx = w.x; c.ty = w.y;
    let best = null, bestD = SNAP_R;
    for (const n of graph.nodes) {
      if (n.id === c.sourceId) continue;
      const anch = nodeAnchors(n);
      for (const key of ['trigger', 'action']) {
        const sp = toScreen(anch[key].x, anch[key].y);
        const d = Math.hypot(sp.x - (e.clientX - rectLeft()), sp.y - (e.clientY - rectTop()));
        if (d < bestD) { bestD = d; best = { nodeId: n.id, handle: key, anchor: anch[key] }; }
      }
    }
    if (!best) {
      for (const n of graph.nodes) {
        if (n.id === c.sourceId) continue;
        const elx = nodeEls.get(n.id);
        const wd = elx ? (elx.offsetWidth || NODE_W) : NODE_W;
        const hd = elx ? (elx.offsetHeight || 152) : 152;
        if (w.x >= n.x - 4 && w.x <= n.x + wd + 4 && w.y >= n.y - 4 && w.y <= n.y + hd + 4) {
          const key = c.from === 'action' ? 'trigger' : 'action';
          best = { nodeId: n.id, handle: key, anchor: nodeAnchors(n)[key] };
          break;
        }
      }
    }
    c.snap = best;
    refs.canvas.querySelectorAll('.fb-handle.accept').forEach(h => h.classList.remove('accept'));
    if (best) {
      const t = nodeEls.get(best.nodeId);
      t?.querySelector(best.handle === 'trigger' ? '.fb-handle-trigger' : '.fb-handle-action')?.classList.add('accept');
    }
    drawPreview();
  }

  function drawPreview() {
    refs.svg.querySelectorAll('.fb-preview,.fb-preview-end,.fb-preview-halo').forEach(n => n.remove());
    const c = state.connecting; if (!c) return;
    const src = graph.nodes.find(n => n.id === c.sourceId);
    const color = portalOf(src).color;
    const end = c.snap ? c.snap.anchor : { x: c.tx, y: c.ty };
    const dx = clamp(Math.abs(end.x - c.sx) * .5, 70, 240) * (end.x >= c.sx ? 1 : -1);
    refs.svg.append(
      svgEl('path', { d: `M ${c.sx} ${c.sy} C ${c.sx + dx} ${c.sy}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`, class: 'fb-preview', style: `stroke:${color}` }),
      svgEl('circle', { cx: end.x, cy: end.y, r: 12, class: 'fb-preview-halo', style: `fill:${color}` }),
      svgEl('circle', { cx: end.x, cy: end.y, r: 4.6, class: 'fb-preview-end', style: `fill:${color}` }));
  }
  function clearPreview() {
    refs.svg.querySelectorAll('.fb-preview,.fb-preview-end,.fb-preview-halo').forEach(n => n.remove());
    refs.canvas.classList.remove('connecting');
    refs.canvas.querySelectorAll('.fb-handle.accept').forEach(h => h.classList.remove('accept'));
    state.connecting = null;
  }

  /* =================================================================
     CRUD
     ================================================================= */
  function createNode(portalId, x, y) {
    if (READONLY) return null;
    const n = { id: uid('n'), portalId, x: Math.round(x), y: Math.round(y), name: '', isEnabled: true, status: 'Online', latencyMs: rand(24, 68), endpoint: null };
    graph.nodes.push(n);
    const elx = buildNode(n); nodeEls.set(n.id, elx); refs.nodeLayer.appendChild(elx); bindNode(elx, n);
    afterAppend(n, elx);
    commit(); updateFlowCounts();
    return n;
  }
  function dropAt(clientX, clientY, portalId) {
    if (READONLY) return null;
    const w = toWorld(clientX - rectLeft(), clientY - rectTop());
    return createNode(portalId, w.x - NODE_W / 2, w.y - 60);
  }
  function deleteNode(id) {
    if (READONLY) return;
    const elx = nodeEls.get(id);
    const doIt = () => {
      graph.flows = graph.flows.filter(f => f.sourceId !== id && f.targetId !== id);
      graph.nodes = graph.nodes.filter(n => n.id !== id);
      elx?.remove(); nodeEls.delete(id);
      if (state.selected?.id === id) deselect();
      renderFlows(); commit(); updateFlowCounts();
    };
    if (elx) { elx.classList.add('deleting'); setTimeout(doIt, 260); } else doIt();
  }
  function copyNode(id) {
    if (READONLY) return null;
    const src = graph.nodes.find(n => n.id === id); if (!src) return null;
    const c = { ...deep(src), id: uid('n'), x: src.x + 46, y: src.y + 46 };
    graph.nodes.push(c);
    const elx = buildNode(c); nodeEls.set(c.id, elx); refs.nodeLayer.appendChild(elx); bindNode(elx, c);
    afterAppend(c, elx); select('node', c.id); commit(); updateFlowCounts();
    return c;
  }
  function createFlow(sourceId, targetId, direction = 'forward', name = '') {
    if (READONLY) return null;
    if (sourceId === targetId) { toast('لا يمكن ربط البوابة بنفسها', 'warn'); return null; }
    const dup = graph.flows.find(f =>
      f.sourceId === sourceId && f.targetId === targetId && f.direction === direction);
    if (dup) {
      toast('يوجد تدفق مطابق بنفس الاتجاه — عدّل الموجود أو غيّر نوعه', 'warn');
      select('flow', dup.id);
      return null;
    }
    const src = graph.nodes.find(n => n.id === sourceId);
    const p = portalOf(src);
    const f = {
      id: uid('f'), name: name || ('تدفق: ' + nodeTitle(src)), direction, sourceId, targetId,
      isActive: true, color: '', triggerEvent: p.events?.[0] || 'data.received',
      actionEvent: 'sync.record', mappingRules: [], conditions: [], logic: 'AND', logs: []
    };
    graph.flows.push(f);
    renderFlows(); commit(); updateFlowCounts();
    return f;
  }
  function deleteFlow(id) {
    if (READONLY) return;
    graph.flows = graph.flows.filter(f => f.id !== id);
    if (state.selected?.id === id) deselect();
    renderFlows(); commit(); updateFlowCounts();
    toast('تم حذف التدفق', 'info');
  }
  function clearAll() {
    if (READONLY) return;
    graph = { nodes: [], flows: [] };
    renderNodes(); renderFlows(); deselect(); commit();
  }

  /* real data event from your platform */
  function pulse(flowId, status = 'success', payload = null) {
    const rec = flowRecs.get(flowId);
    if (!rec || !rec.f.isActive) return false;
    const color = status === 'failed' ? '#EF4444' : status === 'skipped' ? '#94A3B8' : null;
    rec.comets.push({ t0: performance.now() + 26, lane: 0, dur: 1100, len: 0.09, color });
    addPacketLog(rec.f, status, payload);
    return true;
  }
  function updateEdgeStats(onlyId) {
    for (const [id, rec] of flowRecs) {
      if (onlyId && id !== onlyId) continue;
      const el = rec.ui.querySelector('[data-stat]'); if (!el) continue;
      const last = (rec.f.logs && rec.f.logs[0]) || null;
      if (!last) { el.textContent = ''; el.className = 'fb-edge-stat'; continue; }
      const ic = last.status === 'success' ? '✓' : last.status === 'failed' ? '✕' : '→';
      el.textContent = ic + ' ' + (last.ms || 0) + 'ms';
      el.className = 'fb-edge-stat ' + last.status;
      el.title = (last.msg || last.status) + ' — ' + new Date(last.at).toLocaleTimeString();
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
  }
  function addPacketLog(f, status, payload) {
    f.logs = f.logs || [];
    f.logs.unshift({
      status, http: status === 'failed' ? 500 : (status === 'skipped' ? 202 : 200),
      ms: Math.round(50 + Math.random() * 380), at: Date.now(),
      msg: payload ? ((payload.flow || payload.summary) || '') : ''
    });
    f.logs = f.logs.slice(0, 30);
    updateEdgeStats(f.id);
    refreshLogsIfOpen();
  }

  /* =================================================================
     EXPORT / IMPORT (JSON)
     ================================================================= */
  function exportGraph() { return JSON.stringify(getGraph(), null, 2); }
  function importGraph(jsonStrOrObj) {
    if (READONLY) return false;
    let data = jsonStrOrObj;
    if (typeof jsonStrOrObj === 'string') { try { data = JSON.parse(jsonStrOrObj); } catch (_) { toast('ملف JSON غير صالح', 'err'); return false; } }
    graph = sanitize(data);
    renderNodes(); renderFlows(); deselect(); fit(); commit();
    toast('تم استيراد المخطط (' + graph.nodes.length + ' عقدة)', 'ok');
    return true;
  }

  /* =================================================================
     DRAWER
     ================================================================= */
  function drawerShell(title, body, footer = '') {
    const old = $('.fb-drawer'); if (old) old.remove();
    const d = el('fb-drawer');
    d.innerHTML = `<div class="fb-drawer-h"><span class="t">${title}</span><button class="fb-x" data-x>✕</button></div>
      <div class="fb-drawer-b">${READONLY ? '<fieldset class="fb-rofield" disabled>' + body + '</fieldset>' : body}</div>${READONLY ? '' : footer}`;
    root.appendChild(d);
    d.querySelector('[data-x]').addEventListener('click', closeDrawer);
    root.classList.add('drawer-open');
    wireDrawer();
    return d;
  }
  function closeDrawer() {
    root.classList.remove('drawer-open');
    const d = $('.fb-drawer'); if (d) d.remove();
  }
  function openDrawer() {
    if (!state.selected) { closeDrawer(); return; }
    if (state.selected.type === 'node') nodeDrawer(state.selected.id);
    else flowDrawer(state.selected.id);
  }
  function wireDrawer() {
    const body = $('.fb-drawer-b');
    body.addEventListener('change', drawerOnChange);
    body.addEventListener('input', drawerOnChange);
    body.addEventListener('click', drawerOnClick);
  }
  let pendingF = null, pendingN = null;

  function nodeDrawer(id) {
    const n = graph.nodes.find(x => x.id === id); if (!n) return;
    pendingN = n;
    const p = portalOf(n);
    const st = { Online: '#10B981', Degraded: '#F59E0B', Offline: '#EF4444' }[n.status];
    drawerShell(READONLY ? 'عرض البوابة' : 'إعدادات البوابة', `
      <div class="fb-cfg-head" style="--pc:${p.color}">
        <div class="fb-cfg-avatar">${p.icon}</div>
        <div><div class="fb-cfg-name">${esc(p.label)}</div><div class="fb-cfg-sub">${esc(p.labelAr || '')} <span class="fb-badge" style="--bc:${p.color}">${esc(p.category || '')}</span></div></div>
      </div>
      <div class="fb-cfg-statusline"><span><span class="fb-status-dot${n.status === 'Online' ? ' pulse' : ''}" style="--sd:${st}"></span> <b>${esc(n.status)}</b></span>
        <span style="margin-inline-start:auto" class="fb-mono"><b>${+n.latencyMs || 0}ms</b></span></div>
      <div class="fb-field"><label class="fb-label">اسم العقدة (يظهر على اللوحة)</label>
        <input class="fb-input" data-f="name" value="${esc(n.name || '')}" placeholder="${esc(p.label)}"></div>
      <div class="fb-field"><label class="fb-label">تفعيل البوابة</label>
        <label class="fb-switch" style="--sc:${p.color}"><input type="checkbox" data-f="enabled"${n.isEnabled ? ' checked' : ''}><span></span></label></div>
      <div class="fb-row">
        <div class="fb-field"><label class="fb-label">الحالة</label>
          <select class="fb-select" data-f="status">${['Online','Degraded','Offline'].map(s => `<option${n.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="fb-field"><label class="fb-label">الاستجابة (ms)</label>
          <input class="fb-input fb-mono" type="number" min="1" max="9999" data-f="latency" value="${+n.latencyMs || 0}"></div>
      </div>
      <div class="fb-field"><label class="fb-label">API Endpoint</label>
        <input class="fb-input fb-mono" data-f="endpoint" value="${esc(n.endpoint || p.endpoint || '')}" spellcheck="false"></div>
      ${READONLY ? '<div class="fb-rule-note">وضع العرض فقط — التعديل معطل</div>' : '<button class="fb-btn primary" data-act="test" style="width:100%">⚡ اختبار الاتصال</button>'}`,
      `${READONLY ? '' : '<button class="fb-btn danger" data-act="delnode">حذف العقدة</button><button class="fb-btn primary" data-act="save">حفظ التغييرات</button>'}`);
  }

  function flowDrawer(id) {
    const f = graph.flows.find(x => x.id === id); if (!f) return;
    pendingF = f;
    const s = graph.nodes.find(n => n.id === f.sourceId), t = graph.nodes.find(n => n.id === f.targetId);
    if (!s || !t) return;
    const sp = portalOf(s), tp = portalOf(t), meta = flowMeta(f);
    const tab = state.edgeTab;
    drawerShell(READONLY ? 'عرض التدفق' : 'إعدادات التدفق', `
      <div class="fb-cfg-head" style="--pc:${flowColor(f)}">
        <div class="fb-cfg-avatar">${meta.icon}</div>
        <div><div class="fb-cfg-name">${esc(nodeTitle(s))} → ${esc(nodeTitle(t))}</div>
        <div class="fb-cfg-sub"><span class="fb-dir-chip" style="--dc:${meta.color}">${meta.icon}</span> ${meta.label}</div>
      </div></div>
      <div class="fb-cfg-statusline"><span><span class="fb-status-dot${f.isActive ? ' pulse' : ''}" style="--sd:${f.isActive ? '#10B981' : '#F59E0B'}"></span><b>${f.isActive ? 'Active' : 'Paused'}</b></span>
        <span class="fb-mono" style="margin-inline-start:auto">${esc(f.triggerEvent || '—')}</span></div>
      <div class="fb-tabs">${['النوع','الحدث','ربط الحقول','الشروط','السجلات'].map((x, i) => `<button class="fb-tab${i === tab ? ' on' : ''}" data-tab="${i}">${x}</button>`).join('')}</div>
      <div>${flowTabHtml(f, tab)}</div>`,
      `${READONLY ? '' : '<button class="fb-btn danger" data-act="delflow">حذف التدفق</button><button class="fb-btn primary" data-act="save">حفظ التغييرات</button>'}`);
    pendingF = f;
  }

  function flowTabHtml(f, tab) {
    const s = graph.nodes.find(n => n.id === f.sourceId), t = graph.nodes.find(n => n.id === f.targetId);
    const sp = portalOf(s), tp = portalOf(t);
    const srcEvents = sp.events || ['data.received'], srcFields = sp.fields || ['id', 'value'], tgtFields = tp.fields || ['id', 'value'];
    const dirs = FLOW_META;
    if (tab === 0) {
      return `<div class="fb-field"><label class="fb-label">اسم التدفق</label>
        <input class="fb-input" data-f="name" value="${esc(f.name)}"></div>
        <div class="fb-field"><label class="fb-label">نوع التدفق</label>
        <div class="fb-dir-grid">${Object.keys(dirs).map(k => `
          <div class="fb-dir-opt${f.direction === k ? ' on' : ''}" data-dir="${k}" role="button">
            <span class="fb-dir-ico" style="color:${dirs[k].color}">${dirs[k].icon}</span>
            <span class="fb-dir-name">${dirs[k].label}</span><span class="fb-dir-desc">${dirs[k].desc}</span>
          </div>`).join('')}</div></div>
        <div class="fb-field"><label class="fb-label">لون الخط</label>
          <div class="fb-swatch-grid" style="grid-template-columns:repeat(9,1fr)">${FLOW_COLORS.map(c => `
            <span class="fb-swatch${(f.color || dirs[f.direction]?.color) === c ? ' on' : ''}" data-fcolor="${c}" style="background:${c};color:${c}"></span>`).join('')}</div>
          <input type="color" class="fb-color-input" style="margin-top:8px" data-fcolor-custom value="${f.color || dirs[f.direction]?.color || '#38BDF8'}">
          <button class="fb-btn sm ghost" data-act="fcolor-reset" style="margin-top:8px;width:100%">↺ استخدام لون نوع التدفق الافتراضي</button></div>
        <div class="fb-field"><label class="fb-label">تفعيل</label>
        <label class="fb-switch" style="--sc:${flowColor(f)}"><input type="checkbox" data-f="active"${f.isActive ? ' checked' : ''}><span></span></label></div>`;
    }
    if (tab === 1) {
      return `<div class="fb-field"><label class="fb-label">حدث المصدر (Trigger)</label>
        <select class="fb-select fb-mono" data-f="trigger">${srcEvents.map(v => `<option${f.triggerEvent === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="fb-field"><label class="fb-label">إجراء الهدف (Action)</label>
        <select class="fb-select fb-mono" data-f="action">${['sync.record','create.record','update.record','delete.record','send.webhook','notify.team','emit.event','log.entry'].map(v => `<option${f.actionEvent === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>`;
    }
    if (tab === 2) {
      let h = `<div class="fb-map-head fb-between" style="font-size:10.5px;color:var(--text-3);margin-bottom:7px;padding:0 4px"><span>حقل المصدر</span><span>→</span><span>حقل الهدف</span><span></span></div>`;
      h += f.mappingRules.map((m, i) => `<div class="fb-map-row">
        <select class="fb-select fb-mono" style="font-size:11px" data-ck="m.s" data-i="${i}">${srcFields.map(x => `<option${m.source === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <span class="fb-map-arrow">→</span>
        <select class="fb-select fb-mono" style="font-size:11px" data-ck="m.t" data-i="${i}">${tgtFields.map(x => `<option${m.target === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <button class="fb-row-del" data-act="delmap" data-i="${i}">✕</button></div>`).join('');
      if (!f.mappingRules.length) h += '<div class="fb-empty" style="padding:18px">لا توجد روابط حقول بعد</div>';
      h += `<button class="fb-btn ghost" data-act="addmap" style="width:100%">+ إضافة ربط</button>`;
      return h;
    }
    if (tab === 3) {
      let h = '';
      f.conditions.forEach((c, i) => {
        h += `<div class="fb-cond-row">
          <select class="fb-select fb-mono" style="font-size:11px" data-ck="c.f" data-i="${i}">${srcFields.map(x => `<option${c.field === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
          <select class="fb-select" style="font-size:11px" data-ck="c.o" data-i="${i}">${[['equals','يساوي'],['not_equals','لا يساوي'],['contains','يحتوي'],['greater_than','أكبر من'],['less_than','أقل من'],['starts_with','يبدأ بـ'],['is_empty','فارغ'],['not_empty','غير فارغ']].map(([v, ar]) => `<option value="${v}"${c.op === v ? ' selected' : ''}>${ar}</option>`).join('')}</select>
          <input class="fb-input fb-mono" style="font-size:11px" data-ck="c.v" data-i="${i}" value="${esc(c.value)}" placeholder="قيمة">
          <button class="fb-row-del" data-act="delcond" data-i="${i}">✕</button></div>`;
        if (i < f.conditions.length - 1) {
          h += `<div class="fb-connector"><span class="line"></span><span class="fb-logic">
            <button class="${f.logic === 'AND' ? 'on' : ''}" data-act="logic" data-v="AND">AND</button>
            <button class="${f.logic === 'OR' ? 'on' : ''}" data-act="logic" data-v="OR">OR</button></span><span class="line"></span></div>`;
        }
      });
      if (!f.conditions.length) h += '<div class="fb-empty" style="padding:18px">لا توجد شروط — التنفيذ دائماً</div>';
      h += `<button class="fb-btn ghost" data-act="addcond" style="width:100%">+ إضافة شرط</button>`;
      return h;
    }
    let h = '';
    const lg = f.logs || [];
    if (!lg.length) h = '<div class="fb-empty" style="padding:20px">لا توجد سجلات بعد — تظهر هنا سجلات التنفيذ الحقيقية القادمة من منصتك</div>';
    else lg.slice(0, 8).forEach(l => {
      const cls = l.status === 'success' ? 'ok' : l.status === 'failed' ? 'err' : 'skip';
      const ico = l.status === 'success' ? '✓' : l.status === 'failed' ? '✕' : '→';
      const msg = l.status === 'success' ? 'نجحت المزامنة' : l.status === 'failed' ? 'فشل التنفيذ' : 'تم التخطي (الشرط)';
      h += `<div class="fb-log ${cls}"><span class="fb-log-ico">${ico}</span>
        <div class="fb-log-main"><div class="fb-log-msg">${msg}${l.msg ? ' — ' + esc(l.msg) : ''}</div>
        <div class="fb-log-sub">${relTimeLocal(l.at)}</div></div>
        <span class="fb-log-http">${l.http}</span><span class="fb-log-ms">${l.ms ? l.ms + 'ms' : '—'}</span></div>`;
    });
    return h;
  }

  function relTimeLocal(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 5) return 'الآن';
    if (s < 60) return 'منذ ' + s + ' ثانية';
    const m = Math.floor(s / 60);
    if (m < 60) return m === 1 ? 'منذ دقيقة' : 'منذ ' + m + ' دقيقة';
    const h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? 'منذ ساعة' : 'منذ ' + h + ' ساعة';
    return 'منذ ' + Math.floor(h / 24) + ' يوم';
  }

  function drawerOnChange(e) {
    const t = e.target; if (!t.dataset || READONLY) return;
    if (pendingN && state.selected?.type === 'node') {
      const n = pendingN;
      if (t.dataset.f === 'name') { n.name = t.value; syncNode(n); }
      if (t.dataset.f === 'enabled') { n.isEnabled = !!t.checked; syncNode(n); }
      if (t.dataset.f === 'status') { n.status = t.value; syncNode(n); }
      if (t.dataset.f === 'latency') { n.latencyMs = clamp(parseInt(t.value, 10) || 0, 1, 9999); syncNode(n); }
      if (t.dataset.f === 'endpoint') { n.endpoint = t.value.trim(); }
      commit(); return;
    }
    if (pendingF && state.selected?.type === 'flow') {
      const f = pendingF;
      if (t.dataset.f === 'name') { f.name = t.value; refreshFlowStyles(); commit(); return; }
      if (t.dataset.f === 'active') { f.isActive = t.checked; refreshFlowStyles(); commit(); return; }
      if (t.dataset.f === 'trigger') { f.triggerEvent = t.value; commit(); return; }
      if (t.dataset.f === 'action') { f.actionEvent = t.value; commit(); return; }
      if (t.dataset.ck === 'm.s') { f.mappingRules[+t.dataset.i].source = t.value; commit(); return; }
      if (t.dataset.ck === 'm.t') { f.mappingRules[+t.dataset.i].target = t.value; commit(); return; }
      if (t.dataset.ck === 'c.f') { f.conditions[+t.dataset.i].field = t.value; commit(); return; }
      if (t.dataset.ck === 'c.o') { f.conditions[+t.dataset.i].op = t.value; commit(); return; }
      if (t.dataset.ck === 'c.v') { f.conditions[+t.dataset.i].value = t.value; commit(); }
    }
  }
  function drawerOnClick(e) {
    const fc = e.target.closest('[data-fcolor]');
    if (fc && pendingF) { pendingF.color = fc.dataset.fcolor; refreshFlowStyles(); openDrawer(); commit(); return; }
    const fcr = e.target.closest('[data-fcolor-custom]');
    if (fcr && pendingF) { pendingF.color = fcr.value; refreshFlowStyles(); commit(); return; }
    const dirEl = e.target.closest('[data-dir]');
    if (dirEl && pendingF) { pendingF.direction = dirEl.dataset.dir; refreshFlowStyles(); openDrawer(); commit(); return; }
    const tabEl = e.target.closest('[data-tab]');
    if (tabEl) { state.edgeTab = +tabEl.dataset.tab; openDrawer(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act || READONLY) return;
    const f = pendingF, n = pendingN;
    if (act === 'addmap' && f) { f.mappingRules.push({ source: (portalOf(graph.nodes.find(x => x.id === f.sourceId)).fields || ['id'])[0], target: (portalOf(graph.nodes.find(x => x.id === f.targetId)).fields || ['id'])[0] }); openDrawer(); commit(); }
    if (act === 'delmap' && f) { f.mappingRules.splice(+e.target.dataset.i, 1); openDrawer(); commit(); }
    if (act === 'addcond' && f) { f.conditions.push({ field: (portalOf(graph.nodes.find(x => x.id === f.sourceId)).fields || ['id'])[0], op: 'equals', value: '' }); openDrawer(); commit(); }
    if (act === 'delcond' && f) { f.conditions.splice(+e.target.dataset.i, 1); openDrawer(); commit(); }
    if (act === 'logic' && f) { f.logic = e.target.dataset.v; openDrawer(); commit(); }
    if (act === 'fcolor-reset' && f) { f.color = ''; refreshFlowStyles(); openDrawer(); commit(); }
    if (act === 'test' && n) {
      const btn = e.target.closest('[data-act="test"]');
      btn.disabled = true; btn.textContent = 'جارٍ الفحص...';
      setTimeout(() => {
        btn.disabled = false; btn.textContent = '⚡ اختبار الاتصال';
        n.latencyMs = rand(18, 60); syncNode(n); commit();
        toast('تم الفحص — ' + n.latencyMs + 'ms', 'ok');
      }, 900);
    }
    if (act === 'save') { persistNow(); toast('تم حفظ الإعدادات', 'ok'); }
    if (act === 'delnode' && n) { nodeDrawerConfirm(n.id); }
    if (act === 'delflow' && f) { flowDrawerConfirm(f.id); }
  }
  function nodeDrawerConfirm(id) {
    engineConfirm('حذف العقدة', 'سيتم حذف هذه العقدة وكل التدفقات المرتبطة بها. لا يمكن التراجع.', 'حذف نهائي', () => { closeDrawer(); deleteNode(id); });
  }
  function flowDrawerConfirm(id) {
    engineConfirm('حذف التدفق', 'سيتم حذف هذا التدفق نهائياً.', 'حذف', () => { closeDrawer(); deleteFlow(id); });
  }
  function engineConfirm(title, msg, okLabel, onOk) {
    const back = el('fb-modal-back');
    back.innerHTML = `<div class="fb-modal" style="width:370px">
      <div class="fb-modal-h"><h3>${esc(title)}</h3></div>
      <div class="fb-modal-b" style="padding:14px 18px"><div style="font-size:13px;color:var(--text-2);line-height:1.8">${esc(msg)}</div></div>
      <div class="fb-modal-f">
        <button class="fb-btn" data-no>إلغاء</button>
        <button class="fb-btn danger" data-yes style="min-width:110px">${esc(okLabel)}</button>
      </div></div>`;
    root.appendChild(back);
    requestAnimationFrame(() => back.classList.add('open'));
    const done = (v) => { back.classList.remove('open'); setTimeout(() => back.remove(), 160); if (v) onOk && onOk(); };
    back.querySelector('[data-no]').addEventListener('click', () => done(false));
    back.querySelector('[data-yes]').addEventListener('click', () => done(true));
    back.addEventListener('click', (e) => { if (e.target === back) done(false); });
  }

  /* =================================================================
     CONTEXT MENU
     ================================================================= */
  let ctxEl = null;
  function ctxMenu(x, y, target) {
    hideCtx();
    ctxEl = el('fb-ctx');
    const items = target.type === 'node'
      ? (READONLY
          ? `<div class="fb-ctx-item" data-a="edit">👁️ عرض الإعدادات</div>`
          : `<div class="fb-ctx-item" data-a="edit">⚙️ تعديل الإعدادات</div>
             <div class="fb-ctx-item" data-a="copy">📄 نسخ العقدة</div>
             <div class="fb-ctx-sep"></div>
             <div class="fb-ctx-item danger" data-a="del">🗑️ حذف العقدة</div>`)
      : (READONLY
          ? `<div class="fb-ctx-item" data-a="edit">👁️ عرض التدفق</div>`
          : `<div class="fb-ctx-item" data-a="edit">⚙️ إعدادات التدفق</div>
             <div class="fb-ctx-sep"></div>
             <div class="fb-ctx-item danger" data-a="del">🗑️ حذف التدفق</div>`);
    ctxEl.innerHTML = items;
    ctxEl.style.left = Math.min(x, window.innerWidth - 210) + 'px';
    ctxEl.style.top = Math.min(y, window.innerHeight - 170) + 'px';
    document.body.appendChild(ctxEl);
    ctxEl.classList.add('open');
    ctxEl.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; hideCtx();
      if (target.type === 'node') {
        if (a === 'edit') select('node', target.id);
        if (a === 'copy') copyNode(target.id);
        if (a === 'del') deleteNode(target.id);
      } else {
        if (a === 'edit') select('flow', target.id);
        if (a === 'del') deleteFlow(target.id);
      }
    });
  }
  function hideCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }

  /* =================================================================
     GLOBAL EVENTS
     ================================================================= */
  function onCanvasPointerDown(e) {
    stopAnim();
    if (e.target.closest('.fb-node') || e.target.closest('.fb-edge-ui-item')) return;
    if (e.button === 1 || e.button === 0) {
      if (e.button === 1) e.preventDefault();
      state.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx0: viewport.x, vy0: viewport.y, moved: false };
      refs.canvas.classList.add('panning'); hideCtx();
    }
  }
  function onWinPointerMove(e) {
    if (state.connecting) { updateConnect(e); return; }
    const c = state.drag; if (!c) return;
    const dx = e.clientX - c.sx, dy = e.clientY - c.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) c.moved = true;
    if (c.kind === 'pan') {
      viewport.x = c.vx0 + dx; viewport.y = c.vy0 + dy; applyViewport();
    } else if (c.kind === 'node') {
      const w = toWorld(e.clientX - rectLeft(), e.clientY - rectTop());
      const n = graph.nodes.find(x => x.id === c.id);
      n.x = Math.round(w.x - c.gx); n.y = Math.round(w.y - c.gy);
      const elx = nodeEls.get(n.id);
      if (elx) { elx.style.left = n.x + 'px'; elx.style.top = n.y + 'px'; }
      recomputeFlows();
      state.miniDirty = true;
    }
  }
  function onWinPointerUp(e) {
    if (state.connecting) {
      const c = state.connecting;
      const target = c.snap && c.snap.nodeId !== c.sourceId ? c.snap : null;
      clearPreview();
      if (target) {
        state.edgeTab = 0;
        const direction = (c.from === 'action') ? 'reverse' : 'forward';
        const f = createFlow(c.sourceId, target.nodeId, direction);
        if (f) select('flow', f.id);
      } else {
        toast('أفلت فوق إحدى العقد لإنشاء التدفق', 'info');
      }
      return;
    }
    const c = state.drag; if (!c) return;
    refs.canvas.classList.remove('panning'); state.drag = null;
    if (c.kind === 'node' && !c.moved) select('node', c.id);
    else if (c.kind === 'pan' && !c.moved && e.button === 0) deselect();
    else if (c.kind === 'node' && c.moved) commit();
  }
  function onWheel(e) {
    e.preventDefault();
    const r = refs.canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }
  function onKey(e) {
    const inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); if (!inField) undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); if (!inField) redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); zoomAt(cw() / 2, ch() / 2, 1.1); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomAt(cw() / 2, ch() / 2, 1 / 1.1); return; }
    if (inField || READONLY) return;
    if (e.key === 'Escape') { hideCtx(); closeDrawer(); deselect(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      e.preventDefault();
      state.selected.type === 'node' ? deleteNode(state.selected.id) : deleteFlow(state.selected.id);
    }
    if (state.selected?.type === 'node' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const n = graph.nodes.find(x => x.id === state.selected.id); if (!n) return;
      const d = e.shiftKey ? 24 : 8;
      if (e.key === 'ArrowLeft') n.x -= d; if (e.key === 'ArrowRight') n.x += d;
      if (e.key === 'ArrowUp') n.y -= d; if (e.key === 'ArrowDown') n.y += d;
      const elx = nodeEls.get(n.id);
      if (elx) { elx.style.left = n.x + 'px'; elx.style.top = n.y + 'px'; }
      recomputeFlows(); commit();
    }
  }
  function onResize() { state.miniDirty = true; }
  function onDocClick() { hideCtx(); }

  refs.canvas.addEventListener('pointerdown', onCanvasPointerDown);
  window.addEventListener('pointermove', onWinPointerMove);
  window.addEventListener('pointerup', onWinPointerUp);
  refs.canvas.addEventListener('wheel', onWheel, { passive: false });
  refs.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('click', onDocClick);
  window.addEventListener('blur', hideCtx);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  /* ---------- toolbar ---------- */
  root.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tb]')?.dataset.tb;
    if (!tb) return;
    if (tb === 'zoomout') zoomAt(cw() / 2, ch() / 2, 1 / 1.1);
    if (tb === 'zoomin') zoomAt(cw() / 2, ch() / 2, 1.1);
    if (tb === 'zoomreset') zoomReset();
    if (tb === 'fit') fit();
    if (tb === 'undo') undo();
    if (tb === 'redo') redo();
    if (tb === 'export') {
      const name = 'flowbridge-graph-' + new Date().toISOString().slice(0, 10) + '.json';
      const blob = new Blob([exportGraph()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 800);
      toast('تم تصدير المخطط', 'ok');
    }
    if (tb === 'import') importFilePicker();
    if (tb === 'clear') engineConfirm('مسح اللوحة', 'سيتم حذف جميع العقد والتدفقات من اللوحة. لا يمكن التراجع عن هذا الإجراء.', 'مسح الكل', clearAll);
    if (tb === 'save') save();
  });
  function importFilePicker() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try { importGraph(await file.text()); } catch (_) { toast('تعذر قراءة الملف', 'err'); }
    };
    input.click();
  }

  function updateHistoryBtns() {
    root.querySelectorAll('[data-tb="undo"]').forEach(b => { b.disabled = !canUndo(); b.style.opacity = canUndo() ? '' : '.35'; });
    root.querySelectorAll('[data-tb="redo"]').forEach(b => { b.disabled = !canRedo(); b.style.opacity = canRedo() ? '' : '.35'; });
  }

  function save() {
    if (READONLY) return;
    const btn = refs.saveBtn, txt = btn.querySelector('[data-save-txt]');
    if (btn.classList.contains('done')) return;
    btn.classList.add('busy'); txt.textContent = 'جارٍ الحفظ...';
    setTimeout(() => {
      btn.classList.remove('busy'); btn.classList.add('done'); txt.textContent = '✓ تم الحفظ';
      persistNow();
      toast('تم حفظ المخطط', 'ok');
      setTimeout(() => { btn.classList.remove('done'); txt.textContent = 'حفظ'; }, 1500);
    }, 500);
  }

  /* ---------- minimap ---------- */
  refs.minimap.addEventListener('click', (e) => {
    const b = worldBounds(); if (!b) return;
    const r = refs.minimap.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * 168, py = (e.clientY - r.top) / r.height * 124;
    const k = Math.min(168 / b.w, 124 / b.h);
    const wx = (px - (168 - b.w * k) / 2 + b.x * k) / k, wy = (py - (124 - b.h * k) / 2 + b.y * k) / k;
    animateTo({ x: cw() / 2 - wx * viewport.scale, y: ch() / 2 - wy * viewport.scale, scale: viewport.scale }, 260);
  });

  /* ---------- toast ---------- */
  let toastHost = null;
  function toast(msg, type = 'info') {
    if (destroyed) return;
    if (!toastHost) {
      toastHost = el('fb-toasts');
      document.body.appendChild(toastHost);
    }
    const icons = { ok: '✓', err: '✕', warn: '⚠', info: 'ℹ' };
    const t = el('fb-toast ' + type, `<span class="t-ico">${icons[type] || 'ℹ'}</span><span>${esc(msg)}</span>`);
    toastHost.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2300);
  }

  /* =================================================================
     INIT / API / DESTROY
     ================================================================= */
  function getGraph() { return { nodes: deep(graph.nodes), flows: deep(graph.flows) }; }
  function setGraph(g) {
    graph = sanitize(g);
    renderNodes(); renderFlows(); deselect(); emitChange();
  }
  function render() { renderNodes(); renderFlows(); applyViewport(); updateFlowCounts(); updateHistoryBtns(); updateSaveUI(); }
  render();
  snap();                       // initial history state
  updateHistoryBtns();
  requestAnimationFrame(() => { if (!destroyed) fit(); });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(rafId);
    stopAnim();
    window.removeEventListener('pointermove', onWinPointerMove);
    window.removeEventListener('pointerup', onWinPointerUp);
    window.removeEventListener('click', onDocClick);
    window.removeEventListener('blur', hideCtx);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    hideCtx(); closeDrawer();
    if (toastHost && toastHost.parentNode) toastHost.remove();
    root.classList.remove('drawer-open', 'fb-engine');
    root.innerHTML = '';
  }

  return {
    getGraph, setGraph, pulse, save, fit, dropAt,
    createNode, deleteNode, copyNode, select,
    createFlow, deleteFlow, clearAll,
    undo, redo, canUndo, canRedo,
    exportGraph, importGraph,
    onGraphChange(cb) { onGraphChange = cb; },
    refresh: () => { portals = normalizePortals(opts.portals); render(); },
    destroy
  };
}

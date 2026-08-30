/* ================================================================
   FlowBridge · App Entry — router + store boot + global config
   ----------------------------------------------------------------
   Platform integration config (set BEFORE this file loads):
     window.FlowBridgeConfig = {
       apiUrl: 'https://platform.example.com/api',   // optional backend
       apiToken: '...',                              // optional auth
     };
   NO demo data — the app starts fully empty.

   Real-time contract from your platform:
     bus.emit('data:in', { flowId, status, http, ms, payload })
   or directly: engine.pulse(flowId, status, payload)
   ================================================================ */

import { store } from './core/store.js';
import { bus } from './core/bus.js';
import { attachDataStream } from './core/store.js';
import { initFlowEngine } from './engine/engine.js';
import { mountDashboard } from './pages/dashboard.js';
import { mountDesigner } from './pages/designer.js';
import { mountPortals } from './pages/portals.js';
import { mountFlows } from './pages/flows.js';
import { mountSettings } from './pages/settings.js';

window.FlowBridgeApp = {
  store, bus, initFlowEngine,
  mountDashboard, mountDesigner, mountPortals, mountFlows, mountSettings
};

const VIEWS = {
  dashboard: { label: 'لوحة القيادة', ik: '📊', mount: mountDashboard },
  designer:  { label: 'المصمم',       ik: '🎨', mount: mountDesigner },
  portals:   { label: 'البوابات',     ik: '🚪', mount: mountPortals },
  flows:     { label: 'التدفقات',     ik: '🔀', mount: mountFlows },
  settings:  { label: 'الإعدادات',    ik: '⚙️', mount: mountSettings }
};

let currentView = null;
let mounted = null;

function renderNav() {
  document.querySelectorAll('[data-view]').forEach(a =>
    a.classList.toggle('on', a.dataset.view === currentView));
}

function navigate(view) {
  if (!VIEWS[view]) view = 'designer';
  currentView = view;
  const host = document.getElementById('view');
  if (!host) return;
  if (mounted && mounted.destroy) { try { mounted.destroy(); } catch (_) {} }
  host.innerHTML = '';
  mounted = VIEWS[view].mount(host);
  renderNav();
  window.FlowBridge = {
    getGraph: () => store.getGraph(),
    loadGraph: (g) => store.setGraph(g),
    getEngine: () => (mounted && mounted.engine) || null
  };
  try { history.replaceState(null, '', '#' + view); } catch (_) {}
}

function boot() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;   // embed mode (page.html has no shell)
  topbar.innerHTML = `
    <div class="fb-brand">
      <div class="fb-brand-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12h5m6 0h5M9 8l-3 4 3 4M15 8l3 4-3 4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div>
        <div class="fb-brand-name">FlowBridge</div>
        <div class="fb-brand-sub">محرك تدفقات البيانات — وحدة منصتك</div>
      </div>
    </div>
    <nav class="fb-nav">
      ${Object.entries(VIEWS).map(([k, v]) =>
        `<a href="#${k}" data-view="${k}"><span class="fb-nav-ico">${v.ik}</span>${v.label}</a>`).join('')}
    </nav>
    <div class="fb-top-actions">
      <span class="fb-conn-pill" data-conn><span class="fb-conn-dot"></span><span data-conn-txt>محلي</span></span>
      <span class="fb-ver">v6.0</span>
    </div>`;

  topbar.querySelectorAll('[data-view]').forEach(a =>
    a.addEventListener('click', (e) => { e.preventDefault(); navigate(a.dataset.view); }));

  const cfg = window.FlowBridgeConfig || {};
  const pill = topbar.querySelector('[data-conn]');
  if (cfg.apiUrl) {
    pill.classList.add('is-ok');
    pill.querySelector('[data-conn-txt]').textContent = 'متصل بالمنصة';
  } else {
    pill.classList.add('is-local');
    pill.querySelector('[data-conn-txt]').textContent = 'محلي';
  }

  bus.on('nav:go', navigate);

  const initial = (location.hash || '').replace('#', '');
  navigate(VIEWS[initial] ? initial : 'designer');
}

/* ---------- boot ---------- */
(async function start() {
  try { await store.init(); } catch (err) { console.error('[FlowBridge] store init failed:', err); }
  boot();

  /* real-time events from your platform (NO fake traffic) */
  attachDataStream({
    pulse: (id, st, payload) =>
      (mounted && mounted.engine && mounted.engine.pulse) ? mounted.engine.pulse(id, st, payload) : false
  });
})();

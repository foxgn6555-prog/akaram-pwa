/* ================================================================
   FlowBridge · Core Store + Data Connector
   -----------------------------------------------------------------
   1) Central reactive state: customisable portal catalog, current
      graph (nodes + flows) and settings. Notifies Bus on change.
   2) Data Connector — persistence to localStorage or YOUR backend
      + live data replay API (bus 'data:in') + demo traffic sim.
   ================================================================ */

import { bus, EVT } from './bus.js';
import { storageGet, storageSet } from './utils.js';
import { SEED_PORTALS, SEED_GRAPH, SEED_SETTINGS } from './defaults.js';

/* =================================================================
   PERSISTENCE (localStorage → backend fallback)
   ================================================================= */
const apiBase = () => (window.FlowBridgeConfig?.apiUrl || '').replace(/\/+$/, '');

async function api(path, opts = {}) {
  const base = apiBase();
  const token = window.FlowBridgeConfig?.apiToken || '';
  const res = await fetch(base + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    },
    ...opts
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + path);
  return res.status === 204 ? null : res.json();
}

export async function loadResource(name, seed) {
  try {
    const raw = storageGet('fb2:' + name);
    if (raw !== null) return JSON.parse(raw);
  } catch (_) { /* corrupt — fall through */ }

  if (apiBase()) {
    try {
      const data = await api('/workflows/' + name);
      if (data && Array.isArray(data.items)) return data.items;
      if (data && Array.isArray(data)) return data;
    } catch (err) {
      console.warn('[FlowBridge] backend load failed, using empty state:', err.message);
    }
  }

  const seeded = window.FlowBridgeConfig?.seed?.[name] || seed;
  saveResource(name, seeded);
  return seeded;
}

export async function saveResource(name, value) {
  storageSet('fb2:' + name, JSON.stringify(value));
  if (apiBase()) {
    try { await api('/workflows/' + name, { method: 'PUT', body: JSON.stringify(value) }); }
    catch (err) { console.warn('[FlowBridge] backend save failed:', err.message); }
  }
  bus.emit(EVT.STORE_SAVED, { name });
  return true;
}
export function clearResources() {
  try { ['portals', 'graph', 'settings'].forEach(k => localStorage.removeItem('fb2:' + k)); } catch (_) {}
}

/* =================================================================
   CENTRAL STORE
   ================================================================= */
function createStore() {
  const state = {
    portals: [],                       // customisable portal catalog
    graph: { nodes: [], flows: [] },   // current design
    settings: { autosave: true, apiUrl: '', apiToken: '' },
    ready: false
  };
  const listeners = new Set();

  async function init() {
    const [portals, graph, settings] = await Promise.all([
      loadResource('portals', SEED_PORTALS),
      loadResource('graph', SEED_GRAPH),
      loadResource('settings', SEED_SETTINGS)
    ]);
    state.portals = portals;
    state.graph = graph || { nodes: [], flows: [] };
    state.settings = { ...SEED_SETTINGS, ...(settings || {}), categories: (settings && Array.isArray(settings.categories)) ? settings.categories : SEED_SETTINGS.categories };
    state.ready = true;
    listeners.forEach(fn => fn());
    return state;
  }

  function notify(evt) {
    if (evt) bus.emit(evt);
    listeners.forEach(fn => fn());
  }

  /* ---------- portals ---------- */
  const getPortals = () => state.portals;
  const portalById = (id) => state.portals.find(p => p.id === id);

  function upsertPortal(portal, isNew = false) {
    if (isNew) state.portals.push(portal);
    else {
      const i = state.portals.findIndex(p => p.id === portal.id);
      if (i >= 0) state.portals[i] = portal;
    }
    saveResource('portals', state.portals);
    notify(EVT.PORTALS_CHANGED);
  }

  function removePortal(id) {
    const nodeIds = new Set(state.graph.nodes.filter(n => n.portalId === id).map(n => n.id));
    if (nodeIds.size) {
      state.graph.nodes = state.graph.nodes.filter(n => !nodeIds.has(n.id));
      state.graph.flows = state.graph.flows.filter(f => !nodeIds.has(f.sourceId) && !nodeIds.has(f.targetId));
      saveResource('graph', state.graph);
      bus.emit(EVT.GRAPH_CHANGED);
    }
    state.portals = state.portals.filter(p => p.id !== id);
    saveResource('portals', state.portals);
    notify(EVT.PORTALS_CHANGED);
  }

  /* ---------- graph ---------- */
  const getGraph = () => state.graph;
  function setGraph(graph) {
    state.graph = graph;
    saveResource('graph', graph);
    notify(EVT.GRAPH_CHANGED);
  }
  function patchGraph(patch) { setGraph({ ...state.graph, ...patch }); }

  /* ---------- settings ---------- */
  const getSettings = () => state.settings;
  function setSettings(patch) {
    Object.assign(state.settings, patch);
    saveResource('settings', state.settings);
    notify();
  }

  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  return {
    init, subscribe,
    getPortals, portalById, upsertPortal, removePortal,
    getGraph, setGraph, patchGraph,
    getSettings, setSettings,
    get ready() { return state.ready; }
  };
}

export const store = createStore();

/* =================================================================
   LIVE DATA STREAM — replay real events from your platform
   bus.emit('data:in', { flowId, status, http, ms, payload })
   ================================================================= */
export function attachDataStream(engine) {
  if (!engine) return () => {};
  return bus.on('data:in', (evt) => {
    const flowId = evt && evt.flowId;
    if (!flowId) return;
    const ok = engine.pulse(flowId, evt.status || 'success', evt.payload);
    if (ok) {
      bus.emit(EVT.LOGS_ADDED, { flowId, log: {
        status: evt.status || 'success',
        http: evt.http || 200,
        ms: evt.ms || Math.round(60 + Math.random() * 300),
        at: Date.now()
      }});
    }
  });
}

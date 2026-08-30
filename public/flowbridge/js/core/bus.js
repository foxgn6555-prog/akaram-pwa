/* ================================================================
   FlowBridge · Event Bus — decouples pages / engine / store
   ================================================================ */

export class Bus {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this.map.get(evt)?.delete(fn); }
  emit(evt, payload) {
    this.map.get(evt)?.forEach(fn => {
      try { fn(payload); } catch (err) { console.error('[bus]', evt, err); }
    });
  }
}

export const bus = new Bus();
export const EVT = {
  PORTALS_CHANGED: 'portals:changed',
  FLOWS_CHANGED:   'flows:changed',
  GRAPH_CHANGED:   'graph:changed',
  STORE_SAVED:     'store:saved',
  LOGS_ADDED:      'logs:added'
};

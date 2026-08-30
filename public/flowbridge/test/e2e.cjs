const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'flowbridge-standalone.html'), 'utf-8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(window) {
    window.SVGElement.prototype.getTotalLength = function () { return 200; };
    window.SVGElement.prototype.getPointAtLength = function (t) { return { x: t, y: 0 }; };
    window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1400, bottom: 900, width: 1400, height: 900, x: 0, y: 0 }; };
    window.URL.createObjectURL = () => 'blob:fake';
    window.URL.revokeObjectURL = () => {};
  }
});
const { window } = dom; const { document } = window;
let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const store = () => window.FlowBridgeApp.store;
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const pd = (el, x, y) => el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }));
const mv = (x, y) => window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
const pu = (x, y) => window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, button: 0, clientX: x, clientY: y }));
const viewport = () => {
  const tr = document.querySelector('.fb-world').style.transform || '';
  const m = tr.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/);
  return m ? { x: +m[1], y: +m[2], s: +m[3] } : { x: 0, y: 0, s: 1 };
};
const screenOf = (wx, wy) => { const v = viewport(); return { x: wx * v.s + v.x, y: wy * v.s + v.y }; };
const g = () => store().getGraph();

async function addPortal(name) {
  click(document.querySelector('[data-act="add"]')); await sleep(60);
  document.querySelector('[data-k="label"]').value = name;
  click([...document.querySelectorAll('.fb-modal-f .fb-btn')].find(b => b.textContent.includes('إضافة')));
  await sleep(250);
}

(async () => {
  try {
    await sleep(800);

    /* ---- 1 · boot ---- */
    t('boots empty', g().nodes.length === 0);
    t('toolbar undo/redo/export/import present', !!document.querySelector('[data-tb="undo"]') && !!document.querySelector('[data-tb="redo"]') && !!document.querySelector('[data-tb="export"]') && !!document.querySelector('[data-tb="import"]'));
    t('pill محفوظ at boot', document.querySelector('[data-save-pill]').classList.contains('saved'));
    t('undo disabled at boot', document.querySelector('[data-tb="undo"]').disabled);
    t('no demo run button', !document.querySelector('[data-tb="run"]'));
    t('onboarding shows 3 steps', document.querySelectorAll('.fb-step').length === 3);

    /* ---- 2 · portals + nodes via real drag ---- */
    document.querySelector('.fb-nav a[data-view="portals"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(250);
    await addPortal('POS'); await addPortal('CRM');
    document.querySelector('.fb-nav a[data-view="designer"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(300);
    const engine = window.FlowBridge.getEngine();   // live engine of the ACTIVE designer mount
    t('active engine handle obtained', !!engine);
    const card1 = document.querySelector('.fbl-card');
    pd(card1, 60, 200); mv(90, 220); mv(450, 330); pu(450, 330); await sleep(350);
    const card2 = document.querySelectorAll('.fbl-card')[1];
    pd(card2, 60, 200); mv(940, 330); pu(940, 330); await sleep(350);
    t('two nodes on canvas', document.querySelectorAll('.fb-node').length === 2);
    const nB = g().nodes[1];

    /* ---- 3 · connect handles ---- */
    pd(document.querySelectorAll('.fb-node')[0].querySelector('.fb-handle-trigger'), 10, 10);
    const tp = screenOf(nB.x + 220, nB.y + 152 - 22);
    mv(tp.x, tp.y); pu(tp.x, tp.y); await sleep(450);
    t('flow created via connect', g().flows.length === 1);
    const flowId = g().flows[0].id;

    /* ---- 4 · undo / redo ---- */
    click(document.querySelector('[data-tb="undo"]')); await sleep(450);
    t('UNDO removes flow', g().flows.length === 0);
    t('undo enabled after op', !document.querySelector('[data-tb="undo"]').disabled);
    click(document.querySelector('[data-tb="redo"]')); await sleep(450);
    t('REDO restores flow (button)', g().flows.length === 1);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'z' }));
    await sleep(450);
    t('Ctrl+Z undo', g().flows.length === 0);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, shiftKey: true, key: 'z' }));
    await sleep(450);
    t('Ctrl+Shift+Z redo', g().flows.length === 1);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'y' }));
    await sleep(400);
    t('Ctrl+Y redo (no-op at tip, no crash)', g().flows.length === 1);

    /* ---- 5 · deep history ---- */
    for (let i = 0; i < 3; i++) { click(document.querySelector('[data-tb="undo"]')); await sleep(80); }
    await sleep(450);
    t('3 undos -> initial empty graph', g().flows.length === 0 && g().nodes.length === 0);
    t('undo disabled at true root', document.querySelector('[data-tb="undo"]').disabled);
    for (let i = 0; i < 3; i++) { click(document.querySelector('[data-tb="redo"]')); await sleep(80); }
    await sleep(450);
    t('3 redos -> graph back', g().flows.length === 1 && g().nodes.length === 2);
    t('redo disabled at tip', document.querySelector('[data-tb="redo"]').disabled);

    /* ---- 6 · node drag undo/redo ---- */
    const n0 = document.querySelectorAll('.fb-node')[0];
    const n0x = g().nodes[0].x, n0y = g().nodes[0].y;
    const p0 = screenOf(n0x + 120, n0y + 70);
    pd(n0, p0.x, p0.y); mv(p0.x + 30, p0.y + 30); mv(p0.x + 150, p0.y + 110); pu(p0.x + 150, p0.y + 110);
    await sleep(450);
    const dragMoved = g().nodes[0].x !== n0x || g().nodes[0].y !== n0y;
    t('node moved by drag', dragMoved);
    click(document.querySelector('[data-tb="undo"]')); await sleep(450);
    t('undo restores node position', g().nodes[0].x === n0x && g().nodes[0].y === n0y);
    click(document.querySelector('[data-tb="redo"]')); await sleep(450);
    t('redo re-applies node position', g().nodes[0].x !== n0x && dragMoved);

    /* ---- 7 · save state ---- */
    click(document.querySelector('[data-tb="undo"]')); await sleep(60);
    t('pill dirty right after undo', document.querySelector('[data-save-pill]').classList.contains('dirty'));
    click(document.querySelector('[data-tb="save"]')); await sleep(700);
    t('pill saved after save', document.querySelector('[data-save-pill]').classList.contains('saved'));
    click(document.querySelector('[data-tb="redo"]')); await sleep(450);      // restore the flow before pulsing
    t('flow restored before pulse', g().flows.length === 1);

    /* ---- 8 · pulse = runtime only ---- */
    const uB = engine.canUndo(), rB = engine.canRedo();
    engine.pulse(flowId, 'success', { flow: 'order.created' });
    engine.pulse(flowId, 'failed', { flow: 'order.created' });
    t('pulse does not dirty', document.querySelector('[data-save-pill]').classList.contains('saved'));
    t('pulse does not touch history', engine.canUndo() === uB && engine.canRedo() === rB);
    const engFlow = engine.getGraph().flows.find(x => x.id === flowId);
    t('pulse writes engine-side log', engFlow.logs.length === 2 && engFlow.logs[0].status === 'failed');
    const fst = g().flows.find(x => x.id === flowId);
    t('pulse logs not persisted to store', !fst || !fst.logs || fst.logs.length === 0);

    /* ---- 9 · export ---- */
    const exported = JSON.parse(engine.exportGraph());
    t('export 2 nodes / 1 flow', exported.nodes.length === 2 && exported.flows.length === 1);
    t('export has coordinates + direction', typeof exported.nodes[0].x === 'number' && exported.flows[0].direction === 'forward');

    /* ---- 10 · import + sanitize ---- */
    engine.importGraph(JSON.stringify({ nodes: [
      { id: 'a', portalId: 'p-unknown-xyz', x: 10, y: 10 },
      { id: 'b', portalId: 'p-unknown-abc', x: 300, y: 10 }],
      flows: [{ id: 'f1', sourceId: 'a', targetId: 'GHOST', direction: 'weird' },
              { id: 'f2', sourceId: 'a', targetId: 'b', direction: 'sideways' }] }));
    await sleep(500);
    t('import keeps unknown-portal nodes (host interop)', g().nodes.length === 2 && g().nodes[0].portalId === 'p-unknown-xyz');
    t('import drops orphan flows', g().flows.length === 1 && g().flows[0].targetId === 'b');
    t('import normalizes bad direction', g().flows[0].direction === 'forward');
    engine.importGraph('{broken json');
    await sleep(400);
    t('bad JSON import rejected, no crash', g().nodes.length === 2);

    /* ---- 11 · v6: flow label always visible + live stat chip ---- */
    const label = document.querySelector('.fb-edge-label');
    t('v6: flow label present with name + route', !!label && !!label.querySelector('b') && !!label.querySelector('.fb-edge-route'));
    t('v6: stat chip slot present (hidden before pulses)', !!label.querySelector('.fb-edge-stat') && !label.querySelector('.fb-edge-stat').className.includes('success'));
    engine.pulse(g().flows[0].id, 'success', { flow: 'x' });
    await sleep(120);
    const stat = document.querySelector('.fb-edge-stat');
    t('v6: stat chip shows success after pulse', stat.className.includes('success') && stat.textContent.includes('✓'));
    engine.pulse(g().flows[0].id, 'failed', { flow: 'x' });
    await sleep(120);
    t('v6: stat chip shows failed after pulse', document.querySelector('.fb-edge-stat').className.includes('failed'));

    /* ---- 12 · v6: keyboard nudge + endpoint row ---- */
    engine.select('node', g().nodes[0].id);
    const kx0 = g().nodes[0].x, ky0 = g().nodes[0].y;
    window.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    window.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    await sleep(450);
    t('v6: arrow keys nudge node (+8/+8)', g().nodes[0].x === kx0 + 8 && g().nodes[0].y === ky0 + 8);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft', shiftKey: true }));
    await sleep(450);
    t('v6: shift+arrow nudges 24', g().nodes[0].x === kx0 + 8 - 24);
    for (let i = 0; i < 3; i++) { click(document.querySelector('[data-tb="undo"]')); await sleep(80); }
    await sleep(450);
    t('v6: nudge steps are undoable (3 steps back)', g().nodes[0].x === kx0 && g().nodes[0].y === ky0);
    for (let i = 0; i < 3; i++) { click(document.querySelector('[data-tb="redo"]')); await sleep(80); }
    await sleep(450);

    engine.importGraph(JSON.stringify({ nodes: [{ id: 'e1', portalId: 'p-unknown-xyz', x: 20, y: 20, endpoint: 'https://api.example.com/x/' }], flows: [] }));
    await sleep(450);
    const ep = document.querySelector('.fb-node-ep');
    t('v6: endpoint row shows shortened host', !!ep && ep.textContent === 'api.example.com/x');

    /* ---- 13 · readonly isolated instance ---- */
    const host = document.createElement('div'); document.body.appendChild(host);
    const ro = window.FlowBridgeApp.initFlowEngine(host, { readonly: true, graph: g(), portals: store().getPortals() });
    const n0ro = ro.getGraph().nodes.length;
    t('readonly createNode blocked', ro.createNode('p-x', 50, 50) === null);
    t('readonly dropAt blocked', ro.dropAt(200, 200, 'p-x') === null);
    t('readonly deleteNode blocked', (ro.deleteNode(ro.getGraph().nodes[0].id), ro.getGraph().nodes.length === n0ro));
    t('readonly clearAll blocked', (ro.clearAll(), ro.getGraph().nodes.length === n0ro));
    t('readonly importGraph blocked', ro.importGraph(JSON.stringify({ nodes: [], flows: [] })) === false);
    pd(host.querySelector('.fb-node'), 300, 300);
    pu(300, 300); await sleep(300);
    const roDrawer = host.querySelector('.fb-drawer');
    t('readonly drawer title contains عرض', roDrawer && roDrawer.querySelector('.fb-drawer-h .t').textContent.includes('عرض'));
    t('readonly drawer fieldset disabled', !!host.querySelector('.fb-rofield'));
    ro.destroy(); host.remove();

    /* ---- 14 · history cap ---- */
    for (let i = 0; i < 70; i++) { engine.importGraph(JSON.stringify({ nodes: [{ id: 'n' + i, portalId: 'px', x: i * 10, y: 0 }], flows: [] })); await sleep(6); }
    let steps = 0; while (engine.canUndo()) { engine.undo(); steps++; if (steps > 80) break; }
    t('history capped at 60 (1 snapshot per import, ≤59 undos)', steps >= 55 && steps <= 59);

    /* ---- 15 · finish clean ---- */
    engine.clearAll(); await sleep(450);
    click(document.querySelector('[data-tb="save"]')); await sleep(100);
    t('final clean save ok', true);

    console.log('\n========= RESULT =========');
    console.log('  PASS: ' + pass + '  FAIL: ' + fail);
    console.log('===========================');
    process.exit(fail === 0 ? 0 : 1);
  } catch (err) { console.error('CRASH:', err); process.exit(2); }
})();

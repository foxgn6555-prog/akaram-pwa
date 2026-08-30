/* ================================================================
   FlowBridge · Flows Page — manage every connection:
   direction, custom color, events, mapping, conditions, logs
   ================================================================ */

import { store } from '../core/store.js';
import { bus, EVT } from '../core/bus.js';
import { esc, deep, relTime } from '../core/utils.js';
import { promptModal, toast } from './pagekit.js';
import { FLOW_DIRS, FLOW_COLORS } from '../core/defaults.js';
import { initFlowEngine } from '../engine/engine.js';

export function mountFlows(container) {
  container.classList.add('fb-page');
  container.innerHTML = `
    <div class="fb-page-head">
      <div>
        <div class="fb-page-title">التدفقات</div>
        <div class="fb-page-sub">إدارة كل اتصال بين البوابات: النوع، اللون، الأحداث، ربط الحقول، الشروط والسجلات</div>
      </div>
      <div class="fb-page-actions">
        <button class="fb-btn primary" data-nav="designer">🎨 فتح في المصمم</button>
      </div>
    </div>
    <div class="fb-cols">
      <div class="fb-card">
        <div class="fb-card-h"><h3>كل التدفقات</h3><span class="fb-card-sub" data-count></span></div>
        <div class="fb-table-wrap">
          <table class="fb-table">
            <thead><tr><th>التدفق</th><th>النوع</th><th>اللون</th><th>المصدر ← الهدف</th><th>Trigger</th><th>الحالة</th><th style="width:110px">إجراءات</th></tr></thead>
            <tbody data-rows></tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="fb-card" style="margin-bottom:14px">
          <div class="fb-card-h"><h3>معاينة حية</h3></div>
          <div class="fb-card-b tight" style="padding:8px">
            <div style="height:270px;border-radius:12px;overflow:hidden;background:var(--bg-2);position:relative" data-canvas></div>
          </div>
        </div>
        <div class="fb-card">
          <div class="fb-card-h"><h3>أنواع التدفق</h3></div>
          <div class="fb-card-b">
            <div class="fb-dir-grid">
              ${Object.values(FLOW_DIRS).map(d => `
                <div class="fb-dir-opt"><span class="fb-dir-ico" style="color:${d.color}">${d.icon}</span>
                <span class="fb-dir-name">${d.name}</span><span class="fb-dir-desc">${d.desc}</span></div>`).join('')}
            </div>
            <div class="fb-rule-note" style="margin-top:12px">كل تدفق له <b>لون مخصص</b> يمكن تغييره من الإعدادات أو من تبويب «النوع» في اللوحة.</div>
          </div>
        </div>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const engine = initFlowEngine($('[data-canvas]'), {
    portals: { current: () => store.getPortals() },
    graph: store.getGraph(),
    onGraphChange: () => {}
  });

  const DIR_META = FLOW_DIRS;
  const flowColorOf = (f) => (f.color && f.color.trim()) ? f.color : (DIR_META[f.direction] || DIR_META.forward).color;

  function render() {
    const g = store.getGraph();
    const rows = $('[data-rows]');
    $('[data-count]').textContent = g.flows.length + ' تدفق';
    if (!g.flows.length) {
      rows.innerHTML = `<tr><td colspan="7"><div class="fb-empty"><span class="fb-empty-ico">🔀</span>لا توجد تدفقات بعد — أنشئها من المصمم بسحب من مقبض Trigger</div></td></tr>`;
      return;
    }
    rows.innerHTML = g.flows.map(f => {
      const s = g.nodes.find(n => n.id === f.sourceId), t = g.nodes.find(n => n.id === f.targetId);
      const sp = s && store.portalById(s.portalId), tp = t && store.portalById(t.portalId);
      const meta = DIR_META[f.direction] || DIR_META.forward;
      return `<tr>
        <td><b>${esc(f.name || '')}</b></td>
        <td><span class="fb-dir-chip" style="--dc:${meta.color}" title="${meta.name}">${meta.icon}</span> ${meta.name}</td>
        <td><span style="display:inline-block;width:26px;height:10px;border-radius:6px;background:${flowColorOf(f)};box-shadow:0 0 10px ${flowColorOf(f)}"></span></td>
        <td><span class="fb-gap">${sp ? sp.icon : '🔌'} ${esc(sp ? sp.label : f.sourceId)} <span class="fb-muted">←</span> ${tp ? tp.icon : '🔌'} ${esc(tp ? tp.label : f.targetId)}</span></td>
        <td class="fb-mono fb-small">${esc(f.triggerEvent || '—')}</td>
        <td>${f.isActive ? '<span class="fb-badge ok">نشط</span>' : '<span class="fb-badge warn">متوقف</span>'}</td>
        <td><span class="fb-gap">
          <button class="fb-btn sm" data-edit="${esc(f.id)}">تعديل</button>
          <button class="fb-btn sm danger" data-del="${esc(f.id)}">✕</button>
        </span></td></tr>`;
    }).join('');

    rows.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => flowForm(b.dataset.edit)));
    rows.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        const f = g.flows.find(x => x.id === b.dataset.del);
        const ok = await promptModal({ title: 'حذف التدفق', body: `حذف <b>${esc(f.name || '')}</b> نهائياً؟`, okLabel: 'حذف', danger: true });
        if (ok) { engine.deleteFlow(f.id); }
      }));
  }

  /* ---------- flow editor modal (full customization) ---------- */
  function flowForm(id) {
    const f = deep(store.getGraph().flows.find(x => x.id === id));
    if (!f) return;
    const g = store.getGraph();
    const s = g.nodes.find(n => n.id === f.sourceId), t = g.nodes.find(n => n.id === f.targetId);
    const sp = store.portalById(s.portalId), tp = store.portalById(t.portalId);
    const srcEvents = sp.events || ['data.received'], srcFields = sp.fields || ['id'], tgtFields = tp.fields || ['id'];

    const modal = document.createElement('div');
    modal.className = 'fb-modal-back open';
    modal.innerHTML = `<div class="fb-modal lg">
      <div class="fb-modal-h"><h3>تعديل التدفق: ${esc(f.name || '')}</h3><button class="fb-x" data-x>✕</button></div>
      <div class="fb-modal-b">
        <div class="fb-row3">
          <div class="fb-field"><label class="fb-label">الاسم</label><input class="fb-input" data-k="name" value="${esc(f.name || '')}"></div>
          <div class="fb-field"><label class="fb-label">نوع التدفق</label>
            <select class="fb-select" data-k="direction">${Object.values(FLOW_DIRS).map(d => `<option value="${d.dir}"${f.direction === d.dir ? ' selected' : ''}>${d.icon} ${d.name}</option>`).join('')}</select></div>
          <div class="fb-field"><label class="fb-label">Trigger</label>
            <select class="fb-select fb-mono" data-k="trigger">${srcEvents.map(v => `<option${f.triggerEvent === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="fb-field"><label class="fb-label">لون الخط</label>
          <div class="fb-swatch-grid" style="grid-template-columns:repeat(9,1fr)">${FLOW_COLORS.map(c => `
            <span class="fb-swatch${(f.color || DIR_META[f.direction]?.color) === c ? ' on' : ''}" data-color="${c}" style="background:${c};color:${c}"></span>`).join('')}</div>
          <input type="color" class="fb-color-input" style="margin-top:8px" data-color-custom value="${f.color || DIR_META[f.direction]?.color || '#38BDF8'}">
          <button class="fb-btn sm ghost" data-color-reset style="margin-top:8px;width:100%">↺ استخدام لون النوع الافتراضي</button></div>
        <div class="fb-field"><label class="fb-label">ربط الحقول (حقل المصدر ← حقل الهدف)</label>
          <div data-maps>${f.mappingRules.map((m, i) => `
            <div class="fb-map-row">
              <select class="fb-select fb-mono" data-ck="m.s" data-i="${i}">${srcFields.map(x => `<option${m.source === x ? ' selected' : ''}>${x}</option>`).join('')}</select>
              <span class="fb-map-arrow">←</span>
              <select class="fb-select fb-mono" data-ck="m.t" data-i="${i}">${tgtFields.map(x => `<option${m.target === x ? ' selected' : ''}>${x}</option>`).join('')}</select>
              <button class="fb-row-del" data-delmap="${i}">✕</button></div>`).join('')}
          </div>
          <button class="fb-btn sm ghost" data-addmap>+ إضافة ربط</button></div>
        <div class="fb-field"><label class="fb-label">الشروط</label>
          <div data-conds>${f.conditions.map((c, i) => `
            <div class="fb-cond-row">
              <select class="fb-select fb-mono" data-ck="c.f" data-i="${i}">${srcFields.map(x => `<option${c.field === x ? ' selected' : ''}>${x}</option>`).join('')}</select>
              <select class="fb-select" data-ck="c.o" data-i="${i}">${[['equals','يساوي'],['not_equals','لا يساوي'],['contains','يحتوي'],['greater_than','أكبر من'],['less_than','أقل من'],['starts_with','يبدأ بـ'],['is_empty','فارغ'],['not_empty','غير فارغ']].map(([v, ar]) => `<option value="${v}"${c.op === v ? ' selected' : ''}>${ar}</option>`).join('')}</select>
              <input class="fb-input fb-mono" data-ck="c.v" data-i="${i}" value="${esc(c.value)}">
              <button class="fb-row-del" data-delcond="${i}">✕</button></div>`).join('')}
          </div>
          <button class="fb-btn sm ghost" data-addcond>+ إضافة شرط</button></div>
        <div class="fb-field"><label class="fb-label">آخر السجلات (من منصتك)</label>
          <div data-logs>${(f.logs || []).length ? f.logs.slice(0, 4).map(l => {
            const cls = l.status === 'success' ? 'ok' : l.status === 'failed' ? 'err' : 'skip';
            return `<div class="fb-log ${cls}"><span class="fb-log-ico">${l.status === 'success' ? '✓' : l.status === 'failed' ? '✕' : '→'}</span>
              <div class="fb-log-main"><div class="fb-log-msg">${l.status === 'success' ? 'نجاح' : l.status === 'failed' ? 'فشل' : 'تخطي'}</div>
              <div class="fb-log-sub">${relTime(l.at)}</div></div>
              <span class="fb-log-http">${l.http}</span><span class="fb-log-ms">${l.ms ? l.ms + 'ms' : '—'}</span></div>`;
          }).join('') : '<div class="fb-empty" style="padding:12px">لا توجد سجلات بعد</div>'}</div></div>
      </div>
      <div class="fb-modal-f">
        <button class="fb-btn" data-cancel>إلغاء</button>
        <button class="fb-btn primary" data-ok style="min-width:120px">حفظ</button>
      </div></div>`;
    document.body.appendChild(modal);

    modal.querySelector('[data-x]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-cancel]').addEventListener('click', () => modal.remove());

    /* colors */
    modal.querySelectorAll('[data-color]').forEach(c =>
      c.addEventListener('click', () => {
        modal.querySelectorAll('[data-color]').forEach(x => x.classList.remove('on'));
        c.classList.add('on'); f.color = c.dataset.color;
      }));
    modal.querySelector('[data-color-custom]').addEventListener('input', (e) => { f.color = e.target.value; });
    modal.querySelector('[data-color-reset]').addEventListener('click', () => { f.color = ''; modal.remove(); flowForm(id); });

    modal.querySelector('[data-addmap]').addEventListener('click', () => { f.mappingRules.push({ source: srcFields[0], target: tgtFields[0] }); buildMaps(); });
    modal.querySelector('[data-addcond]').addEventListener('click', () => { f.conditions.push({ field: srcFields[0], op: 'equals', value: '' }); buildConds(); });
    function buildMaps() {
      modal.querySelector('[data-maps]').innerHTML = f.mappingRules.map((m, i) => `
        <div class="fb-map-row">
          <select class="fb-select fb-mono" data-ck="m.s" data-i="${i}">${srcFields.map(x => `<option${m.source === x ? ' selected' : ''}>${x}</option>`).join('')}</select>
          <span class="fb-map-arrow">←</span>
          <select class="fb-select fb-mono" data-ck="m.t" data-i="${i}">${tgtFields.map(x => `<option${m.target === x ? ' selected' : ''}>${x}</option>`).join('')}</select>
          <button class="fb-row-del" data-delmap="${i}">✕</button></div>`).join('');
      wireRows();
    }
    function buildConds() {
      modal.querySelector('[data-conds]').innerHTML = f.conditions.map((c, i) => `
        <div class="fb-cond-row">
          <select class="fb-select fb-mono" data-ck="c.f" data-i="${i}">${srcFields.map(x => `<option${c.field === x ? ' selected' : ''}>${x}</option>`).join('')}</select>
          <select class="fb-select" data-ck="c.o" data-i="${i}">${[['equals','يساوي'],['not_equals','لا يساوي'],['contains','يحتوي'],['greater_than','أكبر من'],['less_than','أقل من'],['starts_with','يبدأ بـ'],['is_empty','فارغ'],['not_empty','غير فارغ']].map(([v, ar]) => `<option value="${v}"${c.op === v ? ' selected' : ''}>${ar}</option>`).join('')}</select>
          <input class="fb-input fb-mono" data-ck="c.v" data-i="${i}" value="${esc(c.value)}">
          <button class="fb-row-del" data-delcond="${i}">✕</button></div>`).join('');
      wireRows();
    }
    function wireRows() {
      modal.querySelectorAll('[data-delmap]').forEach(b =>
        b.addEventListener('click', () => { f.mappingRules.splice(+b.dataset.delmap, 1); buildMaps(); }));
      modal.querySelectorAll('[data-delcond]').forEach(b =>
        b.addEventListener('click', () => { f.conditions.splice(+b.dataset.delcond, 1); buildConds(); }));
      modal.querySelectorAll('[data-ck]').forEach(elx =>
        elx.addEventListener('change', () => {
          const [grp, k] = elx.dataset.ck.split('.');
          const arr = grp === 'm' ? f.mappingRules : f.conditions;
          if (arr[+elx.dataset.i]) arr[+elx.dataset.i][k] = elx.value;
        }));
    }
    wireRows();

    modal.querySelector('[data-ok]').addEventListener('click', () => {
      f.name = modal.querySelector('[data-k="name"]').value.trim() || f.name;
      f.direction = modal.querySelector('[data-k="direction"]').value;
      f.triggerEvent = modal.querySelector('[data-k="trigger"]').value;
      const g2 = store.getGraph();
      g2.flows = g2.flows.map(x => x.id === f.id ? { ...x, ...f } : x);
      store.setGraph(g2);
      toast('تم حفظ التدفق', 'ok');
      modal.remove();
    });
  }

  container.querySelectorAll('[data-nav]').forEach(b =>
    b.addEventListener('click', () => bus.emit('nav:go', b.dataset.nav)));

  const offGraph = bus.on(EVT.GRAPH_CHANGED, render);
  render();

    return { engine, destroy: () => { offGraph(); engine.destroy(); } };
}

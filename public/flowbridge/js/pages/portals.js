/* ================================================================
   FlowBridge · Portals Page — full CRUD for the customisable
   portal catalog + CUSTOM CATEGORIES (أقسام) management.
   Add / edit / delete / activate / import / export — with color,
   icon, category, events, fields and endpoint control.
   ================================================================ */

import { store } from '../core/store.js';
import { bus, EVT } from '../core/bus.js';
import { esc, uid, deep, downloadFile, pickFile } from '../core/utils.js';
import { promptModal, toast } from './pagekit.js';
import { PORTAL_COLORS, PORTAL_EMOJIS } from '../core/defaults.js';

export function mountPortals(container) {
  container.classList.add('fb-page');
  container.innerHTML = `
    <div class="fb-page-head">
      <div>
        <div class="fb-page-title">البوابات والأقسام</div>
        <div class="fb-page-sub">تحكم كامل: أضف بواباتك وخصص الأقسام والألوان والأيقونات والأحداث والحقول</div>
      </div>
      <div class="fb-page-actions">
        <button class="fb-btn" data-act="export">⬇ تصدير</button>
        <button class="fb-btn" data-act="import">⬆ استيراد</button>
        <button class="fb-btn primary" data-act="add">+ إضافة بوابة</button>
      </div>
    </div>

    <div class="fb-card" style="margin-bottom:16px">
      <div class="fb-card-h"><h3>الأقسام (Categories)</h3>
        <span class="fb-card-sub" style="margin-inline-start:auto">تخصيص كامل — كل بوابة تنتمي لقسم</span></div>
      <div class="fb-card-b">
        <div class="fb-chips" data-cats>
          <input placeholder="اسم القسم ثم Enter...">
        </div>
        <div class="fb-hint-txt">اكتب اسم قسم جديد واضغط Enter لإضافته — احذف قسماً بالضغط على ✕ (لن تتأثر البوابات الموجودة).</div>
      </div>
    </div>

    <div class="fb-card">
      <div class="fb-table-wrap">
        <table class="fb-table">
          <thead><tr>
            <th>البوابة</th><th>الاسم العربي</th><th>القسم</th><th>الأحداث</th><th>الحقول</th><th>مفعّلة</th><th style="width:140px">إجراءات</th>
          </tr></thead>
          <tbody data-rows></tbody>
        </table>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const getCats = () => store.getSettings().categories || [];

  /* ---------- categories chips ---------- */
  function renderCats() {
    const box = $('[data-cats]');
    const chips = getCats();
    box.querySelectorAll('.fb-chip').forEach(c => c.remove());
    chips.forEach((c, i) => {
      const chip = document.createElement('span');
      chip.className = 'fb-chip';
      chip.innerHTML = esc(c) + '<button data-cat-del="' + i + '">✕</button>';
      box.insertBefore(chip, box.querySelector('input'));
    });
    box.querySelectorAll('[data-cat-del]').forEach(b =>
      b.addEventListener('click', () => {
        const cats = getCats().slice();
        const removed = cats.splice(+b.dataset.catDel, 1);
        store.setSettings({ categories: cats });
        renderCats(); render();
        toast('تم حذف القسم: ' + removed, 'info');
      }));
  }
  $('[data-cats] input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const v = e.target.value.trim();
    if (!v) return;
    if (getCats().includes(v)) { e.target.value = ''; toast('القسم موجود مسبقاً', 'warn'); return; }
    store.setSettings({ categories: [...getCats(), v] });
    e.target.value = '';
    renderCats(); render();
    toast('تمت إضافة القسم: ' + v, 'ok');
  });

  /* ---------- portals table ---------- */
  function render() {
    const rows = $('[data-rows]');
    const portals = store.getPortals();
    if (!portals.length) {
      rows.innerHTML = `<tr><td colspan="7"><div class="fb-empty"><span class="fb-empty-ico">🚪</span>لا توجد بوابات — أضف أول بوابة لمشروعك (ابدأ بالقسم ثم البوابة)</div></td></tr>`;
      return;
    }
    rows.innerHTML = portals.map(p => `
      <tr>
        <td><span class="fb-gap"><span class="fbl-ico" style="--pc:${p.color}">${p.icon}</span><b>${esc(p.label)}</b></span></td>
        <td>${esc(p.labelAr || '—')}</td>
        <td><span class="fb-badge" style="--bc:${p.color}">${esc(p.category || '')}</span></td>
        <td class="fb-muted fb-small">${(p.events || []).slice(0, 3).join(', ')}${(p.events || []).length > 3 ? '…' : ''}</td>
        <td class="fb-muted fb-small fb-mono">${(p.fields || []).length} حقول</td>
        <td><label class="fb-switch" style="--sc:${p.color}"><input type="checkbox" data-toggle="${esc(p.id)}"${p.enabled ? ' checked' : ''}><span></span></label></td>
        <td><span class="fb-gap">
          <button class="fb-btn sm" data-edit="${esc(p.id)}">تعديل</button>
          <button class="fb-btn sm danger" data-del="${esc(p.id)}">حذف</button>
        </span></td>
      </tr>`).join('');

    rows.querySelectorAll('[data-toggle]').forEach(t =>
      t.addEventListener('change', () => {
        const p = store.portalById(t.dataset.toggle);
        p.enabled = !!t.checked;
        store.upsertPortal(p);
        toast(p.enabled ? 'تم تفعيل ' + p.label : 'تم إيقاف ' + p.label, 'info');
      }));
    rows.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => portalForm(store.portalById(b.dataset.edit), false)));
    rows.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        const p = store.portalById(b.dataset.del);
        const ok = await promptModal({
          title: 'حذف البوابة',
          body: `سيتم حذف <b>${esc(p.label)}</b> وكل العقد والتدفقات المرتبطة بها من المصمم.`,
          okLabel: 'حذف نهائي', danger: true
        });
        if (ok) { store.removePortal(p.id); toast('تم حذف ' + p.label, 'warn'); }
      }));
  }

  /* ---------- add / edit form ---------- */
  function portalForm(p, isNew) {
    const cats = getCats();
    const src = p ? deep(p) : {
      id: uid('p'), label: '', labelAr: '', icon: '🔌', color: PORTAL_COLORS[0],
      category: cats[0] || '', enabled: true,
      events: ['data.received'], fields: ['id', 'value'], endpoint: ''
    };
    const modal = document.createElement('div');
    modal.className = 'fb-modal-back open';
    modal.innerHTML = `<div class="fb-modal lg">
      <div class="fb-modal-h"><h3>${isNew ? 'إضافة بوابة جديدة' : 'تعديل: ' + esc(src.label)}</h3><button class="fb-x" data-x>✕</button></div>
      <div class="fb-modal-b">
        <div class="fb-row">
          <div class="fb-field"><label class="fb-label">الاسم <span class="fb-req">*</span></label>
            <input class="fb-input" data-k="label" value="${esc(src.label)}" placeholder="POS"></div>
          <div class="fb-field"><label class="fb-label">الاسم العربي</label>
            <input class="fb-input" data-k="labelAr" value="${esc(src.labelAr || '')}" placeholder="نقطة البيع"></div>
        </div>
        <div class="fb-row">
          <div class="fb-field"><label class="fb-label">القسم</label>
            <select class="fb-select" data-k="category">
              ${cats.map(c => `<option${src.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
              ${!cats.includes(src.category) && src.category ? `<option selected>${esc(src.category)}</option>` : ''}
            </select>
            <div class="fb-hint-txt">أضف أقساماً جديدة من أعلى الصفحة.</div></div>
          <div class="fb-field"><label class="fb-label">API Endpoint</label>
            <input class="fb-input fb-mono" data-k="endpoint" value="${esc(src.endpoint || '')}" placeholder="https://api.example.com/v1/..."></div>
        </div>
        <div class="fb-field"><label class="fb-label">اللون المميز</label>
          <div class="fb-swatch-grid">${PORTAL_COLORS.map(c =>
            `<span class="fb-swatch${src.color === c ? ' on' : ''}" data-color="${c}" style="background:${c};color:${c}"></span>`).join('')}</div>
          <input type="color" class="fb-color-input" style="margin-top:8px" data-color-custom value="${src.color}"></div>
        <div class="fb-field"><label class="fb-label">الأيقونة</label>
          <div class="fb-emoji-grid">${PORTAL_EMOJIS.map(e =>
            `<span class="fb-emoji-opt${src.icon === e ? ' on' : ''}" data-emoji="${e}">${e}</span>`).join('')}</div></div>
        <div class="fb-field"><label class="fb-label">أحداث البوابة (Trigger Events) — Enter للإضافة</label>
          <div class="fb-chips" data-chips="events">${(src.events || []).map(e => `<span class="fb-chip">${esc(e)}<button data-chip-del>✕</button></span>`).join('')}<input placeholder="مثال: order.created"></div>
        </div>
        <div class="fb-field"><label class="fb-label">حقول البيانات (Fields)</label>
          <div class="fb-chips" data-chips="fields">${(src.fields || []).map(e => `<span class="fb-chip">${esc(e)}<button data-chip-del>✕</button></span>`).join('')}<input placeholder="مثال: order.total"></div>
        </div>
      </div>
      <div class="fb-modal-f">
        <button class="fb-btn" data-cancel>إلغاء</button>
        <button class="fb-btn primary" data-ok style="min-width:130px">${isNew ? 'إضافة البوابة' : 'حفظ التعديلات'}</button>
      </div></div>`;
    document.body.appendChild(modal);

    const g = (k) => modal.querySelector('[data-k="' + k + '"]');
    const close = () => modal.remove();
    modal.querySelector('[data-x]').addEventListener('click', close);
    modal.querySelector('[data-cancel]').addEventListener('click', close);

    modal.querySelectorAll('[data-color]').forEach(c =>
      c.addEventListener('click', () => {
        modal.querySelectorAll('[data-color]').forEach(x => x.classList.remove('on'));
        c.classList.add('on'); src.color = c.dataset.color;
      }));
    modal.querySelector('[data-color-custom]').addEventListener('input', (e) => { src.color = e.target.value; });
    modal.querySelectorAll('[data-emoji]').forEach(c =>
      c.addEventListener('click', () => {
        modal.querySelectorAll('[data-emoji]').forEach(x => x.classList.remove('on'));
        c.classList.add('on'); src.icon = c.dataset.emoji;
      }));

    modal.querySelectorAll('[data-chips]').forEach(box => {
      const key = box.dataset.chips;
      const input = box.querySelector('input');
      const add = (v) => {
        v = (v || '').trim();
        if (!v || (src[key] || []).includes(v)) { input.value = ''; return; }
        (src[key] = src[key] || []).push(v);
        const chip = document.createElement('span');
        chip.className = 'fb-chip';
        chip.innerHTML = esc(v) + '<button data-chip-del>✕</button>';
        box.insertBefore(chip, input);
        wireDels(); input.value = '';
      };
      const wireDels = () => {
        box.querySelectorAll('[data-chip-del]').forEach(b2 =>
          b2.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const txt = b2.parentElement.textContent.slice(0, -1);
            src[key] = (src[key] || []).filter(x => x !== txt);
            b2.parentElement.remove();
          }));
      };
      wireDels();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
        if (e.key === 'Backspace' && !input.value && box.querySelector('.fb-chip')) box.querySelectorAll('.fb-chip')[box.querySelectorAll('.fb-chip').length - 1].remove();
      });
      input.addEventListener('blur', () => add(input.value));
    });

    modal.querySelector('[data-ok]').addEventListener('click', () => {
      src.label = g('label').value.trim();
      src.labelAr = g('labelAr').value.trim();
      src.category = g('category').value;
      src.endpoint = g('endpoint').value.trim();
      if (!src.label) { g('label').focus(); toast('أدخل اسم البوابة', 'warn'); return; }
      store.upsertPortal(src, isNew);
      toast(isNew ? 'تمت إضافة البوابة بنجاح' : 'تم تحديث البوابة', 'ok');
      close();
    });
  }

  /* ---------- import / export ---------- */
  $('[data-act="add"]').addEventListener('click', () => portalForm(null, true));
  $('[data-act="export"]').addEventListener('click', () => {
    downloadFile('flowbridge-portals.json', JSON.stringify(store.getPortals(), null, 2));
    toast('تم تصدير الكتالوج', 'ok');
  });
  $('[data-act="import"]').addEventListener('click', async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('bad format');
      data.forEach(p => store.upsertPortal({ ...deep(p), id: p.id || uid('p') }, !store.portalById(p.id)));
      toast('تم استيراد ' + data.length + ' بوابة', 'ok');
    } catch (_) { toast('ملف غير صالح', 'err'); }
  });

  const offs = [bus.on(EVT.PORTALS_CHANGED, render), bus.on(EVT.STORE_SAVED, renderCats)];

  renderCats(); render();

  return { destroy: () => offs.forEach(f => f()) };
}

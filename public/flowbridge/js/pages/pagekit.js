/* ================================================================
   FlowBridge · PageKit — shared UI helpers for pages
   (toasts, modal prompts, small builders) — app-wide, not engine
   ================================================================ */

import { esc } from '../core/utils.js';

/* ---------- toasts ---------- */
let host = null;
export function toast(msg, type = 'info') {
  if (!host) {
    host = document.createElement('div');
    host.className = 'fb-toasts';
    document.body.appendChild(host);
  }
  const icons = { ok: '✓', err: '✕', warn: '⚠', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = 'fb-toast ' + type;
  t.innerHTML = `<span class="t-ico">${icons[type] || 'ℹ'}</span><span>${esc(msg)}</span>`;
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2400);
}

/* ---------- promise modal ---------- */
export function promptModal({ title = '', body = '', okLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'fb-modal-back open';
    back.innerHTML = `<div class="fb-modal">
      <div class="fb-modal-h"><h3>${title}</h3><button class="fb-x" data-x>✕</button></div>
      <div class="fb-modal-b">${body}</div>
      <div class="fb-modal-f">
        <button class="fb-btn" data-cancel>${cancelLabel}</button>
        <button class="fb-btn ${danger ? 'danger' : 'primary'}" data-ok style="min-width:110px">${okLabel}</button>
      </div></div>`;
    document.body.appendChild(back);
    const done = (v) => { back.remove(); resolve(v); };
    back.querySelector('[data-ok]').addEventListener('click', () => done(true));
    back.querySelector('[data-cancel]').addEventListener('click', () => done(false));
    back.querySelector('[data-x]').addEventListener('click', () => done(false));
    back.addEventListener('click', (e) => { if (e.target === back) done(false); });
  });
}

/* ---------- live "ok" placeholder (for pages not yet built) ---------- */
export function notReady(container, msg = 'هذه الصفحة قيد التطوير') {
  container.innerHTML = `<div class="fb-page"><div class="fb-empty"><span class="fb-empty-ico">🔧</span>${esc(msg)}</div></div>`;
}

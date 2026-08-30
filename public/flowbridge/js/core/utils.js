/* ================================================================
   FlowBridge · Core Utils (dependencies: none)
   ================================================================ */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const uid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
export const deep = (o) => JSON.parse(JSON.stringify(o));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function relTime(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'الآن';
  if (s < 60) return 'منذ ' + s + ' ثانية';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? 'منذ دقيقة' : 'منذ ' + m + ' دقائق';
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'منذ ساعة' : 'منذ ' + h + ' ساعات';
  return 'منذ ' + Math.floor(h / 24) + ' يوم';
}

export function fmtNum(n) {
  return new Intl.NumberFormat('en-US').format(n || 0);
}

/* ---------- Safe storage (localStorage may be blocked in sandboxes) ---------- */
const mem = new Map();
export function storageGet(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    }
  } catch (_) { /* blocked */ }
  return mem.get(key) ?? null;
}
export function storageSet(key, val) {
  try {
    if (typeof localStorage !== 'undefined') { localStorage.setItem(key, val); return true; }
  } catch (_) { /* blocked */ }
  mem.set(key, val);
  return false;   // false = memory-only fallback
}
export function storageRemove(key) {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch (_) {}
  mem.delete(key);
}

export function downloadFile(name, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; if (accept) input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); return true; } catch (_) { return false; }
    finally { ta.remove(); }
  }
}

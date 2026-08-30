/* ================================================================
   FlowBridge · Settings Page — platform integration & runtime
   ================================================================ */

import { store } from '../core/store.js';
import { bus, EVT } from '../core/bus.js';
import { esc, toast } from '../core/utils.js';
import { promptModal } from '../pages/pagekit.js';

export function mountSettings(container) {
  container.classList.add('fb-page');
  container.innerHTML = `
    <div class="fb-page-head">
      <div>
        <div class="fb-page-title">الإعدادات</div>
        <div class="fb-page-sub">ربط المشروع بمنصتك: API، الحفظ التلقائي، إعادة التعيين</div>
      </div>
    </div>
    <div style="max-width:720px">
      <div class="fb-card" style="margin-bottom:16px">
        <div class="fb-card-h"><h3>الاتصال بالمنصة (API)</h3></div>
        <div class="fb-card-b">
          <div class="fb-field"><label class="fb-label">عنوان API الأساسي (Base URL)</label>
            <input class="fb-input fb-mono" data-k="apiUrl" value="${esc(store.getSettings().apiUrl || '')}" placeholder="https://platform.example.com/api">
            <div class="fb-hint-txt">عند تعبئته، يحفظ FlowBridge بياناته على منصتك عبر <span class="fb-mono">PUT /workflows/{portals|graph|settings}</span> ويقرأ منها. اتركه فارغاً للعمل محلياً.</div></div>
          <div class="fb-field"><label class="fb-label">رمز الوصول (Bearer Token)</label>
            <input class="fb-input fb-mono" type="password" data-k="apiToken" value="${esc(store.getSettings().apiToken || '')}"></div>
          <button class="fb-btn primary" data-save-api>حفظ إعدادات الاتصال</button>
          <span class="fb-hint-txt" data-api-state>—</span>
        </div>
      </div>

      <div class="fb-card" style="margin-bottom:16px">
        <div class="fb-card-h"><h3>السلوك</h3></div>
        <div class="fb-card-b">
          <div class="fb-between" style="padding:6px 0">
            <div><b>الحفظ التلقائي</b><div class="fb-hint-txt">حفظ أي تغيير في المخطط فوراً</div></div>
            <label class="fb-switch" style="--sc:var(--success)"><input type="checkbox" data-k="autosave"${store.getSettings().autosave ? ' checked' : ''}><span></span></label>
          </div>
        </div>
      </div>

      <div class="fb-card" style="margin-bottom:16px">
        <div class="fb-card-h"><h3>الدمج في مشروعك</h3></div>
        <div class="fb-card-b">
          <div class="fb-rule-note">
            لدمج <b>FlowBridge</b> داخل منصتك الحالية يكفي استدعاء المحرك مباشرة:
            <div dir="ltr" style="text-align:left;margin-top:10px"><div class="fb-code" style="padding:12px 14px;font-size:11.5px"><span id="code-snippet">import { initFlowEngine } from './js/engine/engine.js';
const engine = initFlowEngine(document.getElementById('my-canvas'), {
  portals: window.FlowBridgeConfig?.portals ?? myPortals,
  graph:   myGraph,
  onGraphChange: (g) => saveToMyPlatform(g)
});
engine.pulse('flow-id');   // بث حدث حقيقي من منصتك إلى الرسم</span></div></div>
            <div class="fb-hint-txt" style="margin-top:10px">كل الأنماط معزولة تحت <span class="fb-mono">.fb-engine</span> ولا تتعارض مع ستايل منصتك.</div>
          </div>
        </div>
      </div>

      <div class="fb-card">
        <div class="fb-card-h"><h3>المنطقة</h3></div>
        <div class="fb-card-b" style="display:flex;justify-content:space-between;align-items:center">
          <div><b>إعادة التعيين</b><div class="fb-hint-txt">إرجاع البوابات والمخطط والإعدادات إلى الوضع الافتراضي</div></div>
          <button class="fb-btn danger" data-reset>إعادة التعيين</button>
        </div>
      </div>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const g = (k) => $('[data-k="' + k + '"]');

  $('[data-save-api]').addEventListener('click', () => {
    store.setSettings({
      apiUrl: g('apiUrl').value.trim(),
      apiToken: g('apiToken').value.trim()
    });
    try { window.FlowBridgeConfig = { ...(window.FlowBridgeConfig || {}), apiUrl: store.getSettings().apiUrl, apiToken: store.getSettings().apiToken }; } catch (_) {}
    toast('تم حفظ إعدادات الاتصال', 'ok');
    $('[data-api-state]').textContent = store.getSettings().apiUrl
      ? 'متصل بـ ' + store.getSettings().apiUrl
      : 'وضع محلي (localStorage)';
  });
  $('[data-api-state]').textContent = store.getSettings().apiUrl ? 'متصل بـ ' + store.getSettings().apiUrl : 'وضع محلي (localStorage)';

  g('autosave').addEventListener('change', (e) => {
    store.setSettings({ autosave: !!e.target.checked });
    toast(e.target.checked ? 'تم تفعيل الحفظ التلقائي' : 'تم إيقاف الحفظ التلقائي', 'info');
  });

  $('[data-reset]').addEventListener('click', async () => {
    const ok = await promptModal({ title: 'إعادة التعيين', body: 'سيتم حذف كل التخصيصات والعودة للوضع الافتراضي. هل أنت متأكد؟', okLabel: 'إعادة التعيين', danger: true });
    if (ok) {
      try {
        ['fb:portals', 'fb:graph', 'fb:settings'].forEach(k => localStorage.removeItem(k));
      } catch (_) {}
      location.reload();
    }
  });

}

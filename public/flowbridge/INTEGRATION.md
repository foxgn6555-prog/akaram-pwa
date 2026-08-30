# FlowBridge · دليل الربط التقني الكامل (Integration Contract) v5

هذا الدليل يثبت أن FlowBridge **جاهز تقنياً** للربط بمشروعك. كل ما تحتاجه موثق هنا: الإعداد، واجهة API الكاملة، عقد REST، بث الأحداث، خيارات العرض، ونماذج جاهزة.

---

## 1) سريع — 3 طرق للربط

### أ) صفحة كاملة داخل تطبيقك (index.html)
```html
<!-- في <head> قبل الـ bundle -->
<script>window.FlowBridgeConfig = { apiUrl: 'https://platform/api', apiToken: 'xxx' };</script>
<link rel="stylesheet" href="flowbridge/assets/css/tokens.css">
<link rel="stylesheet" href="flowbridge/assets/css/app.css">
<link rel="stylesheet" href="flowbridge/assets/css/engine.css">
<!-- الهيكل -->
<div class="fb-shell"><header id="topbar"></header><main id="view"></main></div>
<!-- السكربت الكلاسيكي (يعمل في أي بيئة، بلا ES Modules) -->
<script src="flowbridge/assets/flowbridge-bundle.js"></script>
```

### ب) المحرك وحده داخل صفحة منصتك (الأكثر شيوعاً)
```js
import { initFlowEngine } from './flowbridge/js/engine/engine.js';

const engine = initFlowEngine(document.getElementById('my-canvas'), {
  portals:  myPortals,                 // كتالوج بواباتك [{id,label,labelAr,icon,color,category,events,fields}]
  graph:    myGraph,                   // { nodes:[...], flows:[...] } — اختياري (يبدأ فارغاً)
  onGraphChange: (g) => saveToMyPlatform(g),   // ← يُستدعى عند كل تعديل (autosave) أو زر حفظ
  readonly: false,                     // true = عرض فقط
  autosave: true                       // false = حفظ يدوي فقط (زر حفظ / Ctrl+S)
});
```
> **بدون بناء؟** استخدم الحزمة الكلاسيكية: `<script src="flowbridge/assets/flowbridge-bundle.js">` ثم `window.FlowBridgeApp.initFlowEngine(...)`.

### ج) صفحة تضمين جاهزة (page.html)
`page.html` — المصمم كاملاً في صفحة واحدة، يكشف `window.FlowBridge`:
- `?readonly=1` → وضع العرض فقط
- `?autosave=0` → حفظ يدوي
- `?api=...&token=...` → ربط خادمك

---

## 2) API المحرك — المرجع الكامل

| الدالة | الوصف |
|---|---|
| `getGraph()` | إرجاع `{nodes, flows}` نسخة نظيفة من المخطط الحالي |
| `setGraph(g)` | تحميل مخطط (مع **تنقية تلقائية**: حذف تدفقات بمراجع ميتة، تصحيح الأنواع) |
| `onGraphChange(cb)` | تسجيل مستمع التغييرات — قلبه لحفظك على منصتك |
| `pulse(flowId, status, payload)` | **بث حدث حقيقي**: مذنّب لوني يتحرك على الخط + سجل. status: `success|failed|skipped`. **بيانات تشغيلية لحظية**: لا تدخل سجل التراجع ولا تغيّر حالة الحفظ، والسجلات تبقى في الذاكرة (تُصدَّر مع JSON لكن لا تُحفظ تلقائياً) |
| `createNode(portalId, x, y)` | إضافة عقدة برمجياً |
| `createFlow(srcId, tgtId, direction, name)` | إنشاء تدفق برمجياً (`forward|reverse|bidirectional`) |
| `deleteNode / deleteFlow / clearAll` | حذف (كلها تدعم التراجع) |
| `undo() / redo() / canUndo() / canRedo()` | نظام تراجع/إعادة (60 خطوة) — متاح أيضاً باختصارات Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. يُحدّث أزرار شريط الأدوات تلقائياً؛ كل عملية (سحب/ربط/تعديل) خطوة مستقلة، والقفزات الزمنية للـ pulse مستثناة |
| `exportGraph()` | مخطط كسلسلة JSON جاهزة للحفظ/التنزيل |
| `importGraph(json)` | استيراد ملف/سلسلة JSON مع التنقية |
| `save()` | حفظ فوري (يستدعي onGraphChange) |
| `fit()` | ملاءمة العرض لكل العقد |
| `dropAt(clientX, clientY, portalId)` | إسقاط بوابة عند إحداثيات شاشة (للسحب المخصص من منصتك) |
| `refresh()` | إعادة قراءة كتالوج البوابات (بعد تعديله) وإعادة الرسم |
| `destroy()` | تدمير كامل: إزالة المستمعين/history/الرسم — ضروري عند فك الصفحة |

### خيارات initFlowEngine
```js
{
  portals:   [],            // أو { current: () => [...] } لمصدر حي
  graph:     {nodes:[], flows:[]},
  onGraphChange: fn,
  readonly:  false,         // عرض فقط: لا سحب/ربط/حذف/استيراد، الدرج للعرض
  autosave:  true           // false → شارة "غير محفوظ" + زر حفظ فقط
}
```


> **مهم للتضمين**: داخل تطبيق FlowBridge نفسه (`page.html`) يعمل `window.FlowBridge.getEngine()` في صفحتي "المصمم" و"لوحة القيادة" فقط (كل صفحة تُنشئ محركها). للاستخدام الدائم—تضمين المحرك في منصتك—أنشئ محركك الخاص عبر `FlowBridgeApp.initFlowEngine(el, opts)` كما في `host-demo.html`، واحتفظ بالمرجع الذي يعيده.
---

## 3) عقد REST (Backend Contract)

| النهاية | الطريقة | الجسم | الوظيفة |
|---|---|---|---|
| `/workflows/portals` | GET / PUT | `Portal[]` | كتالوج البوابات |
| `/workflows/graph` | GET / PUT | `{nodes, flows}` | مخطط التدفقات |
| `/workflows/settings` | GET / PUT | `{autosave, apiUrl, categories[]}` | الإعدادات + الأقسام |

- الإعداد عبر `window.FlowBridgeConfig = { apiUrl, apiToken }`
- الترويسات: `Authorization: Bearer <token>`
- **بدون API** يعمل تلقائياً محلياً عبر `localStorage` (مفتاح `fb2:`)

### Schema أمثلة
```jsonc
// Portal
{ "id": "p-pos", "label": "POS", "labelAr": "نقطة البيع", "icon": "🛒",
  "color": "#6366F1", "category": "المبيعات", "enabled": true,
  "events": ["order.created"], "fields": ["order.total"], "endpoint": "https://..." }

// Flow
{ "id": "f-1", "name": "فواتير", "direction": "forward",   // | reverse | bidirectional
  "sourceId": "n-a", "targetId": "n-b", "isActive": true, "color": "#38BDF8",
  "triggerEvent": "order.created", "actionEvent": "create.record",
  "mappingRules": [{"source":"order.total","target":"invoice.total"}],
  "conditions":   [{"field":"order.total","op":"greater_than","value":"100"}],
  "logic": "AND", "logs": [{"status":"success","http":200,"ms":140,"at":1730000000000}] }
```

---

## 4) بث الأحداث الحية — من منصتك إلى الرسم

```js
// الطريقة 1: مباشرة على المحرك
engine.pulse('f-1', 'success', { flow: 'فواتير' });
engine.pulse('f-1', 'failed');            // مذنّب أحمر
engine.pulse('f-1', 'skipped');           // مذنّب رمادي

// الطريقة 2: عبر الباص (يعمل مع أي عدد من المحركات/الصفحات)
window.FlowBridgeApp.bus.emit('data:in', { flowId: 'f-1', status: 'success', http: 200, ms: 140 });
```

النتيجة: مذنّب ضوئي يتحرك على الخط بلون الحالة + سجل في تبويب «السجلات» + تحديث لوحة القيادة.

---

## 5) أمثلة لأطر العمل الشائعة

### React
```jsx
useEffect(() => {
  const engine = initFlowEngine(ref.current, {
    portals: portals, graph,
    onGraphChange: (g) => api.put('/workflows/graph', g)
  });
  return () => engine.destroy();          // تنظيف إلزامي
}, []);
```

### Vue
```js
onMounted(() => { engine = initFlowEngine(el.value, opts); });
onUnmounted(() => engine.destroy());
```

### Node/Backend → بث لحظي (WebSocket)
```js
ws.on('message', (m) => {
  engine.pulse(flowIdFor(m.orderId), 'success', { ...m });
});
```

---

## 6) خيارات العرض (View Options)

| ميزة | كيف |
|---|---|
| عرض فقط | `readonly: true` أو `?readonly=1` |
| حفظ يدوي | `autosave: false` → شارة «غير محفوظ» برتقالية حتى الضغط على حفظ |
| تخصيص الألوان | كل أنماط المكونات عبر متغيرات CSS في `tokens.css` (`--bg`, `--accent`, `--card`...) |
| إخفاء/إظهار عناصر | مرر CSS: `.fb-designer .fbl { width: X }` إلخ — كل شيء معزول تحت `.fb-engine` / `.fb-designer` |
| RTL/LTR | المشروع RTL افتراضياً؛ الكانفس نفسه محايد الاتجاه — يعمل داخل أي واجهة |

---

## 7) التحقق من الجاهزية (QA)

```bash
node build.js                 # يبني الحزمة الكلاسيكية + الملف المستقل
npm install jsdom && node test/e2e.js   # الاختبار المؤتمت الكامل (44 فحصاً)
python3 -m http.server 4173   # شغّل وافتح http://localhost:4173
```

**نطاق الاختبار المؤتمت**:
- `test/e2e.cjs` — **52 فحصاً — كلها ناجحة**: بداية فارغة (بلا أي بيانات تجريبية)، إنشاء بوابات عبر الواجهة، سحب العقد، الربط الفعلي للنقاط، التراجع/الإعادة (أزرار + Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y + سحب العقد + حفر عميق حتى الجذر)، تحديث أزرار شريط الأدوات، حالة الحفظ (غير محفوظ/محفوظ)، عزل pulse عن التراجع وحالة الحفظ، التصدير/الاستيراد مع التعقيم (عقد مجهولة البوابة تُحفظ، تدفقات يتيمة تُحذف، اتجاهات خاطئة تُصحح)، وضع readonly (منع السحب/الربط/الحذف/الاستيراد/المسح)، حدّ 60 خطوة في سجل التراجع. (v6: تسميات تدفقات دائمة الظهور على منحنى الخط نفسه مع شارة آخر حالة `✓ ms` من أحداث منصتك الحقيقية، سطر endpoint في بطاقة العقدة، تحريك العقدة المحددة بالأسهم — 8px وبـ Shift 24px — كخطوات تراجع مستقلة).
- `test/host-smoke.cjs` — **12 فحصاً — كلها ناجحة** (مثال الاستضافة `host-demo.html`: تحميل الحزمة، تركيب المحرك، دخول بيانات المضيف، واجهة `MyAppFlowBridge`، أزرار البث والحفظ، وصول `onGraphChange` للمضيف).

**أعطال حقيقية اكتُشفت أثناء التحقق وأُصلحت (كانت ستكسر الربط بمشروع حقيقي)**:
1. تسريب مستمعي `bus` عند التنقل بين الصفحات → استدعاءات على حاوية مدمرة (كسر التنقل).
2. `redo` كان يستعيد حالة **قبل** التعديل (لقطة سابقة للتغيير) — أُعيدت دلالة التاريخ إلى "لقطة بعد كل عملية".
3. سحب العقدة لم يكن يعلّم `moved` (لا `sx/sy`) → لا حفظ ولا تراجع لتحريك العقد.
4. أزرار التراجع/الإعادة لم تتحدث حالتها بعد العمليات (تظهر مفعّلة رغم الوصول للجذر).

**الملفات المعتمدة للدمج**: `js/engine/engine.js` (المحرك)، `assets/flowbridge-bundle.js` (الحزمة)، `page.html` (التضمين).

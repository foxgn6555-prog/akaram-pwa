# FlowBridge — منصة الربط الذكية · وحدة التدفقات البصرية

مشروع **كامل** (ليس ملفاً واحداً) لمحرك تدفقات بياني قابل للتضمين والتخصيص، مبني بـ **Vanilla JS (ESM)** بدون أي إطار عمل، وجاهز للربط بمنصتك ليُظهر تدفقات بيانات مشروعك بشكل احترافي.

---

## ✨ القدرات الجديدة (v2)

| الميزة | التفاصيل |
|---|---|
| **بداية نظيفة — لا بيانات وهمية** | يبدأ المشروع فارغاً تماماً: لا عقد، لا تدفقات، لا سجلات، لا أي شيء مفبرك. كل ما يظهر هو ما أنشأته أنت أو ما يصل من منصتك (مفتاح تخزين جديد `fb2:` يمسح أي بقايا قديمة) |
| **بوابات + أقسام قابلة للتخصيص بالكامل** | صفحة «البوابات»: إضافة / تعديل / حذف / تفعيل / استيراد / تصدير — مع الاسم، الاسم العربي، **اللون**، الأيقونة، **القسم (فئة)**، الأحداث، الحقول، و endpoint. **الأقسام نفسها قابلة للإضافة والحذف** (Enter لإضافة قسم جديد) |
| **إصلاح ربط الخطوط** | هندسة مقابض حتمية + Pointer Capture + نصف قطر Snap 48px + إفلات فوق أي جزء من العقدة — التوصيل يعمل في كل البيئات، مع منع التكرار المطابق فقط والسماح بنفس الزوج باتجاهات مختلفة |
| **3 أنواع تدفقات** | ➡ **اعتيادي** (مصدر ← هدف) · ⬅ **عكسي** |(هدف ← مصدر) · ⇄ **ثنائي** (بالاتجاهين) — تُختار عند الإنشاء أو من تبويب «النوع» في لوحة الإعداد، وتظهر ثلاثياً في القائمة والخريطة |
| **محرك خطوط حديث (v3)** | مسارات **موجهة بالاتجاه**: لكل تدفق مساره الخاص (اعتيادي/عكسي/ثنائي بمسارين متوازيين) مع **أسهم اتجاه** عند النهاية، توهج Glow، تدفق نقطي متحرك، ومذنّبات ضوئية متعددة — بلا أي عمليات DOM داخل حلقة الرسم |
| **ربط ذكي (v3)** | Snap هندسي دقيق على المقابض وجسم العقدة (نصف قطر 34px)، إضاءة الهدف المقبول، معاينة بنقطة نهاية متوهجة — **السحب من مقبض ACTION ينشئ تدفقاً عكسياً تلقائياً** |
| **سحب ينجح في كل البيئات (v3)** | سحب البوابات يعمل بالمؤشر (Pointer Events) بدل HTML5 DnD — يعمل حتى داخل iframes معزولة |
| **مخطط متسلسل حقيقي** | تصميم المثال: POS → الدفع → المحاسبة → CRM + مخزون (ثنائي) — "كل البوابات تتدفق حتى تصل للنقطة الأخيرة" |
| **مشروع حقيقي متعدد الصفحات** | `index.html` (5 صفحات): لوحة القيادة، المصمم، البوابات، التدفقات، الإعدادات — سجل تنفيذات حي، KPI، معاينة مصغرة |
| **بنية معمارية نظيفة** | `core` (utils/bus/defaults/store/connector) · `engine` · `pages` — مسؤليات مفصولة |

## 🌐 الربط بمنصتك (الطريقة الحقيقية)

### 1) صفحة كاملة داخل تطبيقك
انسخ مجلد `flowbridge/` إلى مشروعك واربط:
```html
<script>window.FlowBridgeConfig = { apiUrl: 'https://platform/api', apiToken: '...' };</script>
<link rel="stylesheet" href="flowbridge/assets/css/tokens.css">
<link rel="stylesheet" href="flowbridge/assets/css/app.css">
<link rel="stylesheet" href="flowbridge/assets/css/engine.css">
<div id="fb-host" style="height:100%"></div>
<script type="module" src="flowbridge/js/main.js"></script>
```

### 2) تضمين المحرك وحده داخل صفحة منصتك
```js
import { store } from 'flowbridge/js/core/store.js';
import { initFlowEngine } from 'flowbridge/js/engine/engine.js';

await store.init();
const engine = initFlowEngine(document.getElementById('my-canvas'), {
  portals: store.getPortals(),
  graph: store.getGraph(),
  onGraphChange: (g) => saveToMyPlatform(g)   // ← حفظ على منصتك
});
engine.pulse('flow-id');                       // ← بث حدث حقيقي للرسم
```

### 3) صفحة تضمين جاهزة
`page.html` — المصمم كاملاً في صفحة واحدة (للـ iframe/route)، يكشف `window.FlowBridge`.

### 4) بث البيانات الحية من منصتك إلى الرسم
أي كود في منصتك يُرسل حسب العقد:
```js
bus.emit('data:in', { flowId: 'f-1', status: 'success', http: 200, ms: 140, payload: {...} });
```
فيظهر **مذنّب ضوئي** يتحرك على الخط + يُسجَّل في السجل ولوحة القيادة.

### 5) حفظ على خادمك (API Contract)
| النهاية | الطريقة | الوظيفة |
|---|---|---|
| `/workflows/portals` | GET / PUT | كتالوج البوابات |
| `/workflows/graph` | GET / PUT | مخطط التدفقات (getGraph) |
| `/workflows/settings` | GET / PUT | الإعدادات |

بدون API يعمل محلياً عبر localStorage.

## 📁 البنية

```
flowbridge/
├─ index.html              ← التطبيق الكامل (5 صفحات)
├─ page.html               ← صفحة تضمين (المصمم وحده)
├─ build.js                ← يبني الحزمة الكلاسيكية + نسخة الملف الواحد
├─ flowbridge-standalone.html  ← ⭐ التطبيق كاملاً في ملف واحد
├─ assets/flowbridge-bundle.js ← الحزمة الكلاسيكية (index.html يقرأها)
├─ js/
│  ├─ main.js              ← نقطة الدخول + التوجيه
│  ├─ core/                ← utils · bus · defaults · store · connector
│  ├─ engine/engine.js     ← محرك الكانفس (مستقل تماماً)
│  └─ pages/               ← dashboard · designer · portals · flows · settings
└─ assets/css/             ← tokens · app · engine
```

## 🕹️ التشغيل

```bash
cd flowbridge
python3 -m http.server 4173   # أو: npx serve .
# ثم افتح http://localhost:4173
```

`node build.js` يولّد:
- `assets/flowbridge-bundle.js` — حزمة كلاسيكية (بدون ES Modules) تُحمَّل من `index.html` و`page.html`، تعمل في أي بيئة حتى داخل iframes معزولة
- `flowbridge-standalone.html` — التطبيق كاملاً في ملف واحد

> **ملاحظة:** تعمل الوحدات مباشرة (Native ESM) بدون خطوات بناء — المطلوب فقط خادم HTTP لاستضافة الوحدة. لمتطلبات التوافق مع المتصفحات القديمة، مرّر `build.js` ثم ثبّت الحزم عبر أي Bundler (Rollup/Vite).

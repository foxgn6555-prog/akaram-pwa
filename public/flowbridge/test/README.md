# فحوصات FlowBridge

## تشغيل اختبارات E2E (jsdom)
```bash
npm install jsdom            # مرة واحدة
node test/e2e.cjs            # الفحص المؤتمت الكامل (52 فحصاً)
node test/host-smoke.cjs     # فحص مثال الاستضافة host-demo.html (10 فحوصات)
```
الاختبار يشغّل `flowbridge-standalone.html` (يجب إعادة بنائه أولاً عبر `node build.js`)
ويتحقق من 44 نقطة: الإقلاع الفارغ، السحب والربط، التراجع/الإعادة (أزرار + اختصارات + سحب العقد)،
حالة الحفظ، pulse كبيانات تشغيلية فقط، التصدير/الاستيراد مع التعقيم، الوضع للقراءة فقط، وحدّ سجل التراجع (60).

## فحص الخادم
```bash
python3 -m http.server 4173 --bind 0.0.0.0
# ثم افتح:
#   http://localhost:4173/page.html
#   http://localhost:4173/host-demo.html
#   http://localhost:4173/flowbridge-standalone.html
```

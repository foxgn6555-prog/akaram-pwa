# بوابة الشكاوى — البريد عبر Mailgun

## القرار التقني

يستخدم النظام Mailgun لاستقبال البريد وإرساله مباشرة عبر Webhooks وHTTP API. لا يحتاج عامل IMAP أو حاسوب Windows دائم. تطبيق بوابة الشكاوى هو صندوق العمل والأرشيف.

## مسار البريد الوارد

1. ترسل الجهة إلى عنوان على نطاق فرعي، مثل `complaints@inbound.company.com`.
2. Mailgun Inbound Route يرسل الرسالة إلى `mailgun-inbound`.
3. Edge Function تتحقق من HMAC والتاريخ لمنع التزوير وإعادة التشغيل.
4. تحفظ الرسالة مرة واحدة حسب `Message-ID`، وتحفظ بصمة SHA-256 لكل مرفق.
5. تصنف الرسالة حسب عنوان الاستلام أو قاعدة بريد المرسل.
6. تظهر الرسالة والصور في وحدة الكرادة أو الزعفرانية.
7. موظف الشكاوى يجمع صور الموقع الواحد، يكمل البيانات، ثم يسنده يدوياً.

## مسار البريد الصادر

1. يعتمد موظف الشكاوى التقرير.
2. تستدعي الواجهة `mailgun-send` عبر JWT.
3. الدالة تتحقق من دور `complaints_officer` أو `super_admin`.
4. تحمل التقرير من Storage وترسله عبر Mailgun API.
5. تسجل `complaint_email_deliveries` الطلب وحالته.
6. يستقبل `mailgun-events` أحداث accepted/delivered/failed ويحدث الحالة.
7. عند `delivered` فقط يؤرشف trigger التقرير والشكاوى المرتبطة؛ حالات الفشل تعيد التقرير إلى `failed` ولا تحذف شيئاً.

## الأسرار المطلوبة في Supabase

```bash
supabase secrets set \
  MAILGUN_API_KEY=... \
  MAILGUN_WEBHOOK_SIGNING_KEY=... \
  MAILGUN_DOMAIN=inbound.company.com \
  MAILGUN_FROM='وحدة الشكاوى <complaints@inbound.company.com>' \
  MAILGUN_API_BASE=https://api.mailgun.net
```

استخدم `https://api.eu.mailgun.net` إذا كان نطاق Mailgun في منطقة EU.

## روابط Mailgun

بعد نشر الدوال:

- Inbound Route: `https://<project-ref>.supabase.co/functions/v1/mailgun-inbound`
- Delivery Webhook: `https://<project-ref>.supabase.co/functions/v1/mailgun-events`

`mailgun-inbound` و`mailgun-events` بلا Supabase JWT لأن Mailgun هو المتصل، لكنهما لا تقبلان أي طلب بلا توقيع HMAC صحيح. `mailgun-send` يبقى محمياً بـJWT.

## إعداد DNS

تضاف سجلات Mailgun المعروضة في لوحة المزود للنطاق الفرعي فقط: MX للاستقبال، SPF وDKIM للإرسال، وCNAME عند الطلب. استخدام نطاق فرعي يمنع تعطيل بريد الشركة الرئيسي.

## حدود الملفات

المشروع يرفض المرفق الواحد فوق 25MiB أو نوعاً غير مسموح. عند إنشاء PowerPoint كبير سنضغط الصور أو نرسل رابط تنزيل آمن بدلاً من تجاوز حد المزود.

## PDF والتقارير

- يحول الموظف صفحات PDF الواردة إلى PNG محلياً داخل المتصفح باستخدام `pdfjs-dist@6.3.289`، بحد 50 صفحة، ثم يرفع الصفحات عبر SDK مع رقم الصفحة وبصمة SHA-256. لا تُرسل ملفات PDF إلى طرف ثالث.
- يولد `complaint-generate-report` ملف PPTX باستخدام OOXML وJSZip مباشرة، دون `pptxgenjs` المتأثر أمنياً. الدالة تقبل JPEG/PNG فقط وتتحقق من magic bytes قبل إدراج الصورة.
- القالب يضبط اللون والعنوان وعناوين قبل/بعد مع معاينة بصرية، ويُحفظ التخطيط في JSONB.
- يجب تنزيل PPTX ومراجعته ثم اعتماده قبل تفعيل زر الإرسال.

## ما يحتاج عينات تشغيلية أصلية

OCR العربي/الإنجليزي واقتراح المحلة والزقاق، وكذلك درجة تشابه سياق بصرية قبل/بعد، مطبقة كمساعدات فقط. تحتاج PDF/PPTX أصلية لضبط دقتها؛ التأكيد البشري، بطاقة الموقع، وقت الالتقاط وGPS تبقى الضوابط الحاكمة ولا يعتمد النظام على التحليل الآلي وحده.

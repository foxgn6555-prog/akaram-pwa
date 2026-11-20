/**
 * حارس الإقلاع (الجولة ٣-هـ) — يمنع أن يبقى المستخدم على شاشة بيضاء/تحميل أبدية.
 *
 * السيناريو الذي يصلحه (شائع على iPhone): عامل خدمة قديم يقدّم index.html قديماً يشير
 * إلى أصول حُذفت من الخادم بعد النشر ⇒ لا شيء يُركَّب و<div id="root"> يبقى فارغاً للأبد.
 *
 * الملف مستقل عن الحزمة (لا يمرّ عبر Vite) كي يعمل حتى لو فشل تحميل التطبيق نفسه،
 * وليس مضمّناً في index.html احتراماً لسياسة CSP (script-src 'self' بلا inline).
 *
 * السلوك:
 *  · بعد ١٢ ثانية بلا تركيب: إن كان عامل خدمة يتحكم بالصفحة ⇒ إصلاح تلقائي (مسح كاش +
 *    إلغاء التسجيل + إعادة تحميل) مرة واحدة في الجلسة.
 *  · وإلا (شبكة بطيئة/أول زيارة) ⇒ بطاقة استرداد عربية بزرَّي «إعادة المحاولة» و«إصلاح التطبيق»
 *    بدل شاشة فارغة.
 *  · الشرط الفعلي: وجود محتوى داخل <div id="root">؛ ويُرفع __akaramBooted من App.tsx كإشارة ثانية.
 */
(function () {
  'use strict'
  var TIMEOUT_MS = 12000
  var RECOVERY_KEY = 'akaram.boot.recoveryAt'

  window.__akaramBooted = false

  function clearCachesAndWorkers() {
    var jobs = []
    try {
      if (window.caches && caches.keys) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k).catch(function () { return false }) }))
        }).catch(function () {}))
      }
    } catch { /* كاش محجوب */ }
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister().catch(function () { return false }) }))
        }).catch(function () {}))
      }
    } catch { /* لا تسجيل */ }
    try { sessionStorage.removeItem(RECOVERY_KEY) } catch { /* حجب */ }
    return Promise.all(jobs)
  }

  function hardReset() {
    return clearCachesAndWorkers().then(function () { window.location.reload() })
  }
  // يستهلكه زر «لم يعمل؟» في شريط التحديث أيضاً
  window.akaramHardReset = hardReset

  function recoveryCard(reason) {
    if (document.getElementById('akaram-boot-recovery')) return
    var box = document.createElement('div')
    box.id = 'akaram-boot-recovery'
    box.setAttribute('role', 'alert')
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
      'justify-content:center;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;direction:rtl'
    box.innerHTML =
      '<div style="max-width:340px;text-align:center">' +
      '<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:8px">تعذّر فتح التطبيق</div>' +
      '<div style="font-size:12px;line-height:1.9;color:#475569;margin-bottom:16px">' + reason + '</div>' +
      '<button id="akaram-boot-retry" style="display:block;width:100%;height:44px;border:0;border-radius:12px;' +
      'background:#005f8d;color:#fff;font-size:14px;font-weight:800;margin-bottom:8px">إعادة المحاولة</button>' +
      '<button id="akaram-boot-fix" style="display:block;width:100%;height:44px;border:1px solid #cbd5e1;' +
      'border-radius:12px;background:#fff;color:#0f172a;font-size:14px;font-weight:800">إصلاح التطبيق (يمسح الكاش)</button>' +
      '<div style="font-size:11px;color:#94a3b8;margin-top:12px">لن تُفقد بيانات حسابك — تُمسح ملفات التطبيق المؤقتة فقط.</div>' +
      '</div>'
    document.body.appendChild(box)
    var retry = document.getElementById('akaram-boot-retry')
    var fix = document.getElementById('akaram-boot-fix')
    if (retry) retry.onclick = function () { window.location.reload() }
    if (fix) fix.onclick = function () { hardReset() }
  }

  function attemptRecovery() {
    var root = document.getElementById('root')
    // شرطان: الإشارة من React **و** وجود محتوى فعلي — فلو انهار التركيب نبقي الحارس فعّالاً
    if (root && root.childElementCount > 0) return

    var already = false
    try { already = !!sessionStorage.getItem(RECOVERY_KEY) } catch { /* حجب */ }

    var controlled = false
    try { controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller) } catch { /* لا */ }

    if (controlled && !already) {
      try { sessionStorage.setItem(RECOVERY_KEY, String(Date.now())) } catch { /* حجب */ }
      recoveryCard('جارٍ إصلاح ملفات التطبيق تلقائياً…')
      hardReset()
      return
    }
    recoveryCard(already
      ? 'جرت محاولة إصلاح تلقائية ولم تكتمل. تحقّق من الشبكة ثم أعد المحاولة، أو اضغط «إصلاح التطبيق».'
      : 'قد يكون الاتصال ضعيفاً أو نسخة التطبيق المخزّنة قديمة. أعد المحاولة أو أصلح التطبيق.')
  }

  // فشل تحميل حزمة بعد نشر جديد (404 لملف مجزّأ) — إشارة مباشرة على كاش قديم
  window.addEventListener('vite:preloadError', function () {
    if (!window.__akaramBooted) recoveryCard('نسخة التطبيق المخزّنة قديمة. اضغط «إصلاح التطبيق».')
  })

  window.setTimeout(attemptRecovery, TIMEOUT_MS)
})()

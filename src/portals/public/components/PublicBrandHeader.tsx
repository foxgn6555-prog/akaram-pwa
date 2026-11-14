/**
 * V-24 — ترويسة العلامة الموحّدة لصفحات البوابة العامة (خارج صفحة الدخول).
 * نفس شعار واسم صفحة الدخول حتى لا تبدو «استعادة كلمة المرور» و«إعادة الضبط»
 * صفحتين من نظام آخر. عرض فقط — لا تغيير في السلوك.
 */
export default function PublicBrandHeader() {
  return (
    <header className="text-center" data-testid="public-brand-header">
      <div className="inline-flex h-16 w-16 items-center justify-center">
        <img
          src="/icons/logo.png"
          alt="شعار جزيرة الأكارم"
          width={64}
          height={64}
          className="h-16 w-16 object-contain drop-shadow-[0_8px_20px_rgba(0,95,141,0.6)]"
        />
      </div>
      <h1 className="text-lg font-black text-white sm:text-xl">جزيرة الأكارم</h1>
      <p className="mt-1 text-xs font-medium text-[#7fc0df]/80 sm:text-sm">
        النظام الإلكتروني لإدارة شركة البلدية
      </p>
    </header>
  )
}

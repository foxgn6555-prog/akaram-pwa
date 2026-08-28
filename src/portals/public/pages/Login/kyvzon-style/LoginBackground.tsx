/**
 * LoginBackground — خلفية متحركة (Aurora + شبكة)
 * مُكيَّف من Kyvzon بألوان جزيرة الأكرام (أزرق مؤسسي #005f8d)
 */

export default function LoginBackground() {
  return (
    <>
      {/* الخلفية المتدرجة الأساسية — أزرق الأكرام */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#003d5c] to-slate-900" />

      {/* كرات Aurora الضوئية المتحركة — ألوان الأكرام */}
      <div
        className="login-aurora-blob"
        style={{
          width: 500, height: 500, top: '-10%', right: '-5%',
          background: 'radial-gradient(circle, #005f8d, transparent 70%)',
          animation: 'login-aurora-1 18s ease-in-out infinite',
        }}
      />
      <div
        className="login-aurora-blob"
        style={{
          width: 450, height: 450, bottom: '-10%', left: '-5%',
          background: 'radial-gradient(circle, #0f7cb0, transparent 70%)',
          animation: 'login-aurora-2 22s ease-in-out infinite',
        }}
      />
      <div
        className="login-aurora-blob"
        style={{
          width: 350, height: 350, top: '40%', left: '40%',
          background: 'radial-gradient(circle, #ffca00, transparent 70%)',
          opacity: 0.15,
          animation: 'login-aurora-3 25s ease-in-out infinite',
        }}
      />

      {/* شبكة خفيفة */}
      <div className="login-grid-overlay absolute inset-0 opacity-[0.04]" aria-hidden="true" />
    </>
  )
}

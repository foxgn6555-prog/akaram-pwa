/**
 * التقاط صورة داخل التطبيق بالكاميرا مباشرة (getUserMedia) — لا يفتح «اختيار ملف».
 * facing='user' = الكاميرا الأمامية (سلفي)، 'environment' = الكاميرا الخلفية (العمال).
 * إن لم يتوفر getUserMedia أو رُفض الإذن، يُستخدم بديل <input capture> الأصلي.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, X } from 'lucide-react'

export type Facing = 'user' | 'environment'
export const cameraSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function CameraCapture({ facing, title, onCapture, onClose, testId }: { facing: Facing; title: string; onCapture: (f: File) => void; onClose: () => void; testId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null }, [])

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      setError(null); setReady(false)
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: { exact: facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false },
        { video: { facingMode: facing }, audio: false },
        { video: true, audio: false },
      ]
      for (const c of attempts) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(c)
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
          streamRef.current = s
          if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => undefined) }
          setReady(true)
          return
        } catch (e) {
          if ((e as DOMException)?.name === 'NotAllowedError') break
        }
      }
      if (!cancelled) setError('تعذّر فتح الكاميرا — تأكد من منح إذن الكاميرا للمتصفح')
    }
    void start()
    return () => { cancelled = true; stop() }
  }, [facing, stop])

  const snap = () => {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth || 1280; canvas.height = v.videoHeight || 960
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) } // إلغاء انعكاس المرآة للسلفي
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    const finish = (blob: Blob | null) => {
      if (!blob) return
      onCapture(new File([blob], `${facing}-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      stop(); onClose()
    }
    if (typeof canvas.toBlob === 'function') canvas.toBlob(finish, 'image/jpeg', 0.85)
    else finish(new Blob([canvas.toDataURL('image/jpeg', 0.85)], { type: 'image/jpeg' }))
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" role="dialog" aria-label={title} data-testid={`${testId}-camera`}>
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-sm font-black">{title}</span>
        <button type="button" onClick={() => { stop(); onClose() }} aria-label="إغلاق" className="rounded-full bg-white/20 p-2" data-testid={`${testId}-camera-close`}><X size={18} /></button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} data-testid={`${testId}-video`} />
        {error && <p className="absolute inset-x-4 top-4 rounded-xl bg-rose-600/90 p-3 text-center text-sm font-bold text-white" role="alert">{error}</p>}
      </div>
      <div className="flex items-center justify-center gap-6 p-5">
        {error ? (
          <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-900">
            <RefreshCw size={16} />استخدام كاميرا الجهاز
            <input type="file" accept="image/*" capture={facing} className="hidden" data-testid={`${testId}-fallback`} onChange={(e) => { const f = e.target.files?.[0]; if (f) { onCapture(f); onClose() } }} />
          </label>
        ) : (
          <button type="button" onClick={snap} disabled={!ready} aria-label="التقاط" data-testid={`${testId}-snap`} className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/30 text-white disabled:opacity-40"><Camera size={26} /></button>
        )}
      </div>
    </div>
  )
}

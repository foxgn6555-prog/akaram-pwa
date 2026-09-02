/**
 * نافذة التقاط صورة بالكاميرا (getUserMedia) — التقاط مباشر من التطبيق:
 *  · تفضيل الكاميرا الخلفية (environment) مع زر تبديل أمامية/خلفية
 *  · الالتقاط: إطار الفيديو → canvas → File (jpeg) يُمرَّر للمُستدعي ثم تُغلق النافذة
 *  · تنظيف مسار الكاميرا (tracks.stop) عند الإغلاق/التبديل — لا تسريب موارد
 *  · رسائل خطأ عربية واضحة (إذن مرفوض / لا كاميرا / متصفح غير آمن)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@components/ui/Icon/Icon'

export interface CameraCaptureProps {
  open: boolean
  onClose: () => void
  /** يُستدعى بملف الصورة الملتقطة (jpeg) */
  onCapture: (file: File) => void
}

type Facing = 'environment' | 'user'
type CamState = 'starting' | 'ready' | 'error'

export function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<Facing>('environment')
  const [state, setState] = useState<CamState>('starting')
  const [errMsg, setErrMsg] = useState('')

  const stopStream = useCallback((): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState('starting')
    setErrMsg('')
    const start = async (): Promise<void> => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('المتصفح لا يدعم الكاميرا — افتح التطبيق عبر اتصال آمن (HTTPS) أو استخدم زر اختيار ملف')
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => undefined)
        }
        setState('ready')
      } catch (e) {
        if (cancelled) return
        const name = (e as DOMException)?.name
        setErrMsg(
          name === 'NotAllowedError'
            ? 'رُفض إذن الكاميرا — اسمح بالوصول من إعدادات المتصفح ثم أعد المحاولة'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'لا توجد كاميرا متاحة على هذا الجهاز'
              : (e as Error)?.message || 'تعذّر تشغيل الكاميرا',
        )
        setState('error')
      }
    }
    void start()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [open, facing, stopStream])

  // إغلاق بمفتاح Escape
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, onClose])

  if (!open) return null

  const capture = (): void => {
    const video = videoRef.current
    if (!video || state !== 'ready') return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        onCapture(new File([blob], `كاميرا-${stamp}.jpg`, { type: 'image/jpeg' }))
        onClose()
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="التقاط صورة بالكاميرا"
      data-testid="camera-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-bold text-white">التقاط صورة</p>
          <button
            type="button"
            onClick={onClose}
            data-testid="camera-close"
            aria-label="إغلاق الكاميرا"
            className="flex size-9 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            data-testid="camera-video"
            className={state === 'ready' ? 'size-full object-cover' : 'hidden'}
          />
          {state !== 'ready' && (
            <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
              {state === 'starting' ? (
                <span className="text-sm text-slate-300" data-testid="camera-starting">
                  جارٍ تشغيل الكاميرا…
                </span>
              ) : (
                <>
                  <Icon name="camera" size={30} className="text-slate-400" />
                  <p className="text-sm text-slate-200" data-testid="camera-error">
                    {errMsg}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            data-testid="camera-flip"
            aria-label="تبديل الكاميرا"
            className="flex size-11 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10"
          >
            <Icon name="refresh" size={18} />
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={state !== 'ready'}
            data-testid="camera-shot"
            aria-label="التقاط الصورة"
            className="flex size-14 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg transition-transform hover:scale-105 disabled:opacity-40"
          >
            <Icon name="camera" size={24} />
          </button>
          <span className="size-11" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
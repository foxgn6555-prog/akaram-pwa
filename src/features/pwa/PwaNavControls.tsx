/**
 * أزرار تنقّل داخل التطبيق المثبّت (standalone): رجوع/تقدم/تحديث.
 * في وضع المتصفح العادي لا تظهر (شريط المتصفح موجود). في PWA تعطّل الأزرار عند عدم وجود تاريخ كافٍ.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'
import { isStandalone } from './pwa.store'

function historyIndex(): number {
  const state = window.history.state as { idx?: number } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}

export function PwaNavControls({ onRefresh = () => window.location.reload() }: { onRefresh?: () => void } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const [standalone] = useState(() => isStandalone())
  const [idx, setIdx] = useState(() => historyIndex())
  // بعد إعادة تحميل قد تبقى صفحات «أمام» في تاريخ الجلسة؛ history.length يكشفها دون تفعيل تقدم وهمي بعد PUSH جديد.
  const maxIdx = useRef(Math.max(idx, typeof window === 'undefined' ? idx : window.history.length - 1))

  useEffect(() => {
    const current = historyIndex()
    // PUSH جديد يقصّ أي «تقدم» قديم في تاريخ المتصفح؛ لا تبقِ الزر مفعّلاً لصفحة لم تعد موجودة.
    maxIdx.current = navigationType === 'PUSH' ? current : Math.max(maxIdx.current, current)
    setIdx(current)
  }, [location.key, navigationType])

  useEffect(() => {
    const onPop = (): void => {
      const current = historyIndex()
      maxIdx.current = Math.max(maxIdx.current, current)
      setIdx(current)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (!standalone) return null
  const canBack = idx > 0
  const canForward = idx < Math.max(maxIdx.current, window.history.length - 1)

  return (
    <div data-testid="pwa-nav-controls" className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1" role="toolbar" aria-label="تنقل التطبيق">
      <button
        type="button"
        data-testid="pwa-nav-back"
        aria-label="رجوع"
        title="رجوع"
        disabled={!canBack}
        onClick={() => navigate(-1)}
        className="flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowRight size={17} aria-hidden />
      </button>
      <button
        type="button"
        data-testid="pwa-nav-forward"
        aria-label="تقدم"
        title="تقدم"
        disabled={!canForward}
        onClick={() => navigate(1)}
        className="flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowLeft size={17} aria-hidden />
      </button>
      <button
        type="button"
        data-testid="pwa-nav-refresh"
        aria-label="تحديث الصفحة"
        title="تحديث الصفحة"
        onClick={onRefresh}
        className="flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
      >
        <RefreshCw size={16} aria-hidden />
      </button>
    </div>
  )
}

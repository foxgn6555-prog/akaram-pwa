/**
 * أزرار تنقّل للكمبيوتر فقط: رجوع/تقدم/تحديث.
 * تُركَّب داخل الهيدر نفسه (لا صف مستقل ولا عنصر عائم)، وتختفي على الهاتف/التابليت
 * حتى لو كان التطبيق مثبّتًا أو أفقيًا. تعطّل الأزرار عند عدم وجود تاريخ كافٍ.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'
import { useResponsive } from '@lib/utils/useResponsive'
import { detectPlatform } from './pwa.store'

function historyIndex(): number {
  const state = window.history.state as { idx?: number } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}

export function PwaNavControls({ onRefresh = () => window.location.reload() }: { onRefresh?: () => void } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const { isDesktop } = useResponsive()
  // عرض كبير وحده لا يكفي: هاتف أفقي/محاكاة هاتف قد يتجاوز 1024px.
  const isComputer = isDesktop && detectPlatform() === 'other'
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

  if (!isComputer) return null
  const canBack = idx > 0
  const canForward = idx < Math.max(maxIdx.current, window.history.length - 1)

  return (
    <div
      data-testid="pwa-nav-controls"
      className="hidden shrink-0 items-center gap-0.5 border-s border-slate-200 ps-1 -me-3 sm:-me-6 lg:flex"
      role="toolbar"
      aria-label="تنقل التطبيق"
    >
      <button
        type="button"
        data-testid="pwa-nav-back"
        aria-label="رجوع"
        title="رجوع"
        disabled={!canBack}
        onClick={() => navigate(-1)}
        className="flex size-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowRight size={16} aria-hidden />
      </button>
      <button
        type="button"
        data-testid="pwa-nav-forward"
        aria-label="تقدم"
        title="تقدم"
        disabled={!canForward}
        onClick={() => navigate(1)}
        className="flex size-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ArrowLeft size={16} aria-hidden />
      </button>
      <button
        type="button"
        data-testid="pwa-nav-refresh"
        aria-label="تحديث الصفحة"
        title="تحديث الصفحة"
        onClick={onRefresh}
        className="flex size-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
      >
        <RefreshCw size={15} aria-hidden />
      </button>
    </div>
  )
}

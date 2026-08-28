import { Component, type ErrorInfo, type ReactNode } from 'react'
import { handleAppError } from '@lib/errors/error.handler'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/** حاجز الأخطاء — يرسل للمراقبة ويعرض رسالة آمنة */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    handleAppError(error, { componentStack: info.componentStack })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 className="text-xl font-bold text-slate-900">حدث خطأ غير متوقع</h1>
            <p className="text-sm text-slate-500">سجّلنا الخطأ ونعمل على إصلاحه.</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm text-white"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mutationQueue } from '@lib/offline/mutation-queue'

/** شريط Offline — يظهر عند انقطاع الشبكة ويعد بالطابور (ADR 006) */
export function OfflineBanner() {
  const { t } = useTranslation('common')
  const [offline, setOffline] = useState(!navigator.onLine)
  const [queued, setQueued] = useState(0)

  useEffect(() => {
    const goOnline = (): void => {
      setOffline(false)
      void mutationQueue.flush().then(() => setQueued(mutationQueue.size))
    }
    const goOffline = (): void => {
      setOffline(true)
      setQueued(mutationQueue.size)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!offline && queued === 0) return null

  return (
    <div role="status" className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
      {offline ? t('state.offline') : `جارٍ مزامنة ${queued} عملية معلقة…`}
    </div>
  )
}

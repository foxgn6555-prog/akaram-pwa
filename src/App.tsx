/** جذر التطبيق — تركيب المزودات فقط، لا منطق أعمال */
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { queryClient } from '@config/query-client.config'
import { router } from '@router/index'
import { ErrorBoundary } from '@components/feedback/ErrorBoundary'
import { OfflineBanner } from '@components/feedback/OfflineBanner'
import './i18n'

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

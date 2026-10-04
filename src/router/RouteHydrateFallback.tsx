/** شاشة أثناء تنفيذ loaders التحقق من الجلسة — بدونها يحذّر React Router v7 «No HydrateFallback element provided» في كل تحميل أولي */
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

export function RouteHydrateFallback() { return <LoadingSpinner fullScreen /> }

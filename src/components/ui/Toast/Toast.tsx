import{useEffect}from'react'
import{useUiStore,type Toast as ToastMessage}from'@stores/ui.store'
import clsx from'clsx'

const typeStyles={info:'bg-slate-800',success:'bg-emerald-600',warning:'bg-amber-500',error:'bg-red-600'}as const
const lifetime={success:3500,info:4500,warning:5500,error:7000}as const

/** حاوية رسائل الإجراءات — تختفي تلقائياً، ويمكن إغلاقها بالنقر. */
export function Toaster(){const toasts=useUiStore(s=>s.toasts);if(!toasts.length)return null;return <div aria-live="polite" aria-atomic="false" className="fixed bottom-4 start-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col gap-2">{toasts.map(toast=><ToastItem key={toast.id} toast={toast}/>)}</div>}
function ToastItem({toast}:{toast:ToastMessage}){const dismiss=useUiStore(s=>s.dismissToast);useEffect(()=>{const timer=window.setTimeout(()=>dismiss(toast.id),lifetime[toast.type]);return()=>window.clearTimeout(timer)},[dismiss,toast.id,toast.type]);return <button type="button" onClick={()=>dismiss(toast.id)} className={clsx('max-w-md rounded-xl px-4 py-3 text-right text-sm text-white shadow-lg transition animate-in fade-in slide-in-from-bottom-2',typeStyles[toast.type])}>{toast.message}<span className="mt-1 block text-[10px] opacity-70">يختفي تلقائياً · اضغط للإغلاق</span></button>}
